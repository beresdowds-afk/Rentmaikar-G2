import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestRecords, serviceClient } from "../_shared/telemetry-ingest-core.ts";

/**
 * telemetry-ingest — server-side Resident Orchestrator entry point.
 *
 * Accepts one or more raw telemetry records (MQTT topic payloads, Traccar
 * positions, or already-normalised events), reduces them into canonical
 * vehicle state, derives analytics, and persists everything server-side so
 * orchestration no longer depends on a browser tab being open.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function isTrustedCaller(req: Request): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && provided === cronSecret) return true;

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  if (serviceKey && auth.slice(7) === serviceKey) return true;

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;

  const admin = serviceClient();
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "iot_support"])
    .maybeSingle();
  if (role) return true;

  const { data: staff } = await admin
    .from("support_staff")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .in("support_type", ["iot_installation", "iot_maintenance"])
    .maybeSingle();
  return !!staff;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!(await isTrustedCaller(req))) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body?.events)
      ? body.events
      : Array.isArray(body)
      ? body
      : body?.event
      ? [body.event]
      : [body];

    const records = (raw as unknown[])
      .filter((r) => r && typeof r === "object")
      .slice(0, 500) as Record<string, unknown>[];

    if (!records.length) return json({ error: "No telemetry records supplied" }, 400);

    const result = await ingestRecords(serviceClient(), records);
    return json({ success: true, ...result });
  } catch (err) {
    console.error("[telemetry-ingest]", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
