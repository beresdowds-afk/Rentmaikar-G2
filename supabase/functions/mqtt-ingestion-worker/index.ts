import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";
import { EmqxApiError, resolveEmqxClient } from "../_shared/emqx-client.ts";
import { ingestRecords, logIngestRun, serviceClient } from "../_shared/telemetry-ingest-core.ts";

/**
 * mqtt-ingestion-worker — scheduled server-side MQTT ingestion.
 *
 * Runs every minute (pg_cron). Because EMQX Serverless offers no persistent
 * subscriber slot for an edge runtime, the worker pulls the latest retained
 * telemetry message per active vehicle topic through the management API and
 * feeds it into the server-side Resident Orchestrator. Every run is logged in
 * telemetry_ingest_runs, and the worker degrades gracefully (never 500s) when
 * the management API is unreachable — device telemetry paths are unaffected.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TOPIC_SUFFIXES = ["telemetry", "location", "status"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireCronSecretAsync(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const admin = serviceClient();

  const finish = async (row: Record<string, unknown>) => {
    await logIngestRun(admin, { ...row, duration_ms: Date.now() - startedAt });
    return json({ success: true, ...row });
  };

  try {
    const { client, config, unavailable } = await resolveEmqxClient();

    if (!client) {
      return await finish({
        source: "mqtt_worker",
        provider: "emqx",
        broker_reachable: false,
        degraded_reason: unavailable!.reason,
      });
    }

    // Vehicles we care about: linked, telemetry-enabled IoT devices.
    const { data: devices } = await admin
      .from("iot_devices")
      .select("vehicle_id")
      .not("vehicle_id", "is", null)
      .eq("telemetry_enabled", true)
      .limit(500);

    const vehicleIds = [
      ...new Set((devices ?? []).map((d: Record<string, unknown>) => String(d.vehicle_id))),
    ];

    if (!vehicleIds.length) {
      // Nothing to pull: still probe the broker so the dashboard shows real health.
      const probe = await client.ping();
      return await finish({
        source: "mqtt_worker",
        provider: "emqx",
        broker_reachable: probe.ok,
        degraded_reason: probe.ok ? null : "management_api_unreachable",
        error: probe.ok
          ? null
          : `credential_source=${config.credentials_source} status=${probe.status ?? "n/a"} url=${client.apiUrl} detail=${probe.detail.slice(0, 200)}`,
        devices_seen: 0,
        events_processed: 0,
      });
    }

    const records: Record<string, unknown>[] = [];
    let reachable = false;
    let degradedReason: string | null = null;

    for (const vehicleId of vehicleIds) {
      for (const suffix of TOPIC_SUFFIXES) {
        const topic = `rentmaikar/vehicle/${vehicleId}/${suffix}`;
        try {
          // `retained()` returns null for 404 ("no retained message on that topic").
          const msg = await client.retained(topic);
          reachable = true;
          const payloadRaw = msg?.payload;
          if (payloadRaw == null) continue;
          let payload: Record<string, unknown>;
          try {
            payload = typeof payloadRaw === "string" ? JSON.parse(payloadRaw) : payloadRaw as Record<string, unknown>;
          } catch {
            payload = { raw: payloadRaw };
          }
          records.push({
            source: "mqtt",
            topic,
            vehicleId,
            eventType: suffix,
            timestamp: msg?.publish_at
              ? new Date(Number(msg.publish_at)).toISOString()
              : new Date().toISOString(),
            payload,
          });
        } catch (e) {
          if (e instanceof EmqxApiError) degradedReason = e.classified.reason;
          else degradedReason = "request_failed";
        }
      }
    }


    if (!reachable && degradedReason) {
      return await finish({
        source: "mqtt_worker",
        provider: "emqx",
        broker_reachable: false,
        devices_seen: vehicleIds.length,
        degraded_reason: degradedReason,
      });
    }

    const result = await ingestRecords(admin, records);

    return await finish({
      source: "mqtt_worker",
      provider: "emqx",
      broker_reachable: true,
      devices_seen: vehicleIds.length,
      events_processed: result.processed,
      analytics_emitted: result.analytics,
      degraded_reason: degradedReason,
    });
  } catch (err) {
    console.error("[mqtt-ingestion-worker]", err);
    return await finish({
      source: "mqtt_worker",
      provider: "emqx",
      broker_reachable: false,
      error: (err as Error).message?.slice(0, 500) ?? "unknown",
    });
  }
});
