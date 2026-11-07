import { corsHeaders } from "../_shared/cors.ts";
import { ingestRecords, serviceClient } from "../_shared/telemetry-ingest-core.ts";
import { isTrustedInternalRequest } from "../_shared/internal-auth.ts";

/**
 * telemetry-ingest — trusted server-side Resident Orchestrator entry point.
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

function isTrustedCaller(req: Request): boolean {
  return isTrustedInternalRequest(
    req.headers,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    Deno.env.get("CRON_SECRET") ?? "",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!isTrustedCaller(req)) return json({ error: "Unauthorized" }, 401);

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
    return json({ error: "Internal error" }, 500);
  }
});
