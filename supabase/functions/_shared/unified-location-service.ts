import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { locationTopic, type NormalizedVehicleLocation } from "./location-types.ts";
import { resolveEmqxClient } from "./emqx-client.ts";

type Admin = ReturnType<typeof createClient>;

export interface PersistOptions {
  /** Re-persist an unchanged fix at least this often (heartbeat). */
  heartbeatMs?: number;
  /** Publish normalized fixes to MQTT for live subscribers. */
  publishMqtt?: boolean;
  /** Movement threshold (metres) under which a fix counts as unchanged. */
  minMoveMeters?: number;
  /** Append to mqtt_telemetry_logs (disable when the caller already logs). */
  writeHistory?: boolean;
}

export interface PersistResult {
  received: number;
  persisted: number;
  deduped: number;
  unmapped: number;
  published: number;
  /** Fixes dropped because the vehicle's GPS/telemetry switch is off. */
  gps_disabled: number;
  vehicles: string[];
  errors: string[];
}

const DEFAULTS: Required<PersistOptions> = {
  heartbeatMs: 5 * 60_000,
  publishMqtt: true,
  minMoveMeters: 10,
  writeHistory: true,
};

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface DeviceRow {
  id: string;
  vehicle_id: string | null;
  provider: string | null;
  serial_number: string | null;
  provider_device_id: string | null;
}

/**
 * Resolve provider device ids → { vehicleId, iotDeviceId } using iot_devices.
 * Matching is scoped to the provider so two providers can reuse an id safely.
 */
export async function resolveDeviceMap(
  admin: Admin,
  provider: string,
  deviceIds: string[],
  serials: string[] = [],
): Promise<Map<string, DeviceRow>> {
  const map = new Map<string, DeviceRow>();
  if (!deviceIds.length && !serials.length) return map;


  const { data } = await admin
    .from("iot_devices")
    .select("id, vehicle_id, provider, serial_number, provider_device_id")
    .eq("provider", provider)
    .or(
      [
        deviceIds.length ? `provider_device_id.in.(${deviceIds.map((d) => `"${d}"`).join(",")})` : null,
        serials.length ? `serial_number.in.(${serials.map((s) => `"${s}"`).join(",")})` : null,
      ].filter(Boolean).join(","),
    );

  for (const row of (data ?? []) as unknown as DeviceRow[]) {
    if (row.provider_device_id) map.set(row.provider_device_id, row);
    if (row.serial_number) map.set(`serial:${row.serial_number}`, row);
  }
  return map;
}

/**
 * Vehicles whose admin-controlled GPS/telemetry switch is off. The unified
 * pipeline (state, history, MQTT publish) drops their fixes entirely until an
 * admin re-enables tracking on the vehicle.
 */
export async function getGpsDisabledVehicles(
  admin: Admin,
  vehicleIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(vehicleIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const { data } = await admin
    .from("vehicles")
    .select("id")
    .in("id", ids)
    .eq("gps_tracking_enabled", false);
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

/**
 * Persist normalized locations.
 *
 * Guarantees:
 *  - one bad/unmapped fix never rejects the batch;
 *  - an empty poll never clears a previously known position;
 *  - historic fixes are logged but never overwrite a newer live fix;
 *  - both existing maps keep working (iot_devices stays in sync).
 */
export async function persistLocations(
  admin: Admin,
  locations: NormalizedVehicleLocation[],
  options: PersistOptions = {},
): Promise<PersistResult> {
  const opts = { ...DEFAULTS, ...options };
  const result: PersistResult = {
    received: locations.length,
    persisted: 0,
    deduped: 0,
    unmapped: 0,
    published: 0,
    gps_disabled: 0,
    vehicles: [],
    errors: [],
  };
  if (!locations.length) return result;

  // ── 1. resolve device → vehicle ────────────────────────────────────────
  const byProvider = new Map<string, NormalizedVehicleLocation[]>();
  for (const loc of locations) {
    const list = byProvider.get(loc.provider) ?? [];
    list.push(loc);
    byProvider.set(loc.provider, list);
  }

  const resolved: Array<NormalizedVehicleLocation & { iotDeviceId: string | null }> = [];
  for (const [provider, list] of byProvider) {
    const deviceMap = await resolveDeviceMap(
      admin,
      provider,
      [...new Set(list.map((l) => l.providerDeviceId))],
      [...new Set(list.map((l) => l.serialNumber).filter(Boolean) as string[])],
    );
    for (const loc of list) {
      const row = deviceMap.get(loc.providerDeviceId) ??
        (loc.serialNumber ? deviceMap.get(`serial:${loc.serialNumber}`) : undefined);
      const vehicleId = loc.vehicleId ?? row?.vehicle_id ?? null;
      if (!vehicleId) result.unmapped += 1;
      resolved.push({ ...loc, vehicleId, iotDeviceId: row?.id ?? null });
    }
  }

  // ── 2. keep only the newest fix per vehicle for the "latest" state ─────
  const latestByVehicle = new Map<string, NormalizedVehicleLocation & { iotDeviceId: string | null }>();
  for (const loc of resolved) {
    if (!loc.vehicleId) continue;
    const prev = latestByVehicle.get(loc.vehicleId);
    if (!prev || Date.parse(loc.gpsTimestamp) >= Date.parse(prev.gpsTimestamp)) {
      latestByVehicle.set(loc.vehicleId, loc);
    }
  }

  // ── 2b. drop fixes for vehicles whose GPS/telemetry switch is off ────────
  const gpsDisabled = await getGpsDisabledVehicles(
    admin,
    resolved.map((l) => l.vehicleId).filter((v): v is string => !!v),
  );
  if (gpsDisabled.size) {
    const enabled = resolved.filter((l) => !l.vehicleId || !gpsDisabled.has(l.vehicleId));
    result.gps_disabled = resolved.length - enabled.length;
    resolved.length = 0;
    resolved.push(...enabled);
    for (const id of gpsDisabled) latestByVehicle.delete(id);
  }

  const vehicleIds = [...latestByVehicle.keys()];
  const existingState = new Map<string, Record<string, unknown>>();
  if (vehicleIds.length) {
    const { data } = await admin
      .from("vehicle_telemetry_state")
      .select("vehicle_id, latitude, longitude, speed, heading, gps_timestamp, ignition")
      .in("vehicle_id", vehicleIds);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      existingState.set(String(row.vehicle_id), row);
    }
  }

  // ── 3. dedupe + upsert latest state ────────────────────────────────────
  const stateUpserts: Record<string, unknown>[] = [];
  const toPublish: Array<NormalizedVehicleLocation> = [];

  for (const [vehicleId, loc] of latestByVehicle) {
    const prev = existingState.get(vehicleId);
    if (prev) {
      const prevTs = prev.gps_timestamp ? Date.parse(String(prev.gps_timestamp)) : 0;
      const nextTs = Date.parse(loc.gpsTimestamp);
      // Never let a stale/historic fix overwrite a newer live one.
      if (loc.isHistoric && prevTs >= nextTs) {
        result.deduped += 1;
        continue;
      }
      const prevLat = prev.latitude === null || prev.latitude === undefined ? null : Number(prev.latitude);
      const prevLng = prev.longitude === null || prev.longitude === undefined ? null : Number(prev.longitude);
      const sameTime = prevTs === nextTs;
      const moved = prevLat === null || prevLng === null
        ? true
        : metersBetween(prevLat, prevLng, loc.latitude, loc.longitude) >= opts.minMoveMeters;
      const speedChanged = Number(prev.speed ?? 0) !== Number(loc.speedKmh ?? 0);
      const headingChanged = Number(prev.heading ?? 0) !== Number(loc.heading ?? 0);
      const withinHeartbeat = prevTs > 0 && Date.now() - prevTs < opts.heartbeatMs;
      if ((sameTime || (!moved && !speedChanged && !headingChanged)) && withinHeartbeat) {
        result.deduped += 1;
        continue;
      }
      if (nextTs < prevTs) {
        result.deduped += 1;
        continue;
      }
    }

    stateUpserts.push({
      vehicle_id: vehicleId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      altitude: loc.altitude ?? null,
      speed: loc.speedKmh ?? null,
      heading: loc.heading ?? null,
      ignition: loc.ignition ?? null,
      address: loc.address ?? null,
      provider: loc.provider,
      provider_device_id: loc.providerDeviceId,
      gps_timestamp: loc.gpsTimestamp,
      received_at: loc.receivedAt,
      is_historic: loc.isHistoric ?? false,
      last_source: loc.provider,
      last_event_type: "location",
      last_event_at: loc.gpsTimestamp,
      payload: {
        provider: loc.provider,
        provider_device_id: loc.providerDeviceId,
        address: loc.address ?? null,
      },
      updated_at: new Date().toISOString(),
    });
    toPublish.push(loc);
    result.persisted += 1;
  }

  if (stateUpserts.length) {
    const { error } = await admin
      .from("vehicle_telemetry_state")
      .upsert(stateUpserts as never, { onConflict: "vehicle_id" });
    if (error) result.errors.push(`state_upsert: ${error.message}`);
  }

  // ── 4. history ─────────────────────────────────────────────────────────
  const logs = resolved
    .filter((l) => l.vehicleId)
    .map((l) => ({
      vehicle_id: l.vehicleId,
      data_type: "location",
      mqtt_topic: locationTopic(l.vehicleId!),
      received_at: l.receivedAt,
      payload: {
        provider: l.provider,
        provider_device_id: l.providerDeviceId,
        lat: l.latitude,
        lng: l.longitude,
        altitude: l.altitude ?? null,
        speed_kmh: l.speedKmh ?? null,
        heading: l.heading ?? null,
        ignition: l.ignition ?? null,
        address: l.address ?? null,
        gps_timestamp: l.gpsTimestamp,
        is_historic: l.isHistoric ?? false,
        iot_device_id: l.iotDeviceId,
      },
    }));
  if (opts.writeHistory && logs.length) {
    const { error } = await admin.from("mqtt_telemetry_logs").insert(logs as never);
    if (error) result.errors.push(`history_insert: ${error.message}`);
  }

  // ── 5. keep iot_devices (shared fleet map source) in sync ──────────────
  for (const loc of resolved) {
    if (!loc.iotDeviceId) continue;
    const { error } = await admin
      .from("iot_devices")
      .update({
        latitude: loc.latitude,
        longitude: loc.longitude,
        last_ping: loc.gpsTimestamp,
      } as never)
      .eq("id", loc.iotDeviceId);
    if (error) result.errors.push(`device_update: ${error.message}`);
  }

  // ── 6. publish normalized fixes for live subscribers ───────────────────
  if (opts.publishMqtt && toPublish.length) {
    try {
      const { client } = await resolveEmqxClient();
      if (client) {
        for (const loc of toPublish) {
          try {
            await client.publish({
              topic: locationTopic(loc.vehicleId!),
              payload: {
                vehicle_id: loc.vehicleId,
                provider: loc.provider,
                provider_device_id: loc.providerDeviceId,
                lat: loc.latitude,
                lng: loc.longitude,
                altitude: loc.altitude ?? null,
                speed_kmh: loc.speedKmh ?? null,
                heading: loc.heading ?? null,
                ignition: loc.ignition ?? null,
                address: loc.address ?? null,
                gps_timestamp: loc.gpsTimestamp,
                received_at: loc.receivedAt,
              },
              qos: 0,
              retain: true,
            });
            result.published += 1;
          } catch {
            // Publishing is best-effort — persistence already succeeded.
          }
        }
      }
    } catch {
      // Broker unavailable: degrade silently, DB + realtime still drive the map.
    }
  }

  result.vehicles = vehicleIds;
  return result;
}
