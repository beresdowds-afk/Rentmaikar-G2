import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";
import { sarekon } from "../_shared/sarekon-client.ts";
import { adaptSarekonLocations } from "../_shared/location-adapters/sarekon.ts";
import { getGpsDisabledVehicles, persistLocations } from "../_shared/unified-location-service.ts";
import { logIngestRun, serviceClient } from "../_shared/telemetry-ingest-core.ts";

/**
 * sarekon-location-worker — high-frequency GPS polling.
 *
 * pg_cron can only fire once a minute, so a single invocation performs an
 * internal loop (default 4 × 15s, configurable through iot_sync_schedule) to
 * reach the 15-second freshness target from the spec. Every pass funnels the
 * provider payload through the SareKon adapter and the unified location
 * service — no provider-specific writes, no second map, no credential logging.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BATCH = 50;
/**
 * Hard wall-clock budget. Edge functions are killed (502) well before the
 * previous 4 × 15s loop finished, so every pass is gated on this deadline.
 */
const MAX_RUNTIME_MS = 25_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireCronSecretAsync(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const admin = serviceClient();

  const finish = async (row: Record<string, unknown>) => {
    await logIngestRun(admin, {
      source: "sarekon_location_worker",
      provider: "sarekon",
      ...row,
      duration_ms: Date.now() - startedAt,
    });
    return json({ success: true, ...row });
  };

  try {
    await sarekon.ensureReady().catch(() => {});
    if (!sarekon.isConfigured()) {
      return await finish({ broker_reachable: false, degraded_reason: "sarekon_not_configured" });
    }

    const body = await req.json().catch(() => ({})) as { interval_seconds?: number; passes?: number };
    const intervalSeconds = Math.min(60, Math.max(5, Number(body.interval_seconds) || 15));
    // pg_cron fires this every minute; a single pass per invocation keeps the
    // run inside the edge wall-time limit. Extra passes are opt-in only.
    const passes = Math.min(3, Math.max(1, Number(body.passes) || 1));

    const { data: devices } = await admin
      .from("iot_devices")
      .select("provider_device_id, serial_number, vehicle_id")
      .eq("provider", "sarekon")
      .eq("telemetry_enabled", true)
      .not("vehicle_id", "is", null)
      .limit(500);

    // Per-vehicle GPS/telemetry switch: disabled vehicles are not polled at
    // all, so the provider is never queried for them.
    const gpsDisabled = await getGpsDisabledVehicles(
      admin,
      (devices ?? []).map((d: Record<string, unknown>) => d.vehicle_id as string | null)
        .filter((v): v is string => !!v),
    );
    const pollable = (devices ?? []).filter(
      (d: Record<string, unknown>) => !gpsDisabled.has(d.vehicle_id as string),
    );
    const gpsSkipped = (devices ?? []).length - pollable.length;

    const deviceIds = [
      ...new Set(
        pollable
          .map((d: Record<string, unknown>) => (d.provider_device_id ?? d.serial_number) as string | null)
          .filter((v): v is string => !!v),
      ),
    ];

    if (!deviceIds.length) {
      return await finish({ broker_reachable: true, devices_seen: 0, events_processed: 0, gps_disabled: gpsSkipped });
    }

    let processed = 0;
    let deduped = 0;
    let unmapped = 0;
    let published = 0;
    let gpsDisabledPersisted = 0;
    let lastError: string | null = null;

    let passesRun = 0;
    for (let pass = 0; pass < passes; pass++) {
      if (pass > 0) {
        if (Date.now() - startedAt > MAX_RUNTIME_MS - intervalSeconds * 1000) break;
        await sleep(intervalSeconds * 1000);
      }
      passesRun++;

      for (let i = 0; i < deviceIds.length; i += BATCH) {
        if (Date.now() - startedAt > MAX_RUNTIME_MS) { lastError ??= "runtime_budget_reached"; break; }
        const chunk = deviceIds.slice(i, i + BATCH);
        const r = await sarekon.currentLocations(chunk);
        if (!r.ok) {
          lastError = `${r.reason}${"status" in r ? `:${r.status}` : ""}`;
          continue;
        }
        // An empty response means "no new fix" — never clears known positions.
        const normalized = adaptSarekonLocations(r.body);
        if (!normalized.length) continue;
        const res = await persistLocations(admin, normalized);
        processed += res.persisted;
        deduped += res.deduped;
        unmapped += res.unmapped;
        published += res.published;
        gpsDisabledPersisted += res.gps_disabled;
        if (res.errors.length) lastError = res.errors[0].slice(0, 180);
      }
    }

    return await finish({
      broker_reachable: true,
      devices_seen: deviceIds.length,
      events_processed: processed,
      analytics_emitted: published,
      degraded_reason: lastError ? "partial_provider_errors" : null,
      error: lastError,
      passes: passesRun,
      deduped,
      unmapped,
      gps_disabled: gpsSkipped + gpsDisabledPersisted,
    });
  } catch (err) {
    console.error("[sarekon-location-worker]", (err as Error).message);
    return await finish({
      broker_reachable: false,
      error: (err as Error).message?.slice(0, 400) ?? "unknown",
      degraded_reason: "worker_exception",
    });
  }
});
