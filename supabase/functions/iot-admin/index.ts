// Unified IoT admin edge function.
// Actions (POST { action, ... }):
//  - list_plans
//  - purchase_sim { plan_id?, notes? }
//  - list_available_sims
//  - list_devices
//  - register_device { serial_number, imei, device_model, firmware_version?, notes? }
//  - link_sim_to_device { device_imei, sim_id }
//  - activate_pair { device_id }
//  - suspend_pair  { device_id }
//  - readiness_check { device_id }               → verifies SIM is live on Hologram + device healthy
//  - link_to_vehicle { device_id, vehicle_id, force? }
//                                                 → requires readiness pass unless force=true; sets
//                                                   installation_status='pending', telemetry_enabled=false
//  - confirm_installation { device_id, notes? }  → marks installation_status='confirmed' and
//                                                   enables telemetry_enabled=true so the device goes
//                                                   live on maps and starts ingesting telemetry.
//  - unlink_from_vehicle { device_id }
//  - deactivate_device { device_id, reason }     → pauses SIM on Hologram, unlinks vehicle, marks
//                                                   device inactive, telemetry off. Full audit trail.
//  - sync_sim { sim_id }
//  - list_audit { limit? }                       → returns recent iot_audit_log rows
//
// Auth: caller must be admin (public.user_roles.role = 'admin').

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hologram } from "../_shared/hologram-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: corsHeaders });

async function requireAdmin(req: Request, admin: any) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userRes } = await anon.auth.getUser(token);
  if (!userRes?.user) return null;
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id);
  const isAdmin = (roles || []).some((r: any) => r.role === "admin");
  return isAdmin ? userRes.user : null;
}

async function audit(
  admin: any,
  performedBy: string,
  action: string,
  fields: {
    device_id?: string | null;
    sim_id?: string | null;
    vehicle_id?: string | null;
    details?: Record<string, unknown>;
  } = {},
) {
  try {
    await admin.from("iot_audit_log").insert({
      action,
      performed_by: performedBy,
      device_id: fields.device_id ?? null,
      sim_id: fields.sim_id ?? null,
      vehicle_id: fields.vehicle_id ?? null,
      details: fields.details ?? {},
    });
  } catch (e) {
    console.error("iot_audit_log insert failed", e);
  }
}

// Assess device health from local telemetry state.
// Healthy = last_ping within 15 minutes AND (battery null OR >= 20) AND signal null OR >= 20.
function assessHealth(device: any): {
  status: "healthy" | "degraded" | "offline" | "unknown";
  reasons: string[];
  last_ping_minutes_ago: number | null;
} {
  const reasons: string[] = [];
  const last = device?.last_ping ? new Date(device.last_ping).getTime() : null;
  const mins = last ? Math.round((Date.now() - last) / 60000) : null;
  if (mins == null) reasons.push("Device has never reported a ping");
  else if (mins > 60) reasons.push(`Last ping ${mins} min ago (>60m)`);
  else if (mins > 15) reasons.push(`Last ping ${mins} min ago (>15m)`);

  if (typeof device?.battery_level === "number" && device.battery_level < 20)
    reasons.push(`Battery at ${device.battery_level}%`);
  if (typeof device?.signal_strength === "number" && device.signal_strength < 20)
    reasons.push(`Signal at ${device.signal_strength}%`);

  let status: "healthy" | "degraded" | "offline" | "unknown" = "unknown";
  if (mins == null) status = "unknown";
  else if (mins > 60) status = "offline";
  else if (reasons.length > 0) status = "degraded";
  else status = "healthy";

  return { status, reasons, last_ping_minutes_ago: mins };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const user = await requireAdmin(req, admin);
  if (!user) return json(403, { error: "Admin access required" });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  await hologram.ensureReady();

  try {
    switch (action) {
      case "list_plans": {
        if (!hologram.isConfigured()) {
          return json(200, { configured: false, plans: [] });
        }
        const plans = [
          { id: 73, name: "Global Flexible 1 MB", monthly_mb: 1 },
          { id: 128, name: "Global Flexible 10 MB", monthly_mb: 10 },
          { id: 137, name: "Global Flexible 100 MB", monthly_mb: 100 },
        ];
        return json(200, { configured: true, plans });
      }

      case "purchase_sim": {
        const source = String(body?.source || "hologram") === "manual" ? "manual" : "hologram";
        const providerInput = body?.provider ? String(body.provider).trim().toLowerCase() : "";
        const provider = source === "manual" ? (providerInput || "manual") : "hologram";
        const planId = Number(body?.plan_id) || 128;
        const notes = body?.notes ? String(body.notes) : null;

        let providerSimId: string | null = null;
        let iccid = String(body?.iccid || "").trim();
        let msisdn: string | null = body?.msisdn ? String(body.msisdn).trim() : null;
        const imsi: string | null = body?.imsi ? String(body.imsi).trim() : null;
        const planNameInput: string | null = body?.plan_name ? String(body.plan_name).trim() : null;
        let providerState = source === "manual" ? "manual" : "pending";

        if (source === "hologram" && hologram.isConfigured()) {
          const list = await hologram.listSims(1);
          if (list.ok && list.body?.data?.length > 0) {
            const sim = list.body.data[0];
            providerSimId = String(sim.id);
            iccid = iccid || String(sim.iccid || sim.sim || crypto.randomUUID());
            msisdn = msisdn || (sim.msisdn ? String(sim.msisdn) : null);
            providerState = String(sim.state || "pending");
          }
        }

        if (source === "manual" && !iccid) {
          return json(400, { error: "ICCID is required when adding a SIM manually" });
        }
        if (!iccid) iccid = `MOCK-${crypto.randomUUID().slice(0, 12)}`;

        // Prevent duplicate ICCID (also enforced by unique index at the DB level).
        const { data: existing } = await admin
          .from("iot_sim_cards")
          .select("id")
          .eq("iccid", iccid)
          .maybeSingle();
        if (existing) {
          return json(409, { error: "A SIM with this ICCID already exists in the registry" });
        }

        const planName = planNameInput || (source === "hologram" ? `Plan #${planId}` : null);

        const insertPayload: Record<string, unknown> = {
          iccid,
          msisdn,
          imsi,
          provider,
          provider_sim_id: providerSimId,
          status: "available",
          plan_name: planName,
          metadata: {
            source,
            plan_id: source === "hologram" ? planId : null,
            notes,
            provider_state: providerState,
          },
        };

        const { data: inserted, error } = await admin
          .from("iot_sim_cards")
          .insert(insertPayload)
          .select()
          .single();
        if (error) return json(400, { error: error.message });

        await audit(admin, user.id, source === "manual" ? "sim_added_manually" : "sim_purchased", {
          sim_id: inserted.id,
          details: { source, provider, plan_id: planId, provider_sim_id: providerSimId, iccid, notes },
        });

        return json(200, {
          success: true,
          sim: inserted,
          hologram_configured: hologram.isConfigured(),
          source,
        });
      }

      case "list_available_sims": {
        const { data, error } = await admin
          .from("iot_sim_cards")
          .select("*")
          .is("device_id", null)
          .order("created_at", { ascending: false });
        if (error) return json(400, { error: error.message });
        return json(200, { sims: data });
      }

      case "list_devices": {
        const { data, error } = await admin
          .from("iot_devices")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return json(400, { error: error.message });
        const ids = (data || []).map((d: any) => d.id);
        let sims: any[] = [];
        if (ids.length) {
          const { data: sd } = await admin
            .from("iot_sim_cards")
            .select("*")
            .in("device_id", ids);
          sims = sd || [];
        }
        const vehicleIds = (data || [])
          .map((d: any) => d.vehicle_id)
          .filter(Boolean);
        let vehicles: any[] = [];
        if (vehicleIds.length) {
          const { data: vd } = await admin
            .from("vehicles")
            .select("id, license_plate, make, model, year, owner_id")
            .in("id", vehicleIds);
          vehicles = vd || [];
        }
        return json(200, { devices: data, sims, vehicles });
      }

      case "register_device": {
        const {
          serial_number,
          imei,
          device_model = "GPS-01",
          firmware_version = null,
          notes = null,
        } = body || {};
        if (!serial_number || !imei) {
          return json(400, { error: "serial_number and imei are required" });
        }
        if (!/^\d{15}$/.test(String(imei))) {
          return json(400, { error: "IMEI must be 15 digits" });
        }
        const { data, error } = await admin
          .from("iot_devices")
          .insert({
            serial_number,
            imei,
            device_model,
            firmware_version,
            notes,
            status: "inactive",
            is_linked: false,
            provider: "traccar",
            installation_status: "pending",
            telemetry_enabled: false,
          })
          .select()
          .single();
        if (error) return json(400, { error: error.message });
        await audit(admin, user.id, "device_registered", {
          device_id: data.id,
          details: { serial_number, imei, device_model, firmware_version },
        });
        return json(200, { success: true, device: data });
      }

      case "link_sim_to_device": {
        const { device_imei, sim_id } = body || {};
        if (!device_imei || !sim_id) {
          return json(400, { error: "device_imei and sim_id are required" });
        }
        const { data: device } = await admin
          .from("iot_devices")
          .select("*")
          .eq("imei", String(device_imei))
          .maybeSingle();
        if (!device) return json(404, { error: "No device with that IMEI" });

        const { data: sim } = await admin
          .from("iot_sim_cards")
          .select("*")
          .eq("id", sim_id)
          .maybeSingle();
        if (!sim) return json(404, { error: "SIM not found" });
        if (sim.device_id && sim.device_id !== device.id) {
          return json(409, { error: "SIM is already linked to another device" });
        }

        await admin
          .from("iot_sim_cards")
          .update({ device_id: device.id })
          .eq("id", sim_id);
        await admin
          .from("iot_devices")
          .update({ sim_number: sim.msisdn, sim_provider: sim.provider })
          .eq("id", device.id);

        await audit(admin, user.id, "sim_linked_to_device", {
          device_id: device.id,
          sim_id: sim.id,
          details: { device_imei, iccid: sim.iccid },
        });
        return json(200, { success: true });
      }

      case "activate_pair": {
        const { device_id } = body || {};
        if (!device_id) return json(400, { error: "device_id is required" });
        const { data: device } = await admin
          .from("iot_devices").select("*").eq("id", device_id).maybeSingle();
        if (!device) return json(404, { error: "Device not found" });
        const { data: sim } = await admin
          .from("iot_sim_cards").select("*").eq("device_id", device_id).maybeSingle();
        if (!sim) return json(409, { error: "Device has no SIM linked. Link a SIM by IMEI first." });

        let providerResult: any = { skipped: true };
        if (hologram.isConfigured() && sim.provider_sim_id) {
          const planId = Number(sim.metadata?.plan_id) || 128;
          const r = await hologram.activateSim(sim.provider_sim_id, planId);
          providerResult = r;
          if (!r.ok) {
            return json(502, { error: "Hologram activation failed", provider: r });
          }
        }
        const now = new Date().toISOString();
        await admin.from("iot_sim_cards")
          .update({ status: "active", activated_at: now }).eq("id", sim.id);
        await admin.from("iot_devices")
          .update({ status: "active", activated_at: now }).eq("id", device.id);

        await audit(admin, user.id, "pair_activated", {
          device_id: device.id, sim_id: sim.id,
          details: { provider: providerResult },
        });
        return json(200, { success: true, provider: providerResult });
      }

      case "suspend_pair": {
        const { device_id } = body || {};
        if (!device_id) return json(400, { error: "device_id is required" });
        const { data: sim } = await admin
          .from("iot_sim_cards").select("*").eq("device_id", device_id).maybeSingle();
        if (hologram.isConfigured() && sim?.provider_sim_id) {
          await hologram.suspendSim(sim.provider_sim_id);
        }
        const now = new Date().toISOString();
        if (sim) {
          await admin.from("iot_sim_cards")
            .update({ status: "suspended", suspended_at: now }).eq("id", sim.id);
        }
        await admin.from("iot_devices")
          .update({ status: "inactive" }).eq("id", device_id);
        await audit(admin, user.id, "pair_suspended", {
          device_id, sim_id: sim?.id ?? null,
        });
        return json(200, { success: true });
      }

      case "readiness_check": {
        const { device_id } = body || {};
        if (!device_id) return json(400, { error: "device_id is required" });
        const { data: device } = await admin
          .from("iot_devices").select("*").eq("id", device_id).maybeSingle();
        if (!device) return json(404, { error: "Device not found" });
        const { data: sim } = await admin
          .from("iot_sim_cards").select("*").eq("device_id", device_id).maybeSingle();

        const checks: { name: string; ok: boolean; detail?: string }[] = [];
        checks.push({
          name: "SIM linked",
          ok: !!sim,
          detail: sim ? `ICCID ${sim.iccid}` : "No SIM linked to device",
        });

        // Verify SIM state on Hologram in real time.
        let simState: string | null = sim?.status ?? null;
        if (sim && hologram.isConfigured() && sim.provider_sim_id) {
          const info = await hologram.getSim(sim.provider_sim_id);
          if (info.ok) {
            simState = String(info.body?.data?.state || sim.status);
            checks.push({
              name: "SIM live on Hologram",
              ok: simState === "live" || simState === "active",
              detail: `Hologram state: ${simState}`,
            });
          } else {
            checks.push({
              name: "SIM live on Hologram",
              ok: false,
              detail: `Hologram lookup failed (${(info as any).status ?? "n/a"})`,
            });
          }
        } else if (sim) {
          checks.push({
            name: "SIM active (local status)",
            ok: sim.status === "active",
            detail: `Local status: ${sim.status}`,
          });
        }

        const health = assessHealth(device);
        checks.push({
          name: "Device health",
          ok: health.status === "healthy" || health.status === "degraded",
          detail: health.reasons.length ? health.reasons.join("; ") : `${health.status}`,
        });
        checks.push({
          name: "Device activated",
          ok: device.status === "active",
          detail: `status=${device.status}`,
        });

        // Persist assessment for the dashboard.
        await admin.from("iot_devices").update({
          health_status: health.status,
          last_health_check_at: new Date().toISOString(),
          health_details: { checks, sim_state: simState, ...health },
        }).eq("id", device.id);

        const ready = checks.every((c) => c.ok);
        await audit(admin, user.id, "readiness_check", {
          device_id, sim_id: sim?.id ?? null,
          details: { ready, checks, sim_state: simState, health },
        });

        return json(200, { ready, checks, sim_state: simState, health });
      }

      case "link_to_vehicle": {
        const { device_id, vehicle_id, force } = body || {};
        if (!device_id || !vehicle_id) {
          return json(400, { error: "device_id and vehicle_id are required" });
        }
        const { data: existing } = await admin
          .from("iot_devices").select("id")
          .eq("vehicle_id", vehicle_id).neq("id", device_id).maybeSingle();
        if (existing) {
          return json(409, {
            error: "This vehicle already has a linked tracking device.",
          });
        }

        // Enforce readiness unless explicitly forced.
        if (!force) {
          const { data: device } = await admin
            .from("iot_devices").select("*").eq("id", device_id).maybeSingle();
          const { data: sim } = await admin
            .from("iot_sim_cards").select("*").eq("device_id", device_id).maybeSingle();
          if (!sim) {
            return json(412, {
              error: "Cannot link to vehicle: no SIM is attached to this device.",
            });
          }
          let simLive = sim.status === "active";
          if (hologram.isConfigured() && sim.provider_sim_id) {
            const info = await hologram.getSim(sim.provider_sim_id);
            if (info.ok) {
              const state = String(info.body?.data?.state || "");
              simLive = state === "live" || state === "active";
            }
          }
          if (!simLive) {
            return json(412, {
              error: "Cannot link to vehicle: SIM is not active on Hologram.",
            });
          }
          const health = assessHealth(device);
          if (health.status === "offline" || health.status === "unknown") {
            return json(412, {
              error:
                "Cannot link to vehicle: device is not reporting healthy telemetry. Run a readiness check first.",
              health,
            });
          }
        }

        const { error } = await admin.from("iot_devices").update({
          vehicle_id,
          is_linked: true,
          installation_status: "pending",
          telemetry_enabled: false,
        }).eq("id", device_id);
        if (error) return json(400, { error: error.message });
        await admin.from("iot_sim_cards")
          .update({ vehicle_id }).eq("device_id", device_id);

        await audit(admin, user.id, "device_linked_to_vehicle", {
          device_id, vehicle_id,
          details: { forced: !!force, installation_status: "pending" },
        });
        return json(200, {
          success: true,
          installation_status: "pending",
          message: "Device linked to vehicle. Mark installation confirmed once installed to enable live telemetry.",
        });
      }

      case "confirm_installation": {
        const { device_id, notes } = body || {};
        if (!device_id) return json(400, { error: "device_id is required" });
        const { data: device } = await admin
          .from("iot_devices").select("*").eq("id", device_id).maybeSingle();
        if (!device) return json(404, { error: "Device not found" });
        if (!device.vehicle_id) {
          return json(412, { error: "Device is not linked to a vehicle." });
        }
        const now = new Date().toISOString();
        const { error } = await admin.from("iot_devices").update({
          installation_status: "confirmed",
          installation_confirmed_at: now,
          installation_confirmed_by: user.id,
          telemetry_enabled: true,
        }).eq("id", device_id);
        if (error) return json(400, { error: error.message });
        await audit(admin, user.id, "installation_confirmed", {
          device_id, vehicle_id: device.vehicle_id,
          details: { notes: notes ?? null },
        });
        return json(200, {
          success: true,
          telemetry_enabled: true,
          message: "Installation confirmed. Device is now live on the map and ingesting telemetry.",
        });
      }

      case "unlink_from_vehicle": {
        const { device_id } = body || {};
        if (!device_id) return json(400, { error: "device_id is required" });
        const { data: device } = await admin
          .from("iot_devices").select("vehicle_id").eq("id", device_id).maybeSingle();
        await admin.from("iot_devices").update({
          vehicle_id: null,
          is_linked: false,
          installation_status: "pending",
          installation_confirmed_at: null,
          installation_confirmed_by: null,
          telemetry_enabled: false,
        }).eq("id", device_id);
        await admin.from("iot_sim_cards")
          .update({ vehicle_id: null }).eq("device_id", device_id);
        await audit(admin, user.id, "device_unlinked_from_vehicle", {
          device_id, vehicle_id: device?.vehicle_id ?? null,
        });
        return json(200, { success: true });
      }

      case "deactivate_device": {
        const { device_id, reason } = body || {};
        if (!device_id) return json(400, { error: "device_id is required" });
        if (!reason || String(reason).trim().length < 5) {
          return json(400, { error: "A reason (≥ 5 chars) is required" });
        }
        const { data: device } = await admin
          .from("iot_devices").select("*").eq("id", device_id).maybeSingle();
        if (!device) return json(404, { error: "Device not found" });
        const { data: sim } = await admin
          .from("iot_sim_cards").select("*").eq("device_id", device_id).maybeSingle();

        // 1) Suspend on Hologram
        let hologramResult: any = { skipped: true };
        if (sim && hologram.isConfigured() && sim.provider_sim_id) {
          hologramResult = await hologram.suspendSim(sim.provider_sim_id);
        }
        const now = new Date().toISOString();
        // 2) Update SIM
        if (sim) {
          await admin.from("iot_sim_cards").update({
            status: "suspended",
            suspended_at: now,
            vehicle_id: null,
          }).eq("id", sim.id);
        }
        // 3) Unlink vehicle + device off
        const previousVehicle = device.vehicle_id;
        await admin.from("iot_devices").update({
          status: "inactive",
          vehicle_id: null,
          is_linked: false,
          installation_status: "pending",
          installation_confirmed_at: null,
          installation_confirmed_by: null,
          telemetry_enabled: false,
        }).eq("id", device_id);

        await audit(admin, user.id, "device_deactivated", {
          device_id, sim_id: sim?.id ?? null, vehicle_id: previousVehicle,
          details: { reason, hologram: hologramResult },
        });
        return json(200, {
          success: true,
          message: "Device deactivated. SIM paused on Hologram; vehicle unlinked.",
          hologram: hologramResult,
        });
      }

      case "sync_sim": {
        const { sim_id } = body || {};
        if (!sim_id) return json(400, { error: "sim_id is required" });
        const { data: sim } = await admin
          .from("iot_sim_cards").select("*").eq("id", sim_id).maybeSingle();
        if (!sim) return json(404, { error: "SIM not found" });
        if (!hologram.isConfigured() || !sim.provider_sim_id) {
          return json(200, { skipped: true, reason: "not_configured" });
        }
        const info = await hologram.getSim(sim.provider_sim_id);
        const usage = await hologram.getSimUsage(sim.provider_sim_id);
        const state = info.ok ? (info.body?.data?.state as string) : null;
        const dataMb = usage.ok ? Number(usage.body?.data?.usage_mb || 0) : null;
        await admin.from("iot_sim_cards").update({
          status: state || sim.status,
          data_usage_mb: dataMb ?? sim.data_usage_mb,
          last_session_at: new Date().toISOString(),
        }).eq("id", sim.id);
        return json(200, { success: true, state, data_usage_mb: dataMb });
      }

      case "list_audit": {
        const limit = Math.min(Number(body?.limit) || 100, 500);
        const { data, error } = await admin
          .from("iot_audit_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return json(400, { error: error.message });
        return json(200, { entries: data });
      }

      default:
        return json(400, { error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    console.error("iot-admin error:", err);
    return json(500, { error: err?.message || "Unknown error" });
  }
});
