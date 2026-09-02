// Admin-only Hologram operations: config check, list SIMs, bulk import,
// activate/suspend, usage sync, connection test and SIM→vehicle linking.
// Every state-changing action is logged to iot_audit_log for traceability.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { bytesToMb, hologram, monthlyUsageBytes, normalizeDevice } from "../_shared/hologram-client.ts";

const Body = z.object({
  action: z.enum([
    "status",
    "test_connection",
    "list_sims",
    "import_sims",
    "activate_sim",
    "suspend_sim",
    "resume_sim",
    "change_plan",
    "set_data_limit",
    "sync_usage",
    "sync_one_usage",
    "link_sim",
    "unlink_sim",
    // Full dashboard embedding
    "account",
    "list_orgs",
    "list_plans",
    "list_tags",
    "list_devices",
    "get_device",
    "device_location",
    "device_data",
    "rename_device",
    "send_sms",
    // One-click onboarding + scheduled sync controls
    "onboard_sim",
    "run_sync",
    "deactivate_sim",
    "balance",
    "open_sessions",
    "device_locations",
    "device_detail",
  ]),
  sim_id: z.string().min(1).max(64).optional(),
  sim_row_id: z.string().uuid().optional(),
  plan_id: z.number().int().positive().optional(),
  zone: z.string().min(1).max(32).optional(),
  limit_bytes: z.number().int().min(0).optional(),
  device_id_ext: z.union([z.string().min(1).max(64), z.number().int()]).optional(),
  name: z.string().min(1).max(120).optional(),
  message: z.string().min(1).max(1600).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  device_id: z.string().uuid().nullable().optional(),
});


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u, error: uErr } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return json({ error: "Unauthenticated" }, 401);
    const actor = u.user.id;
    // Authoritative role check against user_roles with the service client
    // (bypasses RLS). The has_role RPC can fail silently under some grants.
    const { data: roleRows } = await supa
      .from("user_roles")
      .select("role")
      .eq("user_id", actor)
      .in("role", ["admin", "iot_support"]);
    const allowed = (roleRows ?? []).length > 0;
    if (!allowed) return json({ error: "Admin only" }, 403);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const {
      action, sim_id, sim_row_id, plan_id, zone, limit_bytes,
      device_id_ext, name, message, limit, vehicle_id, device_id,
    } = parsed.data;


    const audit = async (
      row: { action: string; sim_id?: string | null; vehicle_id?: string | null; device_id?: string | null; details?: Record<string, unknown> },
    ) => {
      await supa.from("iot_audit_log").insert({
        performed_by: actor,
        action: row.action,
        sim_id: row.sim_id ?? null,
        vehicle_id: row.vehicle_id ?? null,
        device_id: row.device_id ?? null,
        details: row.details ?? {},
      } as never);
    };

    await hologram.ensureReady();

    if (!hologram.isConfigured()) {
      return json({
        ok: true,
        configured: false,
        message:
          "Hologram is not configured. Add HOLOGRAM_API_KEY and HOLOGRAM_ORG_ID secrets to enable SIM provisioning, usage sync, and lifecycle actions.",
      });
    }

    if (action === "status" || action === "test_connection") {
      const probe = await hologram.listSims(1);
      if (action === "test_connection") {
        await audit({ action: "hologram_connection_tested", details: { ok: probe.ok } });
      }
      return json({ ok: probe.ok, configured: true, probe });
    }

    /* ---------------- One-click SIM/device onboarding ---------------- */

    if (action === "onboard_sim") {
      if (!sim_id) return json({ error: "sim_id (ICCID or Hologram SIM id) required" }, 400);

      const steps: Array<{ step: string; ok: boolean; detail?: unknown }> = [];

      // Resolve the identifier against the org inventory (accepts ICCID or device id).
      const inv = await hologram.listAllSims(1000);
      if (!inv.ok) {
        return json({ ok: false, error: "Could not read the Hologram SIM inventory", detail: inv }, 502);
      }
      const rows = Array.isArray(inv.data) ? inv.data : [];
      const needle = sim_id.trim().toLowerCase();
      const match = rows.find((d) => {
        const n = normalizeDevice(d);
        return [n.device_id, n.iccid, n.msisdn].filter(Boolean)
          .some((v) => String(v).toLowerCase() === needle);
      });
      if (!match) {
        return json({
          ok: false,
          error: `No SIM matching "${sim_id}" exists in Hologram org ${hologram.orgId()}. Confirm the SIM was added to the RENTMAIKAR organization.`,
        }, 404);
      }
      const matched = normalizeDevice(match);
      steps.push({ step: "resolved_in_hologram", ok: true, detail: { id: matched.device_id, iccid: matched.iccid } });

      const providerSimId = matched.device_id ?? "";
      const iccid = matched.iccid ?? providerSimId;

      // Activate on the chosen plan when requested.
      if (plan_id) {
        const act = await hologram.activateSim(providerSimId, plan_id, zone);
        steps.push({ step: "activated", ok: act.ok, detail: act.ok ? { plan_id, zone } : act });
      }

      // Optional monthly data ceiling.
      if (limit_bytes !== undefined) {
        const lim = await hologram.setDataLimit(providerSimId, limit_bytes);
        steps.push({ step: "data_limit_set", ok: lim.ok, detail: lim.ok ? { limit_bytes } : lim });
      }

      // Re-read authoritative state after the writes.
      const fresh = await hologram.getSim(providerSimId);
      const freshRaw = fresh.ok ? fresh.data : match;
      const freshData = normalizeDevice(freshRaw);

      const { data: row, error: upErr } = await supa
        .from("iot_sim_cards")
        .upsert({
          iccid,
          provider: "hologram",
          provider_sim_id: providerSimId,
          msisdn: freshData.msisdn,
          imsi: freshData.imsi,
          status: freshData.state ?? "unknown",
          plan_name: freshData.plan_id ? String(freshData.plan_id) : null,
          data_limit_mb: limit_bytes !== undefined ? Math.round(limit_bytes / 1_000_000) : undefined,
          activated_at: plan_id ? new Date().toISOString() : undefined,
          vehicle_id: vehicle_id ?? undefined,
          device_id: device_id ?? undefined,
          metadata: freshRaw as never,
        } as never, { onConflict: "iccid" })
        .select("*")
        .maybeSingle();

      if (upErr) return json({ ok: false, error: upErr.message, steps }, 400);
      steps.push({ step: "registered_in_dashboard", ok: true, detail: { sim_row_id: row?.id } });

      if (vehicle_id) steps.push({ step: "linked_to_vehicle", ok: true, detail: { vehicle_id } });

      // Name the Hologram device record for easy identification.
      if (device_id_ext !== undefined && name) {
        const rn = await hologram.setDeviceName(device_id_ext, name);
        steps.push({ step: "device_renamed", ok: rn.ok, detail: rn.ok ? { name } : rn });
      }

      await audit({
        action: "hologram_sim_onboarded",
        sim_id: row?.id,
        vehicle_id: vehicle_id ?? null,
        device_id: device_id ?? null,
        details: { iccid, provider_sim_id: providerSimId, plan_id, zone, steps },
      });

      await supa.from("iot_sync_activity_log").insert({
        provider: "hologram",
        event: "sim_onboarded",
        level: steps.every((s) => s.ok) ? "info" : "warn",
        message: `SIM ${iccid} onboarded into org ${hologram.orgId()}`,
        details: { steps, sim_row_id: row?.id },
      } as never);

      return json({ ok: steps.every((s) => s.ok), steps, row });
    }

    /* ---------------- Run the scheduled sync on demand ---------------- */

    if (action === "run_sync") {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/hologram-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: "{}",
      });
      const body = await r.json().catch(() => null);
      await audit({ action: "hologram_sync_run_manually", details: { status: r.status } });
      return json({ ok: r.ok, status: r.status, result: body });
    }



    if (action === "list_sims") {
      const r = await hologram.listSims(100);
      return json({ ...r, ok: r.ok });
    }

    if (action === "import_sims") {
      const r = await hologram.listAllSims(1000);
      if (!r.ok) return json({ ...r, ok: false }, 502);
      const rows = Array.isArray(r.data) ? r.data : [];
      let imported = 0;
      for (const raw of rows) {
        const n = normalizeDevice(raw);
        const providerSimId = n.device_id ?? "";
        const iccid = n.iccid ?? providerSimId;
        if (!iccid) continue;
        const payload = {
          iccid,
          provider: "hologram",
          provider_sim_id: providerSimId,
          msisdn: n.msisdn,
          imsi: n.imsi,
          status: n.state ?? "unknown",
          plan_name: n.plan_id ? String(n.plan_id) : null,
          metadata: raw as never,
        };
        const { error } = await supa.from("iot_sim_cards").upsert(payload, { onConflict: "iccid" });
        if (!error) imported++;
      }
      await audit({ action: "hologram_bulk_import", details: { imported, total: rows.length } });
      return json({ ok: true, imported, total: rows.length });
    }

    if (action === "activate_sim") {
      if (!sim_id || !plan_id) return json({ error: "sim_id and plan_id required" }, 400);
      const r = await hologram.activateSim(sim_id, plan_id, zone ?? "global");
      if (r.ok) {
        const { data: row } = await supa
          .from("iot_sim_cards")
          .update({ status: "live", activated_at: new Date().toISOString(), suspended_at: null })
          .eq("provider_sim_id", sim_id)
          .select("id, vehicle_id, device_id")
          .maybeSingle();
        await audit({
          action: "hologram_sim_activated",
          sim_id: row?.id,
          vehicle_id: row?.vehicle_id,
          device_id: row?.device_id,
          details: { provider_sim_id: sim_id, plan_id },
        });
      }
      return json({ ...r, ok: r.ok });
    }

    if (action === "suspend_sim") {
      if (!sim_id) return json({ error: "sim_id required" }, 400);
      const r = await hologram.suspendSim(sim_id);
      if (r.ok) {
        const { data: row } = await supa
          .from("iot_sim_cards")
          .update({ status: "paused", suspended_at: new Date().toISOString() })
          .eq("provider_sim_id", sim_id)
          .select("id, vehicle_id, device_id")
          .maybeSingle();
        await audit({
          action: "hologram_sim_suspended",
          sim_id: row?.id,
          vehicle_id: row?.vehicle_id,
          device_id: row?.device_id,
          details: { provider_sim_id: sim_id },
        });
      }
      return json({ ...r, ok: r.ok });
    }

    if (action === "sync_one_usage") {
      if (!sim_id) return json({ error: "sim_id required" }, 400);
      const info = await hologram.getSim(sim_id);
      if (!info.ok) return json({ ...info, ok: false }, 502);
      const n = normalizeDevice(info.data);
      const usage = n.link_id ? await hologram.getSimUsage(sim_id, n.link_id) : null;
      const dataMb = usage?.ok ? bytesToMb(monthlyUsageBytes(usage.data)) : null;
      const { data: row } = await supa
        .from("iot_sim_cards")
        .update({
          status: n.state ?? undefined,
          msisdn: n.msisdn ?? undefined,
          imsi: n.imsi ?? undefined,
          data_usage_mb: dataMb ?? undefined,
          last_session_at: new Date().toISOString(),
          metadata: info.data as never,
        })
        .eq("provider_sim_id", sim_id)
        .select("id")
        .maybeSingle();
      await audit({
        action: "hologram_sim_usage_synced",
        sim_id: row?.id,
        details: { state: n.state, usage_mb: dataMb },
      });
      return json({ ok: true, state: n.state, usage_mb: dataMb });
    }

    if (action === "sync_usage") {
      const { data: sims } = await supa
        .from("iot_sim_cards")
        .select("id, provider_sim_id")
        .eq("provider", "hologram")
        .not("provider_sim_id", "is", null)
        .limit(200);
      let updated = 0;
      for (const sim of sims || []) {
        const info = await hologram.getSim(sim.provider_sim_id as string);
        if (!info.ok) continue;
        const n = normalizeDevice(info.data);
        const usage = n.link_id ? await hologram.getSimUsage(sim.provider_sim_id as string, n.link_id) : null;
        const dataMb = usage?.ok ? bytesToMb(monthlyUsageBytes(usage.data)) : null;
        await supa
          .from("iot_sim_cards")
          .update({
            status: n.state ?? undefined,
            msisdn: n.msisdn ?? undefined,
            imsi: n.imsi ?? undefined,
            data_usage_mb: dataMb ?? undefined,
            last_session_at: new Date().toISOString(),
            metadata: info.data as never,
          })
          .eq("id", sim.id);
        updated++;
      }
      await audit({ action: "hologram_bulk_usage_sync", details: { updated } });
      return json({ ok: true, updated });
    }

    if (action === "link_sim" || action === "unlink_sim") {
      if (!sim_row_id) return json({ error: "sim_row_id required" }, 400);
      const payload = action === "unlink_sim"
        ? { vehicle_id: null, device_id: null }
        : { vehicle_id: vehicle_id ?? null, device_id: device_id ?? null };
      const { data: row, error } = await supa
        .from("iot_sim_cards")
        .update(payload)
        .eq("id", sim_row_id)
        .select("id, iccid, vehicle_id, device_id")
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      await audit({
        action: action === "unlink_sim" ? "hologram_sim_unlinked" : "hologram_sim_linked",
        sim_id: row?.id,
        vehicle_id: row?.vehicle_id,
        device_id: row?.device_id,
        details: { iccid: row?.iccid },
      });
      return json({ ok: true, row });
    }

    /* ---------------- Read-only dashboard mirrors ---------------- */

    if (action === "account") {
      const r = await hologram.me();
      return json({ ...r, ok: r.ok, org_id: hologram.orgId() });
    }

    if (action === "list_orgs") {
      const r = await hologram.listOrganizations();
      return json({ ...r, ok: r.ok });
    }

    if (action === "list_plans") {
      const r = await hologram.listPlans();
      return json({ ...r, ok: r.ok });
    }

    if (action === "balance") {
      const r = await hologram.getBalance();
      await audit({
        action: "hologram_org_balance_viewed",
        details: { ok: r.ok, status: (r as { status?: number }).status ?? null },
      });
      return json({ ...r, ok: r.ok });
    }

    if (action === "open_sessions") {
      const r = await hologram.listOpenSessions();
      await audit({
        action: "hologram_open_sessions_viewed",
        details: {
          ok: r.ok,
          status: (r as { status?: number }).status ?? null,
          count: Array.isArray(r.data) ? r.data.length : null,
        },
      });
      return json({ ...r, ok: r.ok });
    }

    if (action === "device_detail") {
      if (device_id_ext === undefined) return json({ error: "device_id_ext required" }, 400);
      const dev = await hologram.getDevice(device_id_ext);
      const normalized = dev.ok && dev.data ? normalizeDevice(dev.data as never) : null;
      const [usage, loc] = await Promise.all([
        hologram.getSimUsage(device_id_ext, normalized?.link_id ?? undefined),
        hologram.getDeviceLocation(device_id_ext),
      ]);
      const usageBytes = usage.ok ? monthlyUsageBytes(usage.data) : null;
      await audit({
        action: "hologram_device_detail_viewed",
        sim_id: normalized?.iccid ?? null,
        details: {
          device_id_ext,
          device_status: (dev as { status?: number }).status ?? null,
          device_ok: dev.ok,
          usage_ok: usage.ok,
          usage_status: (usage as { status?: number }).status ?? null,
          location_ok: loc.ok,
          location_status: (loc as { status?: number }).status ?? null,
          usage_mb: bytesToMb(usageBytes),
        },
      });
      return json({
        ok: dev.ok,
        device: dev.ok ? dev.data : null,
        normalized,
        usage: {
          ok: usage.ok,
          bytes: usageBytes,
          mb: bytesToMb(usageBytes),
          raw: usage.ok ? usage.data : null,
          error: usage.ok ? null : (usage as { error?: string }).error ?? null,
        },
        location: {
          ok: loc.ok,
          data: loc.ok ? loc.data : null,
          error: loc.ok ? null : (loc as { error?: string }).error ?? null,
        },
        error: dev.ok ? null : (dev as { error?: string }).error ?? null,
      });
    }

    if (action === "device_locations") {
      const r = await hologram.listDeviceLocations(
        device_id_ext !== undefined ? [device_id_ext] : undefined,
        limit ?? 500,
      );
      await audit({
        action: "hologram_device_locations_viewed",
        details: {
          ok: r.ok,
          status: (r as { status?: number }).status ?? null,
          device_id_ext: device_id_ext ?? null,
          count: Array.isArray(r.data) ? r.data.length : null,
        },
      });
      return json({ ...r, ok: r.ok });
    }

    if (action === "deactivate_sim") {
      if (!sim_id) return json({ error: "sim_id required" }, 400);
      const r = await hologram.deactivateSim(sim_id);
      if (r.ok) {
        await supa
          .from("iot_sim_cards")
          .update({ status: "deactivated", suspended_at: new Date().toISOString() })
          .eq("provider_sim_id", sim_id);
      }
      await audit({ action: "hologram_sim_deactivated", details: { provider_sim_id: sim_id, ok: r.ok } });
      return json({ ...r, ok: r.ok });
    }

    if (action === "list_tags") {
      const r = await hologram.listTags();
      return json({ ...r, ok: r.ok });
    }

    if (action === "list_devices") {
      const r = await hologram.listDevices(limit ?? 100);
      return json({ ...r, ok: r.ok });
    }

    if (action === "get_device") {
      if (device_id_ext === undefined) return json({ error: "device_id_ext required" }, 400);
      const r = await hologram.getDevice(device_id_ext);
      return json({ ...r, ok: r.ok });
    }

    if (action === "device_location") {
      if (device_id_ext === undefined) return json({ error: "device_id_ext required" }, 400);
      const r = await hologram.getDeviceLocation(device_id_ext);
      return json({ ...r, ok: r.ok });
    }

    if (action === "device_data") {
      if (device_id_ext === undefined) return json({ error: "device_id_ext required" }, 400);
      const r = await hologram.getDeviceData(device_id_ext, limit ?? 25);
      return json({ ...r, ok: r.ok });
    }

    /* ---------------- Write operations ---------------- */

    if (action === "rename_device") {
      if (device_id_ext === undefined || !name) return json({ error: "device_id_ext and name required" }, 400);
      const r = await hologram.setDeviceName(device_id_ext, name);
      await audit({
        action: "hologram_device_renamed",
        details: { device_id_ext, name, ok: r.ok },
      });
      return json({ ...r, ok: r.ok });
    }

    if (action === "send_sms") {
      if (device_id_ext === undefined || !message) return json({ error: "device_id_ext and message required" }, 400);
      const r = await hologram.sendSms(Number(device_id_ext), message);
      await audit({
        action: "hologram_sms_sent",
        details: { device_id_ext, length: message.length, ok: r.ok },
      });
      return json({ ...r, ok: r.ok });
    }

    if (action === "resume_sim") {
      if (!sim_id) return json({ error: "sim_id required" }, 400);
      const r = await hologram.resumeSim(sim_id);
      if (r.ok) {
        await supa
          .from("iot_sim_cards")
          .update({ status: "live", suspended_at: null })
          .eq("provider_sim_id", sim_id);
      }
      await audit({ action: "hologram_sim_resumed", details: { provider_sim_id: sim_id, ok: r.ok } });
      return json({ ...r, ok: r.ok });
    }

    if (action === "change_plan") {
      if (!sim_id || !plan_id) return json({ error: "sim_id and plan_id required" }, 400);
      const r = await hologram.changePlan(sim_id, plan_id, zone);
      await audit({ action: "hologram_sim_plan_changed", details: { provider_sim_id: sim_id, plan_id, zone, ok: r.ok } });
      return json({ ...r, ok: r.ok });
    }

    if (action === "set_data_limit") {
      if (!sim_id || limit_bytes === undefined) return json({ error: "sim_id and limit_bytes required" }, 400);
      const r = await hologram.setDataLimit(sim_id, limit_bytes);
      if (r.ok) {
        await supa
          .from("iot_sim_cards")
          .update({ data_limit_mb: Math.round(limit_bytes / 1_000_000) })
          .eq("provider_sim_id", sim_id);
      }
      await audit({ action: "hologram_sim_data_limit_set", details: { provider_sim_id: sim_id, limit_bytes, ok: r.ok } });
      return json({ ...r, ok: r.ok });
    }

    return json({ error: "Unsupported action" }, 400);

  } catch (e) {
    console.error("hologram-admin error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
