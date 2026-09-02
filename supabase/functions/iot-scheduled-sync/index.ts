// Cron-triggered runner: reads iot_sync_schedule and dispatches Hologram usage
// sync and Traccar position sync when the configured interval has elapsed.
// Protected by CRON_SECRET (x-cron-secret header) or service-role Bearer token.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-cron-secret") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(CRON_SECRET && provided === CRON_SECRET) && bearer !== SERVICE_KEY) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: schedules } = await supa.from("iot_sync_schedule").select("*");
  const results: Record<string, any> = {};

  for (const s of schedules ?? []) {
    if (!s.enabled) { results[s.provider] = { skipped: "disabled" }; continue; }

    const { data: state } = await supa.from("iot_sync_state").select("last_success_at").eq("provider", s.provider).maybeSingle();
    const last = state?.last_success_at ? new Date(state.last_success_at).getTime() : 0;
    const elapsedMin = (Date.now() - last) / 60000;
    if (elapsedMin < s.interval_minutes) {
      results[s.provider] = { skipped: "interval_not_reached", elapsed_min: Math.round(elapsedMin) };
      continue;
    }

    try {
      if (s.provider === "hologram") {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/hologram-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET, Authorization: `Bearer ${SERVICE_KEY}` },
          body: "{}",
        });
        results.hologram = { status: r.status, body: await r.json().catch(() => null) };
      } else if (s.provider === "traccar") {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/traccar-admin`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET, Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ action: "sync" }),
        });
        results.traccar = { status: r.status, body: await r.json().catch(() => null) };
      } else if (s.provider === "sarekon") {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/sarekon-admin`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET, Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ action: "sync" }),
        });
        results.sarekon = { status: r.status, body: await r.json().catch(() => null) };
      }
    } catch (e) {
      results[s.provider] = { error: (e as Error).message };
    }
  }

  return new Response(JSON.stringify({ ok: true, results, at: new Date().toISOString() }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
