// Provider-agnostic telemetry dispatcher. Resolves the ACTIVE provider from
// telemetry_providers (admin toggle) and routes state reads + commands through
// the matching adapter, so flipping the switch in the Admin dashboard actually
// changes which backend drives vehicles.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import {
  adapters,
  getActiveProviderName,
  isProviderConfigured,
  sendCommandWithFallback,
  testProvider,
  type TelemetryProviderName,
} from "../_shared/telemetry-client.ts";
import { traccar } from "../_shared/traccar-client.ts";
import { sarekon } from "../_shared/sarekon-client.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const Body = z.object({
  action: z.enum(["get_active_provider", "test_connection", "device_state", "send_command"]),
  provider: z.enum(["emqx", "traccar", "sarekon"]).optional(),
  device_id: z.string().min(1).max(128).optional(),
  vehicle_id: z.string().uuid().optional(),
  command: z.string().min(2).max(48).optional(),
  payload: z.record(z.unknown()).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);
    const { data: u, error: uErr } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return json({ error: "Unauthenticated" }, 401);
    const actor = u.user.id;
    const { data: roleRow } = await supa
      .from("user_roles")
      .select("role")
      .eq("user_id", actor)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { action, provider, device_id, vehicle_id, command, payload } = parsed.data;

    const active = await getActiveProviderName();

    if (action === "get_active_provider") {
      // Warm admin-managed credentials so "configured" reflects vault/settings too.
      await Promise.all([
        traccar.ensureReady().catch(() => {}),
        sarekon.ensureReady().catch(() => {}),
      ]);
      const status: Record<string, unknown> = {};
      for (const name of ["emqx", "traccar", "sarekon"] as TelemetryProviderName[]) {
        status[name] = { configured: isProviderConfigured(name) };
      }
      return json({ ok: true, active, providers: status });
    }

    if (action === "test_connection") {
      const target = (provider ?? active) as TelemetryProviderName;
      const result = await testProvider(target);
      await supa.from("iot_audit_log").insert({
        performed_by: actor,
        action: "telemetry_provider_tested",
        details: { provider: target, ...result },
      } as never);
      return json({ ok: true, provider: target, ...result });
    }

    if (!device_id && !vehicle_id) {
      return json({ error: "device_id or a linked vehicle_id is required" }, 400);
    }

    let candidates: Array<{
      id: string;
      vehicle_id: string | null;
      provider_device_id: string | null;
      serial_number: string | null;
    }> = [];
    if (vehicle_id) {
      const { data, error } = await supa
        .from("iot_devices")
        .select("id, vehicle_id, provider_device_id, serial_number")
        .eq("provider", active)
        .eq("status", "active")
        .eq("telemetry_enabled", true)
        .eq("vehicle_id", vehicle_id)
        .limit(2);
      if (error) throw error;
      candidates = data ?? [];
    }
    if (device_id) {
      const byProviderId = await supa
        .from("iot_devices")
        .select("id, vehicle_id, provider, provider_device_id, serial_number, status, telemetry_enabled")
        .eq("provider", active)
        .eq("status", "active")
        .eq("telemetry_enabled", true)
        .eq("provider_device_id", device_id)
        .limit(2);
      const bySerial = await supa
        .from("iot_devices")
        .select("id, vehicle_id, provider, provider_device_id, serial_number, status, telemetry_enabled")
        .eq("provider", active)
        .eq("status", "active")
        .eq("telemetry_enabled", true)
        .eq("serial_number", device_id)
        .limit(2);
      if (byProviderId.error) throw byProviderId.error;
      if (bySerial.error) throw bySerial.error;
      candidates = [
        ...candidates,
        ...(byProviderId.data ?? []),
        ...(bySerial.data ?? []),
      ];
    }
    const matchingDevices = [...new Map(candidates.map((row) => [row.id, row])).values()]
      .filter((row) => !vehicle_id || row.vehicle_id === vehicle_id);
    if (matchingDevices.length !== 1) return json({ error: "Registered active device not found" }, 404);
    const device = matchingDevices[0];
    const target = device.provider_device_id || device.serial_number;
    if (!target) return json({ error: "Registered device has no provider identifier" }, 409);

    const adapter = adapters[active];

    if (action === "device_state") {
      let state = await adapter.getDeviceState(target);
      let usedProvider = active;
      if (!state.online && !state.lastSeen) {
        for (const other of ["traccar", "sarekon", "emqx"] as TelemetryProviderName[]) {
          if (other === active || !isProviderConfigured(other)) continue;
          const alt = await adapters[other].getDeviceState(target);
          if (alt.online || alt.lastSeen) {
            state = alt;
            usedProvider = other;
            break;
          }
        }
      }
      return json({ ok: true, provider: usedProvider, state });
    }

    if (!command) return json({ error: "command required" }, 400);
    const rl = await checkRateLimit(actor, "telemetry-dispatch:send_command", 20);
    if (!rl.allowed) {
      return json({ ok: false, error: "rate_limited", retry_after_seconds: rl.retry_after_seconds }, 429);
    }

    const res = await sendCommandWithFallback(target, command, payload ?? {});
    await supa.from("iot_audit_log").insert({
      performed_by: actor,
      action: `telemetry_command_${command}`,
      vehicle_id: vehicle_id ?? null,
      details: { provider: res.provider, fell_back: res.fell_back ?? false, device: target, command, payload: payload ?? {}, response: res },
    } as never);

    return json({ ok: res.ok, ...res });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
