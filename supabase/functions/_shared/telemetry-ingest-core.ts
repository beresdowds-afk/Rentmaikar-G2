import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adaptMqttLocations } from "./location-adapters/emqx.ts";
import { getGpsDisabledVehicles, persistLocations } from "./unified-location-service.ts";
import {
  normalizeEvent,
  reduceState,
  runAnalytics,
  type AnalyticsRow,
} from "./orchestrator-core.ts";
import {
  isAcceptableTelemetryPayload,
  isAcceptableTelemetryTimestamp,
} from "./telemetry-security.ts";

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

  const deviceIds = [...new Set(events.map((event) => event.deviceId).filter((id): id is string => !!id))];
  if (!deviceIds.length) {
    result.skipped += events.length;
    return result;
  }
  const registryQueries = [
    admin.from("iot_devices")
      .select("id, vehicle_id, provider, provider_device_id, serial_number, status, telemetry_enabled")
      .eq("provider", "emqx")
      .eq("status", "active")
      .eq("telemetry_enabled", true)
      .in("provider_device_id", deviceIds),
    admin.from("iot_devices")
      .select("id, vehicle_id, provider, provider_device_id, serial_number, status, telemetry_enabled")
      .eq("provider", "emqx")
      .eq("status", "active")
      .eq("telemetry_enabled", true)
      .in("serial_number", deviceIds),
  ];
  const registryResults = await Promise.all(registryQueries);
  const registeredDevices = new Map<string, Record<string, unknown>>();
  for (const { data, error } of registryResults) {
    if (error) throw new Error(`device_registry_lookup_failed: ${error.message}`);
    for (const device of (data ?? []) as Record<string, unknown>[]) {
      registeredDevices.set(String(device.id), device);
    }
  }
  const devicesById = new Map<string, Record<string, unknown>[]>();
  for (const device of registeredDevices.values()) {
    const identifiers = new Set(
      [device.provider_device_id, device.serial_number]
        .filter((identifier) => identifier != null)
        .map(String),
    );
    for (const key of identifiers) {
      const matches = devicesById.get(key) ?? [];
      matches.push(device);
      devicesById.set(key, matches);
    }
  }
  const authenticatedEvents = events.filter((event) => {
    const matches = event.deviceId ? devicesById.get(event.deviceId) ?? [] : [];
    if (matches.length !== 1) return false;
    const device = matches[0];
    if (!device.vehicle_id || String(device.vehicle_id) !== event.vehicleId) return false;
    return event.source === "mqtt" &&
      event.topic === `rentmaikar/vehicle/${device.vehicle_id}/${event.eventType}` &&
      ["telemetry", "location", "status"].includes(event.eventType) &&
      isAcceptableTelemetryTimestamp(event.timestamp, "emqx") &&
      isAcceptableTelemetryPayload(event.payload);
  });
  result.skipped += events.length - authenticatedEvents.length;
  if (!authenticatedEvents.length) return result;

  // Vehicles whose admin GPS/telemetry switch is off are dropped entirely —
  // no state, history, analytics, or downstream location persist.
  const gpsDisabled = await getGpsDisabledVehicles(admin, authenticatedEvents.map((e) => e.vehicleId));
  const scoped = gpsDisabled.size
    ? authenticatedEvents.filter((e) => !gpsDisabled.has(e.vehicleId))
    : authenticatedEvents;
  result.skipped += authenticatedEvents.length - scoped.length;
  if (!scoped.length) return result;

  const ids = [...new Set(scoped.map((e) => e.vehicleId))];
  const { data: existing, error: stateLookupError } = await admin
    .from("vehicle_telemetry_state")
    .select("*")
    .in("vehicle_id", ids);
  if (stateLookupError) throw new Error(`telemetry_state_lookup_failed: ${stateLookupError.message}`);

  const stateMap = new Map<string, Record<string, unknown>>();
  (existing ?? []).forEach((row: Record<string, unknown>) =>
    stateMap.set(String(row.vehicle_id), row)
  );

  const analytics: AnalyticsRow[] = [];
  const telemetryLogs: Record<string, unknown>[] = [];
  const updatedVehicles = new Set<string>();

  for (const event of scoped) {
    const prev = stateMap.get(event.vehicleId) ?? null;
    const previousTimestamp = prev?.last_event_at ? Date.parse(String(prev.last_event_at)) : NaN;
    if (Number.isFinite(previousTimestamp) && Date.parse(event.timestamp) <= previousTimestamp) {
      result.skipped += 1;
      continue;
    }
    const next = reduceState(prev, event);
    stateMap.set(event.vehicleId, next as unknown as Record<string, unknown>);
    updatedVehicles.add(event.vehicleId);
    analytics.push(...runAnalytics(next, event));
    telemetryLogs.push({
      vehicle_id: event.vehicleId,
      data_type: event.eventType === "location" ? "location" : "status",
      payload: {
        ...(event.payload ?? {}),
        provider: "emqx",
        provider_device_id: event.deviceId,
        provider_event_time: event.timestamp,
      },
      provider: "emqx",
      provider_device_id: event.deviceId,
      provider_event_time: event.timestamp,
      mqtt_topic: event.topic,
      received_at: new Date().toISOString(),
    });
    result.processed += 1;
  }

  const upserts = [...updatedVehicles].map((vehicleId) => stateMap.get(vehicleId)!).map((s) => ({
    vehicle_id: s.vehicle_id,
    provider: s.provider,
    provider_device_id: s.provider_device_id,
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
    gps_timestamp: s.last_event_at,
    received_at: new Date().toISOString(),
    payload: s.payload ?? {},
  }));

  if (upserts.length) {
    const { error } = await admin
      .from("vehicle_telemetry_state")
      .upsert(upserts as never, { onConflict: "vehicle_id" });
    if (error) throw new Error(`telemetry_state_upsert_failed: ${error.message}`);
  }

  if (telemetryLogs.length) {
    const { error } = await admin.from("mqtt_telemetry_logs").upsert(telemetryLogs as never, {
      onConflict: "provider,provider_device_id,provider_event_time,mqtt_topic",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`telemetry_log_insert_failed: ${error.message}`);
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
      const { data: vehicleRows, error: vehicleLookupError } = await admin
        .from("vehicles")
        .select("id")
        .in("id", candidateIds);
      if (vehicleLookupError) throw new Error(`vehicle_lookup_failed: ${vehicleLookupError.message}`);
      known = new Set((vehicleRows ?? []).map((v: Record<string, unknown>) => String(v.id)));
    }
    const valid = analytics.filter((a) => known.has(String(a.vehicle_id)));
    const dropped = analytics.length - valid.length;
    if (dropped) console.warn(`[orchestrator] dropped ${dropped} analytics rows with unknown vehicle_id`);
    if (valid.length) {
      const { error } = await admin.from("vehicle_analytics_events").insert(valid as never);
      if (error) throw new Error(`telemetry_analytics_insert_failed: ${error.message}`);
      result.analytics = valid.length;
    }
  }


  // Locations additionally flow through the unified location service so every
  // provider (MQTT included) lands in one normalized shape on the shared map.
  const locations = adaptMqttLocations(
    scoped.map((e) => ({
      vehicleId: e.vehicleId,
      deviceId: e.deviceId,
      topic: e.topic ?? null,
      timestamp: e.timestamp,
      payload: (e.payload ?? {}) as Record<string, unknown>,
    })),
  );
  if (locations.length) {
    // History + MQTT publish are already covered by this pipeline/topic.
    const locationResult = await persistLocations(admin, locations, {
      publishMqtt: false,
      writeHistory: false,
    });
    if (locationResult.errors.length) {
      throw new Error(`unified_location_persist_failed: ${locationResult.errors.join("; ")}`);
    }
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
