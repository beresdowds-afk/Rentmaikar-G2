// Admin-only Traccar operations: config check, list, pull sync (writes to
// iot_devices + mqtt_telemetry_logs enriched with vehicle_id), remote
// commands (engineStop/engineResume/custom), device→vehicle linking, and
// a persistent iot_sync_state row for the ingestion monitor. All lifecycle
// commands are logged to iot_audit_log.
import { adaptTraccarPositions } from "../_shared/location-adapters/traccar.ts";
import { persistLocations } from "../_shared/unified-location-service.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import {
  traccar, authMode, missingCredentials,
  type TraccarDevice, type TraccarPosition, type TraccarResult,
} from "../_shared/traccar-client.ts";

import { checkRateLimit } from "../_shared/rate-limit.ts";

const Body = z.object({
  action: z.enum([
    "status",
    "test_connection",
    "list_devices",
    "sync",
    "send_command",
    "link_device",
    "unlink_device",
    "get_sync_state",
    "validate_link",
    "command_types",

  ]),
  device_id: z.number().int().positive().optional(),
  device_row_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  vehicle_ids: z.array(z.string().uuid()).optional(),
  command: z.string().min(2).max(48).optional(),
  attributes: z.record(z.unknown()).optional(),
});

const KNOTS_TO_KMH = 1.852;
const PROVIDER = "traccar";

interface Diagnosis {
  code: string;
  title: string;
  detail: string;
  hints: string[];
  status?: number;
  latency_ms?: number;
}

/** Turn a raw Traccar result into an actionable, human-readable failure reason. */
function diagnose(r: TraccarResult, latency_ms?: number): Diagnosis {
  if (r.ok) {
    return {
      code: "ok",
      title: "Connection successful",
      detail: "Traccar responded with valid credentials.",
      hints: [],
      latency_ms,
    };
  }
  if (r.reason === "not_configured") {
    return {
      code: "not_configured",
      title: "Traccar credentials are missing",
      detail: `Missing: ${(r.missing ?? []).join(", ") || "credentials"}.`,
      hints: [
        "Set the base URL plus an API token, or the tracker email + password, in the Credentials tab.",
      ],
      latency_ms,
    };
  }
  if (r.reason === "network_error") {
    const msg = r.message || "";
    const dns = /dns|getaddrinfo|name not resolved/i.test(msg);
    const tls = /certificate|tls|ssl/i.test(msg);
    const timeout = /timed? ?out|abort/i.test(msg);
    return {
      code: dns ? "dns_error" : tls ? "tls_error" : timeout ? "timeout" : "network_error",
      title: dns
        ? "Server hostname could not be resolved"
        : tls
        ? "TLS/SSL handshake failed"
        : timeout
        ? "Traccar server timed out"
        : "Could not reach the Traccar server",
      detail: msg,
      hints: [
        "Confirm the base URL is correct and publicly reachable over HTTPS.",
        tls ? "Self-signed certificates are rejected — install a trusted certificate." : "Check firewall rules and that the server is running.",
      ],
      latency_ms,
    };
  }
  const status = r.status;
  const bodyTxt = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {});
  if (status === 401) {
    return {
      code: "invalid_credentials",
      title: "Invalid Traccar credentials",
      detail: r.auth_mode === "token"
        ? "The API token was rejected (HTTP 401) and no email/password fallback is configured."
        : "The API token and the email/password fallback were both rejected (HTTP 401).",
      hints: [
        "Re-enter the tracker email and password in the Credentials tab and save — they are used automatically whenever the token fails.",
        "If using a token, regenerate it in Traccar → Settings → Account → Tokens.",
      ],
      status,
      latency_ms,
    };
  }
  if (status === 403) {
    return {
      code: "missing_permissions",
      title: "Account lacks the required permissions",
      detail: "Traccar accepted the credentials but refused the request (HTTP 403).",
      hints: [
        "Use a Traccar account with administrator or manager rights for the fleet.",
        "Confirm the account is not disabled or expired in Traccar.",
      ],
      status,
      latency_ms,
    };
  }
  if (status === 404) {
    return {
      code: "bad_base_url",
      title: "Traccar API not found at this URL",
      detail: "HTTP 404 — the base URL does not point at a Traccar API root.",
      hints: [
        "Use the server root (e.g. https://traccar.example.com) — do not append /api.",
      ],
      status,
      latency_ms,
    };
  }
  if (status >= 500) {
    return {
      code: "provider_unavailable",
      title: "Traccar server error",
      detail: `HTTP ${status} — ${bodyTxt.slice(0, 200)}`,
      hints: ["The Traccar server is failing; check its logs and retry."],
      status,
      latency_ms,
    };
  }
  return {
    code: "provider_error",
    title: `Traccar returned HTTP ${status}`,
    detail: bodyTxt.slice(0, 300),
    hints: ["Verify the base URL and credentials, then test again."],
    status,
    latency_ms,
  };
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const providedCron = req.headers.get("x-cron-secret") ?? "";
    const isCron = !!cronSecret && providedCron === cronSecret;

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let actor: string | null = null;
    if (!isCron) {
      if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);
      const { data: u, error: uErr } = await supa.auth.getUser(auth.replace("Bearer ", ""));
      if (uErr || !u?.user) return json({ error: "Unauthenticated" }, 401);
      actor = u.user.id;
      // Authoritative role check straight off user_roles with the service
      // client (RLS-exempt). The has_role RPC can fail silently when EXECUTE
      // grants change, which previously produced a false "Admin only" 403.
      const { data: roleRows, error: roleErr } = await supa
        .from("user_roles")
        .select("role")
        .eq("user_id", actor)
        .in("role", ["admin", "iot_support"]);
      if (roleErr) {
        console.error("role lookup failed", roleErr);
        return json({ error: "Role check failed" }, 500);
      }
      if (!roleRows || roleRows.length === 0) return json({ error: "Admin only" }, 403);
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { action, device_id, device_row_id, vehicle_id, vehicle_ids, command, attributes } = parsed.data;

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

    const setSyncState = async (patch: Record<string, unknown>) => {
      await supa.from("iot_sync_state").upsert(
        { provider: PROVIDER, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "provider" },
      );
    };

    // Admin-visible activity feed (mirrors the Hologram sync feed).
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
      const { data } = await supa
        .from("iot_sync_state").select("*").eq("provider", PROVIDER).maybeSingle();
      return json({ ok: true, state: data });
    }

    await traccar.ensureReady();

    if (!traccar.isConfigured()) {
      const missing = missingCredentials();
      const payload = {
        ok: true,
        configured: false,
        base_url: null,
        message:
          "Traccar is not configured. Set the base URL and either an API token or the tracker email + password.",
        diagnosis: {
          code: "not_configured",
          title: "Traccar credentials are missing",
          detail: `Missing: ${missing.join(", ") || "credentials"}.`,
          hints: [
            "Open the Credentials tab and set the Traccar base URL (e.g. https://traccar.example.com — no trailing /api).",
            "Provide an API token, or the tracker account email + password.",
          ],
          missing,
        },
      };
      if (action === "test_connection") {
        await activity("test_connection_failed", "warn", "Test connection: credentials missing", { missing });
      }
      return json(payload);
    }

    if (action === "status" || action === "test_connection") {
      const started = Date.now();
      // /health is unauthenticated (per the API reference) so it separates
      // "server unreachable" from "credentials rejected".
      const health = await traccar.health();
      const ping = await traccar.ping();
      const latency_ms = Date.now() - started;
      const diagnosis = diagnose(ping, latency_ms);
      const session = ping.ok ? await traccar.sessionUser() : null;
      const account = session?.ok
        ? {
          id: (session.body as { id?: number }).id ?? null,
          name: (session.body as { name?: string }).name ?? null,
          email: (session.body as { email?: string }).email ?? null,
          administrator: (session.body as { administrator?: boolean }).administrator ?? false,
        }
        : null;
      if (action === "test_connection") {
        await audit({ action: "traccar_connection_tested", details: { ok: ping.ok, diagnosis, account } });
        await activity(
          ping.ok ? "test_connection_ok" : "test_connection_failed",
          ping.ok ? "info" : "error",
          ping.ok
            ? `Connected to ${(ping.body as { name?: string } | undefined)?.name ?? "Traccar"} in ${latency_ms}ms`
            : `${diagnosis.title} — ${diagnosis.detail}`,
          { diagnosis, auth_mode: authMode(), base_url: traccar.baseUrl(), reachable: health.ok, account },
        );
      }
      // Some deployments disable the unauthenticated /health endpoint; an
      // authenticated /server success also proves reachability.
      const reachable = health.ok || ping.ok;
      return json({
        ok: true,
        configured: true,
        base_url: traccar.baseUrl(),
        auth_mode: authMode(),
        latency_ms,
        reachable,
        server_version: ping.ok ? (ping.body as { version?: string }).version ?? null : null,
        account,
        ping,
        diagnosis,
      });
    }

    if (action === "list_devices") {
      const r = await traccar.listAllDevices();
      return json({
        ok: r.ok,
        base_url: traccar.baseUrl(),
        diagnosis: diagnose(r),
        count: r.ok ? (r.body as TraccarDevice[]).length : 0,
        ...r,
      });
    }

    if (action === "command_types") {
      const r = await traccar.commandTypes(device_id);
      return json({ ok: r.ok, diagnosis: diagnose(r), ...r });
    }



    if (action === "sync") {
      const startedMs = Date.now();
      await setSyncState({ state: "running", last_sync_at: new Date().toISOString() });
      await activity("sync_started", "info", "Traccar device sync started", {
        triggered_by: isCron ? "schedule" : "admin",
        vehicle_scoped: !!(vehicle_ids && vehicle_ids.length),
      });
      const deviceErrors: Array<{ device: string; error: string }> = [];
      const dr = await traccar.listAllDevices();
      if (!dr.ok) {
        const dg = diagnose(dr);
        await setSyncState({
          state: "error",
          last_error_at: new Date().toISOString(),
          last_error: `${dg.title}: ${dg.detail}`,
        });
        await activity("device_fetch_failed", "error", `${dg.title} — ${dg.detail}`, { diagnosis: dg });
        return json({ ok: false, step: "devices", diagnosis: dg, ...dr }, 502);
      }


      // Optional vehicle-scope filter — sync only devices linked to these vehicles
      let vehicleFilter: Set<string> | null = null;
      if (vehicle_ids && vehicle_ids.length > 0) {
        vehicleFilter = new Set(vehicle_ids);
      }

      const pr = await traccar.latestPositions();
      if (!pr.ok) {
        const pdg = diagnose(pr);
        await activity("position_fetch_failed", "warn", `${pdg.title} — ${pdg.detail}`, { diagnosis: pdg });
        deviceErrors.push({ device: "*", error: `${pdg.code}: ${pdg.detail}` });
      }
      const positions: TraccarPosition[] = pr.ok ? pr.body : [];
      const posByDevice = new Map<number, TraccarPosition>();
      for (const p of positions) posByDevice.set(p.deviceId, p);


      let upserts = 0;
      let inserts = 0;
      let skippedByFilter = 0;
      const nowIso = new Date().toISOString();
      for (const d of dr.body as TraccarDevice[]) {
        const p = posByDevice.get(d.id);
        const status = d.status === "online" ? "active" : d.status === "offline" ? "offline" : "unknown";
        const serial = d.uniqueId || `traccar-${d.id}`;

        const { data: existing } = await supa
          .from("iot_devices")
          .select("id, vehicle_id")
          .eq("serial_number", serial)
          .maybeSingle();

        if (vehicleFilter) {
          if (!existing?.vehicle_id || !vehicleFilter.has(existing.vehicle_id)) {
            skippedByFilter++;
            continue;
          }
        }

        const row = {
          serial_number: serial,
          provider: "traccar",
          provider_device_id: String(d.id),
          device_model: d.model ?? null,
          status,
          last_ping: d.lastUpdate ?? nowIso,
          telemetry_enabled: !d.disabled,
          latitude: p?.latitude ?? null,
          longitude: p?.longitude ?? null,
          health_details: {
            traccar_device_id: d.id,
            positionId: d.positionId,
            phone: d.phone,
            contact: d.contact,
            attributes: d.attributes ?? {},
            last_position: p
              ? { speed_kmh: (p.speed || 0) * KNOTS_TO_KMH, course: p.course, address: p.address }
              : null,
          },
        };
        const { data: upserted, error } = await supa
          .from("iot_devices")
          .upsert(row, { onConflict: "serial_number" })
          .select("id, vehicle_id")
          .maybeSingle();
        if (error) deviceErrors.push({ device: serial, error: error.message });
        else upserts++;

        const linkedVehicleId = upserted?.vehicle_id ?? existing?.vehicle_id ?? null;

        if (p) {
          // Unified location pipeline: one normalized shape, shared fleet map.
          try {
            const normalized = adaptTraccarPositions([p as never], {
              serials: new Map([[String(d.id), serial]]),
            });
            if (normalized.length) {
              await persistLocations(supa as never, normalized, { writeHistory: false, publishMqtt: true });
            }
          } catch (e) {
            deviceErrors.push({ device: serial, error: `unified_location: ${(e as Error).message}` });
          }
          const { error: telErr } = await supa.from("mqtt_telemetry_logs").insert({
            data_type: "traccar_position",
            vehicle_id: linkedVehicleId ?? serial,
            payload: {
              lat: p.latitude, lng: p.longitude,
              speed_kmh: (p.speed || 0) * KNOTS_TO_KMH,
              course: p.course, valid: p.valid, address: p.address,
              attributes: p.attributes,
              device_time: p.deviceTime, fix_time: p.fixTime,
              iot_device_id: upserted?.id ?? existing?.id ?? null,
              linked_vehicle_id: linkedVehicleId,
            },
            mqtt_topic: `traccar/${serial}/position`,
            received_at: p.serverTime || nowIso,
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
      for (const de of deviceErrors.slice(0, 25)) {
        await activity("device_sync_error", "error", `${de.device}: ${de.error}`, de);
      }
      await activity(
        "sync_completed",
        hasErrors ? "warn" : "info",
        `Synced ${upserts} device(s), imported ${inserts} position(s) in ${Date.now() - startedMs}ms` +
          (hasErrors ? ` — ${deviceErrors.length} error(s)` : ""),
        {
          devices_synced: upserts,
          positions_received: positions.length,
          positions_imported: inserts,
          skipped_by_vehicle_filter: skippedByFilter,
          duration_ms: Date.now() - startedMs,
          errors: deviceErrors.slice(0, 25),
        },
      );
      return json({
        ok: true,
        devices_synced: upserts,
        positions_received: positions.length,
        positions_imported: inserts,
        skipped_by_vehicle_filter: skippedByFilter,
        vehicle_scoped: !!vehicleFilter,
        device_errors: deviceErrors.slice(0, 25),
      });

    }

    // Pre-link validation — is the target vehicle free of another traccar device?
    if (action === "validate_link") {
      if (!vehicle_id) return json({ ok: true, conflict: false });
      const { data: existing } = await supa
        .from("iot_devices")
        .select("id, serial_number, provider")
        .eq("vehicle_id", vehicle_id)
        .maybeSingle();
      if (!existing) return json({ ok: true, conflict: false });
      if (device_row_id && existing.id === device_row_id) return json({ ok: true, conflict: false });
      return json({
        ok: true, conflict: true,
        existing_device: existing,
        message: `Vehicle already linked to ${existing.provider} device ${existing.serial_number}. Unlink it first.`,
      });
    }


    if (action === "send_command") {
      if (!device_id || !command) return json({ error: "device_id and command required" }, 400);
      // Server-side rate limit: cap per admin (or 'cron') to prevent replay floods.
      if (!isCron) {
        const rl = await checkRateLimit(actor ?? "anonymous", "traccar-admin:send_command", 20);
        if (!rl.allowed) {
          await audit({
            action: `traccar_command_${command}_rate_limited`,
            details: { traccar_device_id: device_id, retry_after_seconds: rl.retry_after_seconds },
          });
          return json(
            { ok: false, error: "rate_limited", retry_after_seconds: rl.retry_after_seconds },
            429,
          );
        }
      }
      const attrs = attributes ?? {};
      // Pre-flight: the API reference rejects command types the device's
      // protocol does not support with a bare 400 — check first for a clear error.
      const types = await traccar.commandTypes(device_id);
      if (types.ok && Array.isArray(types.body) && types.body.length > 0) {
        const supported = types.body.map((t) => t.type);
        if (!supported.includes(command)) {
          await audit({
            action: `traccar_command_${command}_unsupported`,
            details: { traccar_device_id: device_id, supported },
          });
          return json({
            ok: false,
            error: "unsupported_command",
            message: `Device does not support "${command}" on its current protocol.`,
            supported_commands: supported,
          }, 400);
        }
      }
      const r = await traccar.sendCommand(device_id, command, attrs);

      // Try to resolve the local iot_devices row/vehicle from health_details.traccar_device_id
      const { data: match } = await supa
        .from("iot_devices")
        .select("id, vehicle_id, serial_number, health_details")
        .eq("provider", "traccar")
        .contains("health_details", { traccar_device_id: device_id } as never)
        .maybeSingle();
      const queued = r.ok && r.queued === true;
      await audit({
        action: `traccar_command_${command}`,
        device_id: match?.id ?? null,
        vehicle_id: match?.vehicle_id ?? null,
        details: {
          ok: r.ok,
          queued,
          traccar_device_id: device_id,
          command,
          attributes: attrs,
          serial_number: match?.serial_number ?? null,
          request: {
            endpoint: "/api/commands/send",
            method: "POST",
            payload: { deviceId: device_id, type: command, attributes: attrs },
          },
          response: r,
          replayed_from: (attributes as Record<string, unknown>)?.__replay_of ?? null,
        },
      });
      return json({
        ok: r.ok,
        queued,
        // HTTP 202 means Traccar stored the command for an offline device and
        // will deliver it on the next connection.
        delivery: r.ok ? (queued ? "queued_offline" : "sent") : "failed",
        diagnosis: diagnose(r),
        ...r,
      });

    }

    if (action === "link_device" || action === "unlink_device") {
      if (!device_row_id) return json({ error: "device_row_id required" }, 400);

      // Pre-link validation for link_device
      if (action === "link_device" && vehicle_id) {
        const { data: conflict } = await supa
          .from("iot_devices")
          .select("id, serial_number, provider")
          .eq("vehicle_id", vehicle_id)
          .neq("id", device_row_id)
          .maybeSingle();
        if (conflict) {
          return json({
            ok: false, conflict: true, existing_device: conflict,
            error: `Vehicle already linked to ${conflict.provider} device ${conflict.serial_number}. Unlink that device first.`,
          }, 409);
        }
        // Also check SIM cards linked to this vehicle so admin knows the topology
        const { data: simConflict } = await supa
          .from("iot_sim_cards").select("id, iccid, provider")
          .eq("vehicle_id", vehicle_id).maybeSingle();
        // sim on same vehicle is fine, we just include it in the response for visibility
        const payload = { vehicle_id: vehicle_id ?? null, is_linked: !!vehicle_id };
        const { data: row, error } = await supa
          .from("iot_devices").update(payload).eq("id", device_row_id)
          .select("id, serial_number, vehicle_id").maybeSingle();
        if (error) return json({ error: error.message }, 400);
        await audit({
          action: "traccar_device_linked",
          device_id: row?.id ?? null, vehicle_id: row?.vehicle_id ?? null,
          details: { serial_number: row?.serial_number, sim_on_vehicle: simConflict ?? null },
        });
        return json({ ok: true, row, sim_on_vehicle: simConflict ?? null });
      }

      const payload = action === "unlink_device"
        ? { vehicle_id: null, is_linked: false }
        : { vehicle_id: vehicle_id ?? null, is_linked: !!vehicle_id };
      const { data: row, error } = await supa
        .from("iot_devices").update(payload).eq("id", device_row_id)
        .select("id, serial_number, vehicle_id").maybeSingle();
      if (error) return json({ error: error.message }, 400);
      await audit({
        action: action === "unlink_device" ? "traccar_device_unlinked" : "traccar_device_linked",
        device_id: row?.id ?? null, vehicle_id: row?.vehicle_id ?? null,
        details: { serial_number: row?.serial_number },
      });
      return json({ ok: true, row });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (e) {
    console.error("traccar-admin error", e);
    await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ).from("iot_sync_state").upsert(
      {
        provider: PROVIDER,
        state: "error",
        last_error_at: new Date().toISOString(),
        last_error: (e as Error).message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
