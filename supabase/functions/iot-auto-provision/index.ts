// Automatic IoT provisioning worker.
//
// Pipeline (bounded, idempotent, single-flight):
//   1. Link provisioned/available SIM cards to unlinked tracking devices  -> enables the device
//   2. Activate devices that now have a SIM                               -> telemetry enabled
//   3. Link enabled devices to published vehicles                         -> vehicle provisioned
//   4. Run a provisioning self-test on each provisioned vehicle           -> ready for matching
//
// Auth: CRON_SECRET header, service-role bearer, or an admin/iot_support JWT
// (so admins can trigger a run from the dashboard).
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const LEASE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

type Json = Record<string, unknown>;

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authorize(req: Request): Promise<{ ok: boolean; actor: string }> {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (provided) {
    if (CRON_SECRET && provided === CRON_SECRET) return { ok: true, actor: "cron" };
    // The environment copy of the cron token can drift from the stored one, so
    // fall back to verifying against the value held in the database.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: tokenOk } = await admin.rpc("verify_cron_token", { _token: provided });
    if (tokenOk === true) return { ok: true, actor: "cron" };
  }

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer && bearer === SERVICE_KEY) return { ok: true, actor: "service" };
  if (!bearer) return { ok: false, actor: "anonymous" };


  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return { ok: false, actor: "anonymous" };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const allowed = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "iot_support");
  return { ok: allowed, actor: uid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await authorize(req);
  if (!auth.ok) return json({ error: "Unauthorized" }, 401);

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const errors: Json[] = [];

  // ---- Paused-state guard + single-flight lease -----------------------------
  const { data: control } = await supa
    .from("iot_provisioning_control")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (!control) return json({ error: "Provisioning control row missing" }, 500);
  if (control.paused) {
    return json({ ok: true, skipped: "paused", reason: control.pause_reason ?? null });
  }

  const now = new Date();
  const leaseFree = !control.lease_expires_at || new Date(control.lease_expires_at) < now;
  if (!leaseFree) {
    return json({ ok: true, skipped: "run_in_progress", lease_expires_at: control.lease_expires_at });
  }

  const leaseOwner = crypto.randomUUID();
  const leaseExpires = new Date(now.getTime() + LEASE_MINUTES * 60_000).toISOString();
  const { data: leased } = await supa
    .from("iot_provisioning_control")
    .update({ lease_owner: leaseOwner, lease_expires_at: leaseExpires })
    .eq("id", true)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`)
    .select("lease_owner")
    .maybeSingle();

  if (!leased || leased.lease_owner !== leaseOwner) {
    return json({ ok: true, skipped: "lease_contended" });
  }

  const batch = Math.max(1, Math.min(200, Number(control.batch_size) || 25));
  const { data: run } = await supa
    .from("iot_provisioning_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  const counters = { sims_linked: 0, devices_enabled: 0, vehicles_linked: 0, vehicles_tested: 0, vehicles_ready: 0 };

  try {
    // ---- Step 1: link provisioned SIMs to available devices -----------------
    const { data: freeSims } = await supa
      .from("iot_sim_cards")
      .select("id, iccid, msisdn, provider, status, device_id")
      .is("device_id", null)
      .in("status", ["available", "provisioned", "active"])
      .order("created_at", { ascending: true })
      .limit(batch);

    for (const sim of freeSims ?? []) {
      try {
        // Prefer a device that already references this SIM (imported hardware pairing).
        let device: { id: string } | null = null;
        if (sim.iccid || sim.msisdn) {
          const match = [sim.iccid, sim.msisdn].filter(Boolean) as string[];
          const { data: paired } = await supa
            .from("iot_devices")
            .select("id")
            .in("sim_number", match)
            .is("vehicle_id", null)
            .limit(1);
          device = paired?.[0] ?? null;
        }
        if (!device) {
          const { data: spare } = await supa
            .from("iot_devices")
            .select("id")
            .is("sim_number", null)
            .is("vehicle_id", null)
            .order("created_at", { ascending: true })
            .limit(1);
          device = spare?.[0] ?? null;
        }
        if (!device) break; // no hardware left this run

        const { error: simErr } = await supa
          .from("iot_sim_cards")
          .update({ device_id: device.id, status: "active", activated_at: sim.status === "active" ? undefined : new Date().toISOString() })
          .eq("id", sim.id)
          .is("device_id", null);
        if (simErr) throw simErr;

        await supa
          .from("iot_devices")
          .update({ sim_number: sim.msisdn ?? sim.iccid, sim_provider: sim.provider })
          .eq("id", device.id);

        counters.sims_linked += 1;
      } catch (e) {
        errors.push({ step: "link_sim", sim_id: sim.id, message: (e as Error).message });
      }
    }

    // ---- Step 2: enable devices that have a SIM -----------------------------
    const { data: simLinked } = await supa
      .from("iot_sim_cards")
      .select("device_id")
      .not("device_id", "is", null)
      .limit(500);
    const enabledCandidates = [...new Set((simLinked ?? []).map((s: { device_id: string }) => s.device_id))];

    if (enabledCandidates.length) {
      const { data: toEnable } = await supa
        .from("iot_devices")
        .select("id, status, telemetry_enabled")
        .in("id", enabledCandidates)
        .or("status.eq.inactive,telemetry_enabled.eq.false")
        .limit(batch);

      for (const d of toEnable ?? []) {
        const { error } = await supa
          .from("iot_devices")
          .update({
            status: "active",
            telemetry_enabled: true,
            is_linked: true,
            activated_at: new Date().toISOString(),
            health_status: "unknown",
          })
          .eq("id", d.id);
        if (error) errors.push({ step: "enable_device", device_id: d.id, message: error.message });
        else counters.devices_enabled += 1;
      }
    }

    // ---- Step 3: link enabled devices to published vehicles -----------------
    const { data: publishedVehicles, error: vehErr } = await supa
      .from("vehicles")
      .select("id, make, model, license_plate, gps_tracking_enabled, is_public, review_status")
      .eq("is_public", true)
      .eq("review_status", "published")
      .eq("gps_tracking_enabled", true)
      .limit(batch);
    if (vehErr) errors.push({ step: "list_vehicles", message: vehErr.message });
    console.log("published_vehicles", { count: publishedVehicles?.length ?? 0, err: vehErr?.message ?? null });



    for (const v of publishedVehicles ?? []) {
      try {
        const { data: existingDevice } = await supa
          .from("iot_devices")
          .select("id, status, telemetry_enabled")
          .eq("vehicle_id", v.id)
          .limit(1);

        let deviceId = existingDevice?.[0]?.id as string | undefined;

        if (!deviceId) {
          const { data: available } = await supa
            .from("iot_devices")
            .select("id")
            .is("vehicle_id", null)
            .eq("status", "active")
            .eq("telemetry_enabled", true)
            .order("activated_at", { ascending: true })
            .limit(1);
          const candidate = available?.[0];
          if (!candidate) {
            console.log("no_device_available", v.id);
            await upsertState(supa, v.id, { stage: "awaiting_device", last_error: "No enabled device available" });
            continue;
          }
          const { error: linkErr, data: linkedRow } = await supa
            .from("iot_devices")
            .update({
              vehicle_id: v.id,
              is_linked: true,
              installation_status: "confirmed",
              installation_confirmed_at: new Date().toISOString(),
            })
            .eq("id", candidate.id)
            .is("vehicle_id", null)
            .select("id")
            .maybeSingle();
          if (linkErr || !linkedRow) {
            console.error("device_link_failed", v.id, candidate.id, linkErr?.message ?? "no row returned");
            errors.push({ step: "link_device", vehicle_id: v.id, device_id: candidate.id, message: linkErr?.message ?? "no row returned" });
            continue; // lost the race or blocked; retry next run
          }
          deviceId = linkedRow.id;
          counters.vehicles_linked += 1;
        }

        const { data: sim } = await supa
          .from("iot_sim_cards")
          .select("id, status, iccid")
          .eq("device_id", deviceId)
          .limit(1);
        if (sim?.[0]) {
          await supa.from("iot_sim_cards").update({ vehicle_id: v.id }).eq("id", sim[0].id);
        }

        await upsertState(supa, v.id, {
          device_id: deviceId,
          sim_id: sim?.[0]?.id ?? null,
          stage: "provisioned",
          last_error: null,
        });
      } catch (e) {
        errors.push({ step: "link_vehicle", vehicle_id: v.id, message: (e as Error).message });
      }
    }

    // ---- Step 4: test provisioned vehicles ----------------------------------
    const { data: pending } = await supa
      .from("iot_provisioning_state")
      .select("id, vehicle_id, device_id, sim_id, attempts, stage")
      .in("stage", ["provisioned", "test_failed"])
      .lt("attempts", MAX_ATTEMPTS)
      .order("updated_at", { ascending: true })
      .limit(batch);

    for (const st of pending ?? []) {
      try {
        const checks: Json = {};

        const { data: device } = await supa
          .from("iot_devices")
          .select("id, status, telemetry_enabled, vehicle_id, last_ping, health_status, serial_number")
          .eq("id", st.device_id)
          .maybeSingle();
        checks.device_linked = device?.vehicle_id === st.vehicle_id;
        checks.device_active = device?.status === "active";
        checks.telemetry_enabled = device?.telemetry_enabled === true;

        const { data: sim } = st.sim_id
          ? await supa.from("iot_sim_cards").select("id, status, vehicle_id").eq("id", st.sim_id).maybeSingle()
          : { data: null };
        checks.sim_linked = !!sim && sim.vehicle_id === st.vehicle_id;
        checks.sim_active = sim?.status === "active";

        const { data: vehicle } = await supa
          .from("vehicles")
          .select("id, is_public, review_status, pickup_city, gps_tracking_enabled")
          .eq("id", st.vehicle_id)
          .maybeSingle();
        checks.vehicle_published = vehicle?.is_public === true && vehicle?.review_status === "published";
        checks.pickup_location_set = !!vehicle?.pickup_city;

        const { data: telemetry } = await supa
          .from("vehicle_telemetry_state")
          .select("vehicle_id, updated_at")
          .eq("vehicle_id", st.vehicle_id)
          .maybeSingle();
        checks.telemetry_seen = !!telemetry;

        // Required checks: hardware + listing wiring. Live telemetry is informational
        // because a freshly installed device may not have reported yet.
        const required = [
          "device_linked",
          "device_active",
          "telemetry_enabled",
          "sim_linked",
          "sim_active",
          "vehicle_published",
          "pickup_location_set",
        ];
        const failed = required.filter((k) => checks[k] !== true);
        const passed = failed.length === 0;

        await supa
          .from("iot_provisioning_state")
          .update({
            stage: passed ? "ready" : "test_failed",
            test_status: passed ? "passed" : "failed",
            test_details: { checks, failed },
            tested_at: new Date().toISOString(),
            ready_at: passed ? new Date().toISOString() : null,
            attempts: (st.attempts ?? 0) + 1,
            last_error: passed ? null : `Failed checks: ${failed.join(", ")}`,
          })
          .eq("id", st.id);

        if (device?.id) {
          await supa
            .from("iot_devices")
            .update({
              health_status: passed ? "healthy" : "degraded",
              last_health_check_at: new Date().toISOString(),
              health_details: { checks, failed },
            })
            .eq("id", device.id);
        }

        counters.vehicles_tested += 1;
        if (passed) counters.vehicles_ready += 1;
      } catch (e) {
        errors.push({ step: "test_vehicle", vehicle_id: st.vehicle_id, message: (e as Error).message });
      }
    }

    await supa
      .from("iot_provisioning_runs")
      .update({
        ...counters,
        errors,
        status: errors.length ? "completed_with_errors" : "completed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", run?.id);

    return json({ ok: true, run_id: run?.id, ...counters, errors });
  } catch (e) {
    await supa
      .from("iot_provisioning_runs")
      .update({
        ...counters,
        errors: [...errors, { step: "run", message: (e as Error).message }],
        status: "failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", run?.id);
    return json({ error: (e as Error).message }, 500);
  } finally {
    await supa
      .from("iot_provisioning_control")
      .update({ lease_owner: null, lease_expires_at: null, last_run_at: new Date().toISOString() })
      .eq("id", true)
      .eq("lease_owner", leaseOwner);
  }
});

async function upsertState(
  supa: ReturnType<typeof createClient>,
  vehicleId: string,
  patch: Record<string, unknown>,
) {
  const { data: existing } = await supa
    .from("iot_provisioning_state")
    .select("id, stage")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  if (existing) {
    // Never downgrade a vehicle that is already ready.
    if (existing.stage === "ready" && patch.stage !== "ready") return;
    const { error } = await supa.from("iot_provisioning_state").update(patch).eq("id", existing.id);
    if (error) console.error("state_update_failed", vehicleId, error.message);
  } else {
    const { error } = await supa.from("iot_provisioning_state").insert({ vehicle_id: vehicleId, ...patch });
    if (error) console.error("state_insert_failed", vehicleId, error.message);
  }
}
