import {
  KNOTS_TO_KMH,
  normaliseHeading,
  toIso,
  toNumber,
  validateCoordinates,
  type NormalizedVehicleLocation,
} from "../location-types.ts";

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

export interface MqttLocationRecord {
  vehicleId?: string | null;
  topic?: string | null;
  timestamp?: string | null;
  payload?: Record<string, unknown> | null;
  deviceId?: string | null;
}

/** vehicle id embedded in `rentmaikar/vehicle/{id}/location` */
export function vehicleIdFromTopic(topic?: string | null): string | null {
  if (!topic) return null;
  const parts = topic.split("/");
  const idx = parts.findIndex((p) => p === "vehicle" || p === "vehicles");
  return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
}

/**
 * MQTT/EMQX telemetry payloads → normalized fixes. Records without usable
 * coordinates are skipped (they remain valid telemetry, just not locations).
 */
export function adaptMqttLocations(
  records: MqttLocationRecord[],
  opts: { receivedAt?: string } = {},
): NormalizedVehicleLocation[] {
  const receivedAt = opts.receivedAt ?? new Date().toISOString();
  const out: NormalizedVehicleLocation[] = [];

  for (const rec of records ?? []) {
    const payload = (rec?.payload ?? {}) as Record<string, unknown>;
    const coords = validateCoordinates(
      pick(payload, ["lat", "latitude"]),
      pick(payload, ["lng", "lon", "long", "longitude"]),
    );
    if (!coords) continue;

    const vehicleId = rec.vehicleId ?? vehicleIdFromTopic(rec.topic);
    if (!vehicleId) continue;

    const knots = toNumber(pick(payload, ["speed_knots", "speed_kts"]));
    const kmh = toNumber(pick(payload, ["speed_kmh", "speed_kph", "speed"]));

    out.push({
      vehicleId,
      provider: "emqx",
      providerDeviceId: String(rec.deviceId ?? pick(payload, ["device_id", "imei", "serial"]) ?? vehicleId),
      serialNumber: (pick(payload, ["serial", "serial_number"]) as string) ?? null,
      latitude: coords.lat,
      longitude: coords.lng,
      altitude: toNumber(pick(payload, ["altitude", "alt"])),
      speedKmh: kmh !== null ? kmh : knots !== null ? knots * KNOTS_TO_KMH : null,
      heading: normaliseHeading(pick(payload, ["heading", "course", "bearing"])),
      ignition: typeof payload.ignition === "boolean" ? payload.ignition : null,
      address: (pick(payload, ["address"]) as string) ?? null,
      gpsTimestamp: toIso(pick(payload, ["gps_time", "device_time", "timestamp", "ts"]) ?? rec.timestamp, receivedAt),
      receivedAt,
      isHistoric: false,
      raw: payload,
    });
  }

  return out;
}
