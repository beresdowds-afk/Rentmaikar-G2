import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adaptMqttLocations } from "./location-adapters/emqx.ts";
import { getGpsDisabledVehicles, persistLocations } from "./unified-location-service.ts";
import {
  normalizeEvent,
  reduceState,
  runAnalytics,
  type AnalyticsRow,
} from "./orchestrator-core.ts";

type Admin = ReturnType<typeof createClient>;

export interface IngestResult {
  processed: number;
  skipped: number;
  analytics: number;
  vehicles: string[];
}

export function serviceClient(): Admin {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Shared server-side orchestration pipeline: normalise → reduce state →
 * derive analytics → persist. Used by telemetry-ingest and the scheduled
 * mqtt-ingestion-worker.
 */
export async function ingestRecords(
  admin: Admin,
  records: Record<string, unknown>[],
): Promise<IngestResult> {
  const result: IngestResult = { processed: 0, skipped: 0, analytics: 0, vehicles: [] };
  if (!records.length) return result;

  const events = records
    .map((r) => normalizeEvent(r))
    .filter((e): e is NonNullable<ReturnType<typeof normalizeEvent>> => !!e);
  result.skipped = records.length - events.length;
  if (!events.length) return result;

  // Vehicles whose admin GPS/telemetry switch is off are dropped entirely —
  // no state, history, analytics, or downstream location persist.
  const gpsDisabled = await getGpsDisabledVehicles(admin, events.map((e) => e.vehicleId));
  const scoped = gpsDisabled.size ? events.filter((e) => !gpsDisabled.has(e.vehicleId)) : events;
  result.skipped += events.length - scoped.length;
  if (!scoped.length) return result;

  const ids = [...new Set(scoped.map((e) => e.vehicleId))];
  const { data: existing } = await admin
    .from("vehicle_telemetry_state")
    .select("*")
    .in("vehicle_id", ids);

  const stateMap = new Map<string, Record<string, unknown>>();
  (existing ?? []).forEach((row: Record<string, unknown>) =>
    stateMap.set(String(row.vehicle_id), row)
  );

  const analytics: AnalyticsRow[] = [];
  const telemetryLogs: Record<string, unknown>[] = [];

  for (const event of scoped) {
    const prev = (stateMap.get(event.vehicleId) ?? null) as never;
    const next = reduceState(prev, event);
    stateMap.set(event.vehicleId, next as unknown as Record<string, unknown>);
    analytics.push(...runAnalytics(next, event));
    telemetryLogs.push({
      vehicle_id: event.vehicleId,
      data_type: event.eventType || "telemetry",
      payload: event.payload ?? {},
      mqtt_topic: event.topic ?? null,
      received_at: event.timestamp,
    });
    result.processed += 1;
  }

  const upserts = [...stateMap.values()].filter((s) => "last_event_at" in s).map((s) => ({
    vehicle_id: s.vehicle_id,
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
    speed: s.speed ?? null,
    ignition: s.ignition ?? null,
    battery: s.battery ?? null,
    fuel: s.fuel ?? null,
    temperature: s.temperature ?? null,
    last_source: s.last_source,
    last_event_type: s.last_event_type,
    last_event_at: s.last_event_at,
    payload: s.payload ?? {},
  }));

  if (upserts.length) {
    const { error } = await admin
      .from("vehicle_telemetry_state")
      .upsert(upserts as never, { onConflict: "vehicle_id" });
    if (error) console.error("[orchestrator] state upsert failed", error.message);
  }

  if (telemetryLogs.length) {
    const { error } = await admin.from("mqtt_telemetry_logs").insert(telemetryLogs as never);
    if (error) console.error("[orchestrator] telemetry log insert failed", error.message);
  }

  if (analytics.length) {
    // vehicle_analytics_events.vehicle_id is a uuid FK to vehicles(id): drop
    // rows whose identifier is not a registered vehicle so one spoofed or
    // unknown device id cannot reject the whole batch.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const candidateIds = [...new Set(analytics.map((a) => String(a.vehicle_id)))]
      .filter((id) => uuidRe.test(id));
    let known = new Set<string>();
    if (candidateIds.length) {
      const { data: vehicleRows } = await admin
        .from("vehicles")
        .select("id")
        .in("id", candidateIds);
      known = new Set((vehicleRows ?? []).map((v: Record<string, unknown>) => String(v.id)));
    }
    const valid = analytics.filter((a) => known.has(String(a.vehicle_id)));
    const dropped = analytics.length - valid.length;
    if (dropped) console.warn(`[orchestrator] dropped ${dropped} analytics rows with unknown vehicle_id`);
    if (valid.length) {
      const { error } = await admin.from("vehicle_analytics_events").insert(valid as never);
      if (error) console.error("[orchestrator] analytics insert failed", error.message);
      else result.analytics = valid.length;
    }
  }


  // Locations additionally flow through the unified location service so every
  // provider (MQTT included) lands in one normalized shape on the shared map.
  try {
    const locations = adaptMqttLocations(
      scoped.map((e) => ({
        vehicleId: e.vehicleId,
        topic: e.topic ?? null,
        timestamp: e.timestamp,
        payload: (e.payload ?? {}) as Record<string, unknown>,
      })),
    );
    if (locations.length) {
      // History + MQTT publish are already covered by this pipeline/topic.
      await persistLocations(admin, locations, { publishMqtt: false, writeHistory: false });
    }
  } catch (e) {
    console.error("[orchestrator] unified location persist failed", (e as Error).message);
  }

  result.vehicles = ids;
  return result;
}

export async function logIngestRun(
  admin: Admin,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("telemetry_ingest_runs").insert(row as never);
  if (error) console.error("[orchestrator] run log failed", error.message);
}
