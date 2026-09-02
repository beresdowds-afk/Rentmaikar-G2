// Admin-only GPSANDTRACK operations: connection status, device list, pull sync
// (writes to iot_devices + mqtt_telemetry_logs so the existing live map and
// telemetry feed pick the data up), remote commands via the GPSANDTRACK command
// queue, device→vehicle linking, and iot_sync_state for the ingestion monitor.
import { adaptSarekonLocations } from "../_shared/location-adapters/sarekon.ts";
import { persistLocations } from "../_shared/unified-location-service.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import {
  SAREKON_COMMAND_MAP,
  missingCredentials,
  sarekon,
  type GPSANDTRACKDevice,
  type GPSANDTRACKResult,
} from "../_shared/sarekon-client.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { invalidateProviderConfig } from "../_shared/provider-config.ts";
import { logIngestRun } from "../_shared/telemetry-ingest-core.ts";


const PROVIDER = "sarekon";

const id = z.string().min(1).max(128);
const short = z.string().max(200);

const Body = z.object({
  action: z.enum([
    "status",
    "test_connection",
    "list_devices",
    "sync",
    "sync_devices",
    "sync_telemetry",
    "refresh_commands",
    "sync_status",
    "send_command",
    "command_parameters",
    "command_history",
    "device_detail",
    "link_device",
    "unlink_device",
    "device_links",
    "link_provider_device",
    "get_sync_state",
    "force_sync_device",
    "set_vehicle_gps",

    // dealer / fleet-admin operations
    "install_device",
    "uninstall_device",
    "update_asset",
    "install_test_start",
    "install_test_result",
    "assign_driver",
    "unassign_driver",
    "update_driver",
    "transfer_trackers",
    "deal_create",
    "deal_list",
    "deal_show",
    "deal_unwind",
    "fleet_audit_log",
    "fleet_permissions",

  ]),
  dvd_id: z.string().min(1).max(128).optional(),
  device_row_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  vehicle_ids: z.array(z.string().uuid()).optional(),
  command: z.string().min(2).max(64).optional(),
  parameters: z.record(z.unknown()).optional(),
  limit: z.number().int().positive().max(200).optional(),
  refresh_credentials: z.boolean().optional(),

  // provider-device → vehicle mapping (what the unified GPS worker resolves on)
  provider_device_id: z.string().min(1).max(128).optional(),
  serial_number: z.string().min(1).max(128).optional(),
  iccid: z.string().min(5).max(32).nullable().optional(),
  telemetry_enabled: z.boolean().optional(),
  gps_tracking_enabled: z.boolean().optional(),


  // fleet-admin payloads
  asset_vin: short.optional(),
  asset_id: id.optional(),
  asset_ids: z.array(id).max(100).optional(),
  device_serial: short.optional(),
  device_ids: z.array(id).max(100).optional(),
  driver_id: id.optional(),
  driver_ids: z.array(id).max(100).optional(),
  account_id: id.optional(),
  deal_id: id.optional(),
  deal_ids: z.array(id).max(100).optional(),
  deal_type_id: z.number().int().min(1).max(99).optional(),
  account_template_id: id.optional(),
  product_code: short.optional(),
  deal_price: z.union([z.number(), z.string().max(32)]).optional(),
  deal_external_ref: short.optional(),
  deal_date: z.string().max(32).optional(),
  relationship_type_id: z.number().int().min(1).max(4).optional(),
  conflict_action_id: z.number().int().min(-1).max(3).optional(),
  vin_not_decodable: z.boolean().optional(),
  installed_odometer: z.number().int().min(0).max(9_999_999).optional(),
  test_dt: z.string().max(40).optional(),
  fields: z.record(z.union([z.string().max(300), z.number(), z.array(z.string().max(64)).max(50)])).optional(),

  // audit-log viewer / permission prober
  audit_action: z.string().max(64).optional(),
  audit_outcome: z.enum(["all", "ok", "failed"]).optional(),
  since_days: z.number().int().min(1).max(365).optional(),

});

/** Scoped sync-state rows so telemetry, devices and commands report separately. */
const SCOPE_PROVIDER = {
  devices: "sarekon",
  telemetry: "sarekon_telemetry",
  commands: "sarekon_commands",
} as const;


interface Diagnosis {
  code: string;
  title: string;
  detail: string;
  hints: string[];
  status?: number;
}

function diagnose(r: GPSANDTRACKResult): Diagnosis {
  if (r.ok) {
    return { code: "ok", title: "Connection successful", detail: "GPSANDTRACK session created.", hints: [] };
  }
  if (r.reason === "not_configured") {
    return {
      code: "not_configured",
      title: "GPSANDTRACK credentials are missing",
      detail: `Missing: ${(r.missing ?? []).join(", ") || "credentials"}.`,
      hints: ["Save the GPSANDTRACK user ID and password in the platform secrets, then test again."],
    };
  }
  if (r.reason === "network_error") {
    return {
      code: "network_error",
      title: "Could not reach the GPSANDTRACK API",
      detail: r.message,
      hints: ["Confirm https://api.sarekon.com/v1 is reachable and not blocked."],
    };
  }
  if (r.reason === "auth_error") {
    return {
      code: "invalid_credentials",
      title: "GPSANDTRACK rejected the credentials",
      detail: (r.body && typeof r.body === "object"
        ? String((r.body as Record<string, unknown>).description ?? "")
        : "") || `The user ID/password was refused (HTTP ${r.status}).`,
      hints: ["Re-enter the GPSANDTRACK user ID and password.", "Confirm the account is active."],
      status: r.status,
    };
  }
  if (r.reason === "rate_limited") {
    return {
      code: "rate_limited",
      title: "GPSANDTRACK rate limit exceeded",
      detail: "The API returned a rate-limit error (-2200 / HTTP 429).",
      hints: ["Wait a moment and retry; reduce sync frequency if this repeats."],
      status: r.status,
    };
  }
  return {
    code: "provider_error",
    title: `GPSANDTRACK returned HTTP ${r.status}`,
    detail: typeof r.body === "string"
      ? r.body.slice(0, 300)
      : String((r.body as Record<string, unknown> | null)?.description ?? JSON.stringify(r.body ?? {})).slice(0, 300),
    hints: ["Retry; if it persists check the GPSANDTRACK account subscription/permissions."],
    status: r.status,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const isCron = !!cronSecret && (req.headers.get("x-cron-secret") ?? "") === cronSecret;

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let actor: string | null = null;
    let isFullAdmin = isCron;
    if (!isCron) {
      if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);
      const { data: u, error: uErr } = await supa.auth.getUser(auth.replace("Bearer ", ""));
      if (uErr || !u?.user) return json({ error: "Unauthenticated" }, 401);
      actor = u.user.id;
      const { data: roleRows, error: roleErr } = await supa
        .from("user_roles")
        .select("role")
        .eq("user_id", actor)
        .in("role", ["admin", "iot_support"]);
      if (roleErr) return json({ error: "Role check failed" }, 500);
      if (!roleRows || roleRows.length === 0) return json({ error: "Admin only" }, 403);
      isFullAdmin = roleRows.some((r: { role: string }) => r.role === "admin");
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const p = parsed.data;
    const { action, dvd_id, device_row_id, vehicle_id, vehicle_ids, command, parameters, limit, refresh_credentials } = p;

    // Ownership-changing operations (account transfers and deals) stay with
    // full admins; iot_support keeps install/assign/maintenance actions.
    const ADMIN_ONLY = new Set(["transfer_trackers", "deal_create", "deal_unwind", "set_vehicle_gps"]);
    if (ADMIN_ONLY.has(action) && !isFullAdmin) {
      return json({ error: "This operation requires a full admin role." }, 403);
    }

    // A freshly saved credential version must beat the 60s config cache.
    if (refresh_credentials) {
      invalidateProviderConfig("sarekon");
      await sarekon.resetSession();
    }

    const audit = async (row: {
      action: string;
      device_id?: string | null;
      vehicle_id?: string | null;
      details?: Record<string, unknown>;
    }) => {
      await supa.from("iot_audit_log").insert({
        performed_by: actor,
        action: row.action,
        device_id: row.device_id ?? null,
        vehicle_id: row.vehicle_id ?? null,
        details: row.details ?? {},
      } as never);
    };

    const setScopeState = async (
      scope: keyof typeof SCOPE_PROVIDER,
      patch: Record<string, unknown>,
    ) => {
      await supa.from("iot_sync_state").upsert(
        { provider: SCOPE_PROVIDER[scope], ...patch, updated_at: new Date().toISOString() },
        { onConflict: "provider" },
      );
    };

    const setSyncState = async (patch: Record<string, unknown>) => setScopeState("devices", patch);

    const activity = async (
      event: string,
      level: "info" | "warn" | "error",
      message: string,
      details: Record<string, unknown> = {},
    ) => {
      await supa.from("iot_sync_activity_log").insert({
        provider: PROVIDER, event, level, message, details,
      } as never);
    };

    if (action === "get_sync_state") {
      const { data } = await supa.from("iot_sync_state").select("*").eq("provider", PROVIDER).maybeSingle();
      return json({ ok: true, state: data });
    }

    if (action === "sync_status") {
      const { data: states } = await supa
        .from("iot_sync_state")
        .select("*")
        .in("provider", Object.values(SCOPE_PROVIDER));
      const { data: events } = await supa
        .from("iot_sync_activity_log")
        .select("event, level, message, details, created_at")
        .eq("provider", PROVIDER)
        .order("created_at", { ascending: false })
        .limit(limit ?? 25);
      const { count: mapped } = await supa
        .from("iot_devices")
        .select("id", { count: "exact", head: true })
        .eq("provider", PROVIDER)
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      const { count: total } = await supa
        .from("iot_devices")
        .select("id", { count: "exact", head: true })
        .eq("provider", PROVIDER);
      const byScope: Record<string, unknown> = {};
      for (const [scope, provider] of Object.entries(SCOPE_PROVIDER)) {
        byScope[scope] = (states ?? []).find((s: Record<string, unknown>) => s.provider === provider) ?? null;
      }
      return json({
        ok: true,
        scopes: byScope,
        activity: events ?? [],
        map_merge: { devices_total: total ?? 0, devices_on_map: mapped ?? 0 },
      });
    }

    /**
     * Registry rows for the link screen: every SareKon device row we know
     * about, with the vehicle it feeds. The unified GPS worker polls rows that
     * have BOTH a provider_device_id and a vehicle_id, so the UI reports that
     * pair as the readiness signal.
     */
    if (action === "device_links") {
      const { data: rows, error } = await supa
        .from("iot_devices")
        .select(
          "id, provider_device_id, serial_number, sim_number, vehicle_id, telemetry_enabled, status, last_ping, latitude, longitude",
        )
        .eq("provider", PROVIDER)
        .order("serial_number");
      if (error) return json({ ok: false, error: error.message }, 400);

      const vehicleIds = [...new Set((rows ?? []).map((r) => r.vehicle_id).filter(Boolean))] as string[];
      const { data: vehicles } = vehicleIds.length
        ? await supa.from("vehicles").select("id, make, model, year, license_plate, gps_tracking_enabled").in("id", vehicleIds)
        : { data: [] as Record<string, unknown>[] };
      const vmap = new Map((vehicles ?? []).map((v: Record<string, unknown>) => [v.id as string, v]));

      return json({
        ok: true,
        devices: (rows ?? []).map((r) => {
          const vehicle = r.vehicle_id ? vmap.get(r.vehicle_id) ?? null : null;
          const vehicleGpsOn = vehicle ? (vehicle as Record<string, unknown>).gps_tracking_enabled !== false : true;
          return {
            ...r,
            vehicle,
            vehicle_gps_enabled: vehicleGpsOn,
            polling_ready: Boolean(r.provider_device_id && r.vehicle_id && r.telemetry_enabled && vehicleGpsOn),
          };
        }),
      });
    }

    /**
     * Create or update the provider-device → vehicle mapping the unified
     * location pipeline resolves on. Upserts on (provider, provider_device_id)
     * so re-linking an already-known tracker never duplicates a registry row.
     */
    if (action === "link_provider_device") {
      const providerDeviceId = (p.provider_device_id ?? "").trim();
      if (!providerDeviceId) return json({ error: "provider_device_id required" }, 400);
      const serial = (p.serial_number ?? "").trim() || providerDeviceId;
      const target = vehicle_id ?? null;

      if (target) {
        // One vehicle can only be fed by one tracker, otherwise the map flips
        // between two position sources.
        const { data: clash } = await supa
          .from("iot_devices")
          .select("id, serial_number, provider, provider_device_id")
          .eq("vehicle_id", target)
          .maybeSingle();
        if (clash && clash.provider_device_id !== providerDeviceId) {
          return json({
            ok: false,
            conflict: true,
            existing_device: clash,
            message: `Vehicle already linked to ${clash.provider} device ${clash.serial_number}. Unlink it first.`,
          });
        }
      }

      const patch: Record<string, unknown> = {
        provider: PROVIDER,
        provider_device_id: providerDeviceId,
        serial_number: serial,
        vehicle_id: target,
        telemetry_enabled: p.telemetry_enabled ?? true,
        updated_at: new Date().toISOString(),
      };
      if (p.iccid !== undefined) patch.sim_number = p.iccid ? p.iccid.trim() : null;

      const { data: saved, error } = await supa
        .from("iot_devices")
        .upsert(patch as never, { onConflict: "provider,provider_device_id" })
        .select("id, provider_device_id, serial_number, sim_number, vehicle_id, telemetry_enabled")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 400);

      await audit({
        action: target ? "sarekon_device_linked" : "sarekon_device_unlinked",
        device_id: saved?.id ?? null,
        vehicle_id: target,
        details: { provider_device_id: providerDeviceId, serial_number: serial, iccid: patch.sim_number ?? null },
      });
      return json({ ok: true, device: saved });
    }


    if (action === "link_device" || action === "unlink_device") {
      if (!device_row_id) return json({ error: "device_row_id required" }, 400);
      const target = action === "link_device" ? vehicle_id ?? null : null;
      if (action === "link_device" && !target) return json({ error: "vehicle_id required" }, 400);
      if (target) {
        const { data: clash } = await supa
          .from("iot_devices")
          .select("id, serial_number, provider")
          .eq("vehicle_id", target)
          .neq("id", device_row_id)
          .maybeSingle();
        if (clash) {
          return json({
            ok: false,
            conflict: true,
            existing_device: clash,
            message: `Vehicle already linked to ${clash.provider} device ${clash.serial_number}. Unlink it first.`,
          });
        }
      }
      // Linking a tracker to a vehicle also arms telemetry polling, otherwise
      // the location worker (which filters on telemetry_enabled) skips it and
      // the vehicle never appears on the live map.
      const { error } = await supa
        .from("iot_devices")
        .update({ vehicle_id: target, telemetry_enabled: !!target })
        .eq("id", device_row_id);
      if (error) return json({ ok: false, error: error.message }, 400);
      await audit({
        action: action === "link_device" ? "sarekon_device_linked" : "sarekon_device_unlinked",
        device_id: device_row_id,
        vehicle_id: target,
      });
      return json({ ok: true });
    }

    /**
     * Per-vehicle GPS/telemetry switch (full admins only — enforced in
     * ADMIN_ONLY). It gates the entire unified location pipeline for the
     * vehicle: worker polling, state/history writes, and live publishing.
     */
    if (action === "set_vehicle_gps") {
      if (!vehicle_id) return json({ error: "vehicle_id required" }, 400);
      if (p.gps_tracking_enabled === undefined) {
        return json({ ok: false, error: "gps_tracking_enabled required" }, 400);
      }
      const { data: veh, error } = await supa
        .from("vehicles")
        .update({ gps_tracking_enabled: p.gps_tracking_enabled } as never)
        .eq("id", vehicle_id)
        .select("id, make, model, license_plate, gps_tracking_enabled")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 400);
      if (!veh) return json({ ok: false, error: "Vehicle not found" }, 404);
      await audit({
        action: p.gps_tracking_enabled ? "vehicle_gps_enabled" : "vehicle_gps_disabled",
        vehicle_id,
        details: { gps_tracking_enabled: p.gps_tracking_enabled },
      });
      return json({ ok: true, vehicle: veh });
    }

    await sarekon.ensureReady();

    if (!sarekon.isConfigured()) {
      const missing = missingCredentials();
      if (action === "test_connection") {
        await activity("test_connection_failed", "warn", "Test connection: credentials missing", { missing });
      }
      return json({
        ok: true,
        configured: false,
        base_url: sarekon.baseUrl(),
        message: "GPSANDTRACK is not configured. Save the GPSANDTRACK user ID and password.",
        diagnosis: {
          code: "not_configured",
          title: "GPSANDTRACK credentials are missing",
          detail: `Missing: ${missing.join(", ") || "credentials"}.`,
          hints: ["Enter the GPSANDTRACK username and password in the credentials panel (or set SAREKON_USERNAME / SAREKON_PASSWORD secrets)."],
          missing,
        },
      });
    }

    if (action === "status" || action === "test_connection") {
      const started = Date.now();
      const ping = await sarekon.ping();
      const latency_ms = Date.now() - started;
      const diagnosis = diagnose(ping);
      if (action === "test_connection") {
        await audit({ action: "sarekon_connection_tested", details: { ok: ping.ok, diagnosis } });
        await activity(
          ping.ok ? "test_connection_ok" : "test_connection_failed",
          ping.ok ? "info" : "error",
          ping.ok ? `Authenticated with GPSANDTRACK in ${latency_ms}ms` : `${diagnosis.title} — ${diagnosis.detail}`,
          { diagnosis, base_url: sarekon.baseUrl() },
        );
      }
      return json({ ok: true, configured: true, base_url: sarekon.baseUrl(), latency_ms, authenticated: ping.ok, diagnosis });
    }

    /**
     * Force a one-off location sync for a single tracker: polls the provider
     * immediately, funnels the fix through the unified location service, and
     * returns the API result with request/response/finish timestamps so the
     * admin UI can show exactly what came back. Logged under its own
     * ingestion source so it shows up in the worker drill-down.
     */
    if (action === "force_sync_device") {
      const providerDeviceId = (p.provider_device_id ?? dvd_id ?? "").trim();
      if (!providerDeviceId) return json({ error: "provider_device_id required" }, 400);
      const requestedAt = new Date().toISOString();
      const startedMs = Date.now();

      const { data: reg } = await supa
        .from("iot_devices")
        .select("id, provider_device_id, serial_number, vehicle_id, telemetry_enabled")
        .eq("provider", PROVIDER)
        .or(`provider_device_id.eq."${providerDeviceId}",serial_number.eq."${providerDeviceId}"`)
        .maybeSingle();
      const pollId = (reg?.provider_device_id as string | null) ?? providerDeviceId;

      let vehicleGpsEnabled: boolean | null = null;
      if (reg?.vehicle_id) {
        const { data: veh } = await supa
          .from("vehicles")
          .select("gps_tracking_enabled")
          .eq("id", reg.vehicle_id)
          .maybeSingle();
        vehicleGpsEnabled = veh ? (veh as { gps_tracking_enabled: boolean }).gps_tracking_enabled : null;
      }

      const r = await sarekon.currentLocations([pollId]);
      const respondedAt = new Date().toISOString();

      if (!r.ok) {
        const dg = diagnose(r);
        await logIngestRun(supa, {
          source: "sarekon_force_sync",
          provider: PROVIDER,
          devices_seen: 1,
          events_processed: 0,
          broker_reachable: r.reason !== "network_error",
          error: `${dg.title}: ${dg.detail}`.slice(0, 400),
          degraded_reason: dg.code,
          duration_ms: Date.now() - startedMs,
        });
        await audit({
          action: "sarekon_force_sync_failed",
          device_id: (reg?.id as string | null) ?? null,
          vehicle_id: (reg?.vehicle_id as string | null) ?? null,
          details: { provider_device_id: pollId, diagnosis: dg },
        });
        return json({
          ok: false,
          provider_device_id: pollId,
          requested_at: requestedAt,
          provider_responded_at: respondedAt,
          finished_at: new Date().toISOString(),
          diagnosis: dg,
          linked_vehicle_id: (reg?.vehicle_id as string | null) ?? null,
          vehicle_gps_enabled: vehicleGpsEnabled,
        });
      }

      const normalized = adaptSarekonLocations(r.body);
      const res = await persistLocations(supa, normalized);
      const finishedAt = new Date().toISOString();

      await logIngestRun(supa, {
        source: "sarekon_force_sync",
        provider: PROVIDER,
        devices_seen: 1,
        events_processed: res.persisted,
        broker_reachable: true,
        error: res.errors[0]?.slice(0, 400) ?? null,
        degraded_reason: res.errors.length ? "persist_errors" : res.gps_disabled ? "gps_disabled" : null,
        duration_ms: Date.now() - startedMs,
      });
      await audit({
        action: "sarekon_force_sync",
        device_id: (reg?.id as string | null) ?? null,
        vehicle_id: (reg?.vehicle_id as string | null) ?? null,
        details: {
          provider_device_id: pollId,
          fixes: normalized.length,
          persisted: res.persisted,
          gps_disabled: res.gps_disabled,
        },
      });

      const first = normalized[0] ?? null;
      const rawFirst = Array.isArray(r.body) ? ((r.body as Record<string, unknown>[])[0] ?? null) : null;
      return json({
        ok: true,
        provider_device_id: pollId,
        requested_at: requestedAt,
        provider_responded_at: respondedAt,
        finished_at: finishedAt,
        fixes: normalized.length,
        persisted: res.persisted,
        deduped: res.deduped,
        unmapped: res.unmapped,
        published: res.published,
        gps_disabled: res.gps_disabled,
        linked_vehicle_id: (reg?.vehicle_id as string | null) ?? first?.vehicleId ?? null,
        vehicle_gps_enabled: vehicleGpsEnabled,
        location: first
          ? {
              latitude: first.latitude,
              longitude: first.longitude,
              speed_kmh: first.speedKmh ?? null,
              heading: first.heading ?? null,
              ignition: first.ignition ?? null,
              address: first.address ?? null,
              gps_timestamp: first.gpsTimestamp,
              received_at: first.receivedAt,
            }
          : null,
        raw: rawFirst,
        errors: res.errors,
      });
    }

    if (action === "list_devices") {
      const r = await sarekon.listDevices();
      return json({ ok: r.ok, base_url: sarekon.baseUrl(), diagnosis: diagnose(r), devices: r.ok ? r.body : [] });
    }

    if (action === "device_detail") {
      if (!dvd_id) return json({ error: "dvd_id required" }, 400);
      const [detail, locations, trips, messages, commands] = await Promise.all([
        sarekon.showDevice(dvd_id),
        sarekon.locations(dvd_id, limit ?? 25),
        sarekon.trips(dvd_id, limit ?? 25),
        sarekon.messages(dvd_id, limit ?? 25),
        sarekon.commandHistory(dvd_id, limit ?? 25),
      ]);
      return json({
        ok: true,
        device: detail.ok ? detail.body : null,
        locations: locations.ok ? locations.body : [],
        trips: trips.ok ? trips.body : [],
        messages: messages.ok ? messages.body : [],
        commands: commands.ok ? commands.body : [],
      });
    }

    if (action === "command_parameters") {
      // device_ids[] + message_type_id are required by the SareKon API.
      const messageTypeId = typeof command === "string"
        ? SAREKON_COMMAND_MAP[command] ?? Number(command)
        : undefined;
      const r = await sarekon.commandParameters(
        dvd_id ? [dvd_id] : [],
        Number.isFinite(messageTypeId as number) ? (messageTypeId as number) : undefined,
      );
      return json({ ok: r.ok, parameters: r.ok ? r.body : [], diagnosis: diagnose(r) });
    }

    if (action === "command_history" || action === "refresh_commands") {
      const startedMs = Date.now();
      const nowIso = new Date().toISOString();
      const r = await sarekon.commandHistory(dvd_id, limit ?? 50);
      const dg = diagnose(r);
      if (action === "refresh_commands") {
        await setScopeState("commands", {
          last_sync_at: nowIso,
          state: r.ok ? "ok" : "error",
          ...(r.ok
            ? { last_success_at: nowIso, devices_synced: (r.body as unknown[]).length, last_error: null, last_error_at: null }
            : { last_error: `${dg.title}: ${dg.detail}`, last_error_at: nowIso }),
        });
        await activity(
          r.ok ? "command_queue_refreshed" : "command_queue_refresh_failed",
          r.ok ? "info" : "error",
          r.ok
            ? `Command queue refreshed (${(r.body as unknown[]).length} entries) in ${Date.now() - startedMs}ms`
            : `${dg.title} — ${dg.detail}`,
          { dvd_id: dvd_id ?? null, diagnosis: dg },
        );
      }
      return json({ ok: r.ok, commands: r.ok ? r.body : [], diagnosis: dg });
    }


    if (action === "send_command") {
      if (!dvd_id || !command) return json({ error: "dvd_id and command are required" }, 400);
      if (actor) {
        const rl = await checkRateLimit(actor, "sarekon-admin:send_command", 20);
        if (!rl.allowed) {
          return json({ ok: false, error: "rate_limited", retry_after_seconds: rl.retry_after_seconds }, 429);
        }
      }
      const mapped = SAREKON_COMMAND_MAP[command] ?? command;
      const r = await sarekon.sendCommand(dvd_id, mapped, parameters ?? {});
      await audit({
        action: `sarekon_command_${command}`,
        vehicle_id: vehicle_id ?? null,
        details: { dvd_id, command, mapped, parameters: parameters ?? {}, ok: r.ok },
      });
      await activity(
        r.ok ? "command_sent" : "command_failed",
        r.ok ? "info" : "error",
        `${mapped} → ${dvd_id}${r.ok ? " queued" : " failed"}`,
        { dvd_id, command: mapped, diagnosis: diagnose(r) },
      );
      return json({ ok: r.ok, provider: PROVIDER, diagnosis: diagnose(r), response: r.ok ? r.body : undefined });
    }

    if (action === "sync" || action === "sync_devices" || action === "sync_telemetry") {
      // devices  -> registry/asset metadata only (no telemetry rows written)
      // telemetry-> registry positions + mqtt_telemetry_logs feed
      const writeTelemetry = action !== "sync_devices";
      const scopeLabel = action === "sync_devices" ? "device" : action === "sync_telemetry" ? "telemetry" : "full";
      const startedMs = Date.now();
      const nowIso = new Date().toISOString();
      await setSyncState({ state: "running", last_sync_at: nowIso });
      if (writeTelemetry) await setScopeState("telemetry", { state: "running", last_sync_at: nowIso });
      await activity("sync_started", "info", `GPSANDTRACK ${scopeLabel} sync started`, {
        triggered_by: isCron ? "schedule" : "admin",
        scope: scopeLabel,
      });

      const dr = await sarekon.listDevices();
      if (!dr.ok) {
        const dg = diagnose(dr);
        await setSyncState({ state: "error", last_error_at: nowIso, last_error: `${dg.title}: ${dg.detail}` });
        if (writeTelemetry) {
          await setScopeState("telemetry", { state: "error", last_error_at: nowIso, last_error: `${dg.title}: ${dg.detail}` });
        }
        await activity("device_fetch_failed", "error", `${dg.title} — ${dg.detail}`, { diagnosis: dg });
        return json({ ok: false, step: "devices", diagnosis: dg }, 502);
      }


      const vehicleFilter = vehicle_ids && vehicle_ids.length ? new Set(vehicle_ids) : null;
      const deviceErrors: Array<{ device: string; error: string }> = [];
      let upserts = 0;
      let inserts = 0;
      let skippedByFilter = 0;

      for (const d of dr.body as GPSANDTRACKDevice[]) {
        const serial = d.serial || d.id;
        if (!serial) continue;

        const { data: existing } = await supa
          .from("iot_devices")
          .select("id, vehicle_id")
          .eq("serial_number", serial)
          .maybeSingle();

        if (vehicleFilter && (!existing?.vehicle_id || !vehicleFilter.has(existing.vehicle_id))) {
          skippedByFilter++;
          continue;
        }

        // device_status enum has no "unknown" member — providers that omit a
        // status (GPSANDTRACK list endpoint does) fall back to "inactive"
        // until telemetry proves the device is reporting.
        const status: "active" | "offline" | "inactive" = d.status
          ? (/online|active|connected/i.test(d.status)
            ? "active"
            : /offline|disconnected/i.test(d.status)
            ? "offline"
            : "inactive")
          : "inactive";

        const row = {
          serial_number: serial,
          provider: PROVIDER,
          provider_device_id: String(d.id ?? serial),
          device_model: d.model,
          status,
          last_ping: d.lastUpdate ?? nowIso,
          latitude: d.latitude,
          longitude: d.longitude,
          health_details: {
            sarekon_dvd_id: d.id,
            name: d.name,
            last_position: (d.latitude !== null && d.longitude !== null)
              ? { speed_kmh: d.speedKmh ?? 0, course: d.course ?? 0, address: d.address, ignition: d.ignition }
              : null,
            raw: d.raw,
          },
        };

        const { data: upserted, error } = await supa
          .from("iot_devices")
          .upsert(row, { onConflict: "serial_number" })
          .select("id, vehicle_id")
          .maybeSingle();
        if (error) {
          deviceErrors.push({ device: serial, error: error.message });
          continue;
        }
        upserts++;

        const linkedVehicleId = upserted?.vehicle_id ?? existing?.vehicle_id ?? null;

        if (writeTelemetry && d.latitude !== null && d.longitude !== null) {
          // Unified location pipeline: one normalized shape, shared fleet map.
          try {
            const normalized = adaptSarekonLocations([{
              device_id: String(d.id ?? serial),
              latitude: d.latitude,
              longitude: d.longitude,
              speed_kph: d.speedKmh,
              bearing_deg: d.course,
              ignition: d.ignition,
              address: d.address,
              dt: d.lastUpdate ?? nowIso,
              device: { device_description: serial },
            }]);
            if (normalized.length) {
              await persistLocations(supa as never, normalized, { writeHistory: false, publishMqtt: true });
            }
          } catch (e) {
            deviceErrors.push({ device: serial, error: `unified_location: ${(e as Error).message}` });
          }
          const { error: telErr } = await supa.from("mqtt_telemetry_logs").insert({
            data_type: "sarekon_position",
            vehicle_id: linkedVehicleId ?? serial,
            payload: {
              lat: d.latitude,
              lng: d.longitude,
              speed_kmh: d.speedKmh ?? 0,
              course: d.course ?? 0,
              ignition: d.ignition,
              address: d.address,
              iot_device_id: upserted?.id ?? existing?.id ?? null,
              linked_vehicle_id: linkedVehicleId,
              device_time: d.lastUpdate,
            },
            mqtt_topic: `sarekon/${serial}/position`,
            received_at: d.lastUpdate ?? nowIso,
          } as never);
          if (telErr) deviceErrors.push({ device: serial, error: `position: ${telErr.message}` });
          else inserts++;
        }
      }

      const hasErrors = deviceErrors.length > 0;
      await setSyncState({
        state: hasErrors ? "degraded" : "ok",
        last_success_at: nowIso,
        devices_synced: upserts,
        positions_imported: inserts,
        last_error: hasErrors ? deviceErrors[0].error : null,
        last_error_at: hasErrors ? nowIso : null,
      });
      if (writeTelemetry) {
        await setScopeState("telemetry", {
          state: hasErrors ? "degraded" : "ok",
          last_success_at: nowIso,
          devices_synced: upserts,
          positions_imported: inserts,
          last_error: hasErrors ? deviceErrors[0].error : null,
          last_error_at: hasErrors ? nowIso : null,
        });
      }
      for (const de of deviceErrors.slice(0, 25)) {
        await activity("device_sync_error", "error", `${de.device}: ${de.error}`, de);
      }
      await activity(
        "sync_completed",
        hasErrors ? "warn" : "info",
        `${scopeLabel} sync: ${upserts} device(s), ${inserts} position(s) in ${Date.now() - startedMs}ms` +
          (hasErrors ? ` — ${deviceErrors.length} error(s)` : ""),
        { scope: scopeLabel, devices_synced: upserts, positions_imported: inserts, skipped_by_vehicle_filter: skippedByFilter },
      );

      // Map-merge safeguard: positions only ever land on iot_devices, which the
      // single existing fleet map reads — never a separate provider map/table.
      const { count: onMap } = await supa
        .from("iot_devices")
        .select("id", { count: "exact", head: true })
        .eq("provider", PROVIDER)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      return json({
        ok: true,
        scope: scopeLabel,
        devices_synced: upserts,
        positions_imported: inserts,
        devices_on_shared_map: onMap ?? 0,
        skipped_by_vehicle_filter: skippedByFilter,
        device_errors: deviceErrors.slice(0, 25),
      });

    }

    // ---- Fleet-admin audit log viewer ------------------------------------
    // Reads back the `sarekon_*` rows written by `audit()` below, resolves the
    // actor to a human name and surfaces the last known request status
    // (ok / diagnosis) that the provider returned for that attempt.
    if (action === "fleet_audit_log") {
      const sinceIso = new Date(Date.now() - (p.since_days ?? 30) * 86_400_000).toISOString();
      let q = supa
        .from("iot_audit_log")
        .select("id, action, performed_by, device_id, vehicle_id, details, created_at")
        .like("action", "sarekon_%")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit ?? 100);
      if (p.audit_action) q = q.eq("action", `sarekon_${p.audit_action}`);
      const { data: rows, error: logErr } = await q;
      if (logErr) return json({ ok: false, error: logErr.message }, 500);

      const actorIds = [...new Set((rows ?? []).map((r) => r.performed_by).filter(Boolean))] as string[];
      const names = new Map<string, { name: string; email: string | null }>();
      if (actorIds.length) {
        const { data: profs } = await supa
          .from("profiles")
          .select("id, full_name, email")
          .in("id", actorIds);
        for (const pr of profs ?? []) {
          names.set(pr.id as string, {
            name: (pr.full_name as string) || "Unknown admin",
            email: (pr.email as string) ?? null,
          });
        }
      }

      const entries = (rows ?? [])
        .map((r) => {
          const details = (r.details ?? {}) as Record<string, unknown>;
          const diagnosis = details.diagnosis as Diagnosis | undefined;
          const ok = details.ok !== false;
          const actorInfo = r.performed_by ? names.get(r.performed_by as string) : null;
          const { ok: _ok, diagnosis: _d, ...payload } = details;
          return {
            id: r.id,
            created_at: r.created_at,
            operation: String(r.action).replace(/^sarekon_/, ""),
            actor_id: r.performed_by,
            actor_name: r.performed_by ? actorInfo?.name ?? "Unknown admin" : "Automated / cron",
            actor_email: actorInfo?.email ?? null,
            vehicle_id: r.vehicle_id,
            status: ok ? "succeeded" : "failed",
            status_code: ok ? "ok" : diagnosis?.code ?? "provider_error",
            status_title: ok ? "Accepted by GPSANDTRACK" : diagnosis?.title ?? "Request failed",
            status_detail: ok ? null : diagnosis?.detail ?? null,
            hints: ok ? [] : diagnosis?.hints ?? [],
            payload,
          };
        })
        .filter((e) =>
          p.audit_outcome === "ok"
            ? e.status === "succeeded"
            : p.audit_outcome === "failed"
              ? e.status === "failed"
              : true
        );

      return json({
        ok: true,
        entries,
        counts: {
          total: entries.length,
          failed: entries.filter((e) => e.status === "failed").length,
        },
      });
    }

    // ---- Dealer scope / permission probe ---------------------------------
    // SareKon evaluates the account's permission grants before it validates
    // arguments, so hitting each endpoint with an empty payload tells us which
    // scope is missing without ever creating or mutating a provider record.
    if (action === "fleet_permissions") {
      const PROBES: Array<{ scope: string; path: string; label: string; unlocks: string }> = [
        { scope: "dvd/read", path: "/dvd/enumerate.json", label: "List trackers", unlocks: "Devices tab, sync" },
        { scope: "dvd/install", path: "/dvd/install_create.json", label: "Install device", unlocks: "Install & uninstall" },
        { scope: "dvd/test", path: "/dvd/test_create.json", label: "Install test", unlocks: "Install test start/result" },
        { scope: "dvd/assign", path: "/dvd/assign_create.json", label: "Assign driver", unlocks: "Driver assignment" },
        { scope: "driver/write", path: "/driver/update.json", label: "Update driver", unlocks: "Driver details" },
        { scope: "asset/write", path: "/asset/update.json", label: "Update asset", unlocks: "Asset update" },
        { scope: "dvd/transfer", path: "/dvd/transfer_create.json", label: "Transfer trackers", unlocks: "Account transfers" },
        { scope: "deal/read", path: "/deal/list.json", label: "List deals", unlocks: "Deals list & detail" },
        { scope: "deal/write", path: "/deal/create.json", label: "Create deal", unlocks: "Deal creation" },
        { scope: "deal/unwind", path: "/deal/unwind_update.json", label: "Unwind deal", unlocks: "Deal reversal" },
      ];

      const permissionRequired = (body: unknown): string | null => {
        const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
        const m = /Permission Required:\s*([A-Za-z0-9_\/.-]+)/i.exec(text);
        return m ? m[1] : null;
      };

      const results = [];
      for (const probe of PROBES) {
        const r = await sarekon.raw(probe.path);
        if (r.ok) {
          results.push({ ...probe, state: "granted" as const, note: "Endpoint responded successfully." });
          continue;
        }
        if (r.reason === "not_configured" || r.reason === "network_error" || r.reason === "auth_error") {
          return json({ ok: false, diagnosis: diagnose(r) });
        }
        const missing = permissionRequired(r.body);
        if (missing) {
          results.push({
            ...probe,
            state: "missing" as const,
            missing_scope: missing,
            note: `GPSANDTRACK replied "Permission Required: ${missing}".`,
          });
        } else {
          // Rejected on arguments, not on permission — the scope is held.
          results.push({
            ...probe,
            state: "granted" as const,
            note: "Scope held (call was rejected on arguments, not permissions).",
          });
        }
      }

      const missingScopes = [...new Set(results.filter((r) => r.state === "missing").map((r) => r.missing_scope!))];
      await activity(
        missingScopes.length ? "permission_check_gaps" : "permission_check_ok",
        missingScopes.length ? "warn" : "info",
        missingScopes.length
          ? `Dealer account is missing ${missingScopes.length} scope(s): ${missingScopes.join(", ")}`
          : "Dealer account holds every fleet-admin scope",
        { missing_scopes: missingScopes },
      );

      return json({
        ok: true,
        checked_at: new Date().toISOString(),
        results,
        missing_scopes: missingScopes,
        summary: missingScopes.length
          ? `Ask your GPSANDTRACK dealer administrator to enable: ${missingScopes.join(", ")}`
          : "All fleet-admin scopes are enabled on this dealer account.",
      });
    }



    // ---- Dealer / fleet-admin operations ---------------------------------
    // Every write is rate-limited per admin, audited in iot_audit_log and
    // mirrored to the IoT activity feed so the provider stays reconcilable.
    const FLEET_ACTIONS = new Set([
      "install_device",
      "uninstall_device",
      "update_asset",
      "install_test_start",
      "install_test_result",
      "assign_driver",
      "unassign_driver",
      "update_driver",
      "transfer_trackers",
      "deal_create",
      "deal_list",
      "deal_show",
      "deal_unwind",
    ]);

    if (FLEET_ACTIONS.has(action)) {
      const isRead = action === "deal_list" || action === "deal_show" || action === "install_test_result";
      if (actor && !isRead) {
        const rl = await checkRateLimit(actor, `sarekon-admin:${action}`, 30);
        if (!rl.allowed) {
          return json({ ok: false, error: "rate_limited", retry_after_seconds: rl.retry_after_seconds }, 429);
        }
      }

      const finish = async (
        r: GPSANDTRACKResult,
        details: Record<string, unknown>,
        extra: Record<string, unknown> = {},
      ) => {
        const dg = diagnose(r);
        if (!isRead) {
          await audit({
            action: `sarekon_${action}`,
            vehicle_id: vehicle_id ?? null,
            details: { ...details, ok: r.ok, diagnosis: r.ok ? undefined : dg },
          });
          await activity(
            r.ok ? `${action}_ok` : `${action}_failed`,
            r.ok ? "info" : "error",
            r.ok ? `${action.replace(/_/g, " ")} succeeded` : `${dg.title} — ${dg.detail}`,
            { ...details, diagnosis: dg },
          );
        }
        return json({ ok: r.ok, diagnosis: dg, response: r.ok ? r.body : undefined, ...extra });
      };

      switch (action) {
        case "install_device": {
          if (!p.asset_vin || !p.device_serial) {
            return json({ error: "asset_vin and device_serial are required" }, 400);
          }
          const r = await sarekon.installDevice({
            assetVin: p.asset_vin,
            deviceSerial: p.device_serial,
            vinNotDecodable: p.vin_not_decodable,
            installedOdometer: p.installed_odometer,
            conflictActionId: p.conflict_action_id,
          });
          return await finish(r, { asset_vin: p.asset_vin, device_serial: p.device_serial });
        }
        case "uninstall_device": {
          if (!dvd_id) return json({ error: "dvd_id required" }, 400);
          return await finish(await sarekon.uninstallDevice(dvd_id), { dvd_id });
        }
        case "update_asset": {
          if (!p.asset_id) return json({ error: "asset_id required" }, 400);
          return await finish(await sarekon.updateAsset(p.asset_id, p.fields ?? {}), {
            asset_id: p.asset_id,
            fields: p.fields ?? {},
          });
        }
        case "install_test_start": {
          if (!dvd_id) return json({ error: "dvd_id required" }, 400);
          const r = await sarekon.startInstallTest(dvd_id);
          return await finish(r, { dvd_id }, { test_dt: r.ok ? r.body.dt : null });
        }
        case "install_test_result": {
          if (!dvd_id || !p.test_dt) return json({ error: "dvd_id and test_dt are required" }, 400);
          return await finish(await sarekon.installTestResult(dvd_id, p.test_dt), { dvd_id });
        }
        case "assign_driver": {
          if (!p.asset_vin || !p.relationship_type_id) {
            return json({ error: "asset_vin and relationship_type_id are required" }, 400);
          }
          const f = (p.fields ?? {}) as Record<string, string>;
          const r = await sarekon.assignDriver({
            assetVin: p.asset_vin,
            relationshipTypeId: p.relationship_type_id,
            driverId: p.driver_id,
            firstName: f.first_name,
            lastName: f.last_name,
            externalRef: f.external_ref,
            email: f.email,
            phone: f.phone,
            conflictActionId: p.conflict_action_id,
          });
          return await finish(r, { asset_vin: p.asset_vin, driver_id: p.driver_id ?? null });
        }
        case "unassign_driver": {
          if (!p.driver_id && !p.asset_vin && !p.asset_id) {
            return json({ error: "driver_id, asset_vin or asset_id is required" }, 400);
          }
          return await finish(
            await sarekon.unassignDriver({ driverId: p.driver_id, assetVin: p.asset_vin, assetId: p.asset_id }),
            { driver_id: p.driver_id ?? null, asset_vin: p.asset_vin ?? null },
          );
        }
        case "update_driver": {
          if (!p.driver_id) return json({ error: "driver_id required" }, 400);
          return await finish(await sarekon.updateDriver(p.driver_id, p.fields ?? {}), {
            driver_id: p.driver_id,
            fields: p.fields ?? {},
          });
        }
        case "transfer_trackers": {
          if (!p.account_id) return json({ error: "account_id required" }, 400);
          if (!p.device_ids?.length && !p.asset_ids?.length && !p.driver_ids?.length) {
            return json({ error: "Pass at least one of device_ids, asset_ids or driver_ids" }, 400);
          }
          return await finish(
            await sarekon.transferTrackers({
              accountId: p.account_id,
              deviceIds: p.device_ids,
              assetIds: p.asset_ids,
              driverIds: p.driver_ids,
            }),
            {
              account_id: p.account_id,
              device_ids: p.device_ids ?? [],
              asset_ids: p.asset_ids ?? [],
              driver_ids: p.driver_ids ?? [],
            },
          );
        }
        case "deal_create": {
          if (!p.account_id || !p.deal_type_id) {
            return json({ error: "account_id and deal_type_id are required" }, 400);
          }
          const r = await sarekon.createDeal({
            accountId: p.account_id,
            dealTypeId: p.deal_type_id,
            accountTemplateId: p.account_template_id,
            productCode: p.product_code,
            dealPrice: p.deal_price,
            dealExternalRef: p.deal_external_ref,
            dealDate: p.deal_date,
            deviceSerial: p.device_serial,
            assetVin: p.asset_vin,
          });
          const dealId = r.ok ? (r.body as Record<string, unknown>)?.deal_id ?? null : null;
          return await finish(
            r,
            { account_id: p.account_id, deal_type_id: p.deal_type_id, deal_id: dealId },
            { deal_id: dealId },
          );
        }
        case "deal_list": {
          const r = await sarekon.listDeals(p.deal_ids ?? [], limit ?? 100);
          return json({ ok: r.ok, diagnosis: diagnose(r), deals: r.ok ? r.body : [] });
        }
        case "deal_show": {
          if (!p.deal_id) return json({ error: "deal_id required" }, 400);
          const r = await sarekon.showDeal(p.deal_id);
          return json({ ok: r.ok, diagnosis: diagnose(r), deal: r.ok ? r.body : null });
        }
        case "deal_unwind": {
          if (!p.deal_id) return json({ error: "deal_id required" }, 400);
          return await finish(await sarekon.unwindDeal(p.deal_id), { deal_id: p.deal_id });
        }
      }
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
