// Offline / last-seen telemetry alerts.
// Scans iot_devices for trackers that have not reported telemetry within a
// configurable threshold and raises admin notifications + an entry in the
// IoT sync activity feed. Callable from the admin UI or from cron.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const Body = z.object({
  action: z.enum(["get_config", "set_config", "check"]),
  threshold_minutes: z.number().int().min(5).max(10080).optional(),
  enabled: z.boolean().optional(),
  notify: z.boolean().optional(),
});

const CONFIG_KEY = "iot_offline_alert_config";
const STATE_KEY = "iot_offline_alert_state";
const DEFAULTS = { enabled: true, threshold_minutes: 60 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const isCron = !!cronSecret && (req.headers.get("x-cron-secret") ?? "") === cronSecret;

    let actor: string | null = null;
    if (!isCron) {
      const auth = req.headers.get("Authorization") ?? "";
      if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);
      const { data: u } = await supa.auth.getUser(auth.replace("Bearer ", ""));
      if (!u?.user) return json({ error: "Unauthenticated" }, 401);
      actor = u.user.id;
      const { data: roles } = await supa
        .from("user_roles").select("role").eq("user_id", actor)
        .in("role", ["admin", "iot_support"]);
      if (!roles || roles.length === 0) return json({ error: "Admin only" }, 403);
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { action } = parsed.data;

    const readKv = async <T,>(key: string, fallback: T): Promise<T> => {
      const { data } = await supa
        .from("platform_kv_settings").select("value").eq("key", key).maybeSingle();
      return ((data as { value?: T } | null)?.value ?? fallback) as T;
    };
    const writeKv = async (key: string, value: unknown) => {
      await supa.from("platform_kv_settings").upsert(
        { key, value, updated_at: new Date().toISOString() } as never,
        { onConflict: "key" },
      );
    };

    const config = { ...DEFAULTS, ...(await readKv(CONFIG_KEY, {})) };

    if (action === "get_config") return json({ ok: true, config });

    if (action === "set_config") {
      const next = {
        enabled: parsed.data.enabled ?? config.enabled,
        threshold_minutes: parsed.data.threshold_minutes ?? config.threshold_minutes,
      };
      await writeKv(CONFIG_KEY, next);
      await supa.from("iot_sync_activity_log").insert({
        provider: "traccar",
        event: "offline_alert_config_updated",
        level: "info",
        message: `Offline alert threshold set to ${next.threshold_minutes} minute(s)` +
          (next.enabled ? "" : " (alerts disabled)"),
        details: { ...next, updated_by: actor },
      } as never);
      return json({ ok: true, config: next });
    }

    // action === "check"
    const threshold = parsed.data.threshold_minutes ?? config.threshold_minutes;
    const cutoff = new Date(Date.now() - threshold * 60_000);

    const { data: devices, error } = await supa
      .from("iot_devices")
      .select("id, serial_number, vehicle_id, last_ping, status, provider")
      .eq("telemetry_enabled", true);
    if (error) return json({ ok: false, error: error.message }, 500);

    const stale = (devices ?? []).filter((d) => {
      const lp = d.last_ping ? new Date(d.last_ping) : null;
      return !lp || lp < cutoff;
    }).map((d) => ({
      id: d.id,
      serial_number: d.serial_number,
      vehicle_id: d.vehicle_id,
      last_ping: d.last_ping,
      provider: d.provider,
      minutes_since: d.last_ping
        ? Math.round((Date.now() - new Date(d.last_ping).getTime()) / 60_000)
        : null,
    }));

    const shouldNotify = parsed.data.notify ?? true;
    let notified = 0;

    if (shouldNotify && stale.length > 0 && config.enabled) {
      // Cooldown: never re-alert the same device more than once per threshold window.
      const state = await readKv<Record<string, string>>(STATE_KEY, {});
      const dueNow = stale.filter((d) => {
        const last = state[d.id] ? new Date(state[d.id]).getTime() : 0;
        return Date.now() - last > threshold * 60_000;
      });

      if (dueNow.length > 0) {
        const { data: admins } = await supa
          .from("user_roles").select("user_id").in("role", ["admin", "iot_support"]);
        const recipients = [...new Set((admins ?? []).map((a) => a.user_id))];

        const rows = recipients.flatMap((recipient_id) =>
          dueNow.map((d) => ({
            recipient_id,
            kind: "iot_device_offline",
            title: `Device offline: ${d.serial_number}`,
            body: d.last_ping
              ? `No telemetry for ${d.minutes_since} minute(s) (threshold ${threshold}m).`
              : `This device has never reported telemetry (threshold ${threshold}m).`,
            metadata: {
              device_id: d.id,
              serial_number: d.serial_number,
              vehicle_id: d.vehicle_id,
              last_ping: d.last_ping,
              threshold_minutes: threshold,
            },
          }))
        );
        if (rows.length > 0) {
          const { error: nErr } = await supa.from("admin_notifications").insert(rows as never);
          if (!nErr) notified = dueNow.length;
        }
        const now = new Date().toISOString();
        for (const d of dueNow) state[d.id] = now;
        await writeKv(STATE_KEY, state);
      }

      await supa.from("iot_sync_activity_log").insert({
        provider: "traccar",
        event: "offline_alert_check",
        level: stale.length > 0 ? "warn" : "info",
        message: `${stale.length} device(s) silent for over ${threshold} minute(s); ${notified} alert(s) raised`,
        details: { threshold_minutes: threshold, stale: stale.slice(0, 50), triggered_by: isCron ? "schedule" : actor },
      } as never);
    }

    return json({
      ok: true,
      threshold_minutes: threshold,
      enabled: config.enabled,
      checked: devices?.length ?? 0,
      stale_count: stale.length,
      notified,
      stale: stale.slice(0, 200),
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
