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

const bool = (v: unknown): boolean | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (["1", "true", "on", "yes"].includes(s)) return true;
  if (["0", "false", "off", "no"].includes(s)) return false;
  return null;
};

function speedKmh(row: Record<string, unknown>): number | null {
  const kmh = toNumber(pick(row, ["speed_kph", "speed_kmh", "speed_km_h"]));
  if (kmh !== null) return kmh;
  const knots = toNumber(pick(row, ["speed_knots", "speed_kts"]));
  if (knots !== null) return knots * KNOTS_TO_KMH;
  const mph = toNumber(pick(row, ["speed_mph"]));
  if (mph !== null) return mph * 1.609344;
  return toNumber(pick(row, ["speed", "velocity"]));
}

/**
 * SareKon `/location/list.json` rows → normalized fixes.
 * Invalid rows are dropped individually; one bad fix never fails the batch.
 */
export function adaptSarekonLocations(
  rows: Record<string, unknown>[],
  opts: { receivedAt?: string; isHistoric?: boolean } = {},
): NormalizedVehicleLocation[] {
  const receivedAt = opts.receivedAt ?? new Date().toISOString();
  const out: NormalizedVehicleLocation[] = [];

  for (const row of rows ?? []) {
    if (!row || typeof row !== "object") continue;
    const loc = (row.location ?? row) as Record<string, unknown>;
    const device = (row.device ?? {}) as Record<string, unknown>;

    const deviceId = pick(loc, ["device_id", "deviceId"]) ?? pick(row, ["device_id", "dvd_id"]) ??
      pick(device, ["device_id", "id"]);
    if (!deviceId) continue;

    const coords = validateCoordinates(
      pick(loc, ["latitude", "lat"]),
      pick(loc, ["longitude", "lon", "lng", "long"]),
    );
    if (!coords) continue;

    out.push({
      vehicleId: null,
      provider: "sarekon",
      providerDeviceId: String(deviceId),
      serialNumber: (pick(device, ["device_description", "serial", "serial_number", "esn", "imei"]) as string) ?? null,
      latitude: coords.lat,
      longitude: coords.lng,
      altitude: toNumber(pick(loc, ["altitude_m", "altitude", "alt"])),
      speedKmh: speedKmh(loc),
      heading: normaliseHeading(pick(loc, ["bearing_deg", "heading", "course", "bearing", "direction"])),
      ignition: bool(pick(loc, ["ignition", "ign", "engine_on"])),
      address: (pick(loc, ["address", "location_name", "street"]) as string) ?? null,
      gpsTimestamp: toIso(
        pick(loc, [
          "triggered_on_local",
          "location_valid_on_local",
          "triggered_on",
          "dt_local",
          "dt",
          "timestamp",
          "gps_time",
          "time",
        ]),
        receivedAt,
      ),
      receivedAt,
      isHistoric: opts.isHistoric ?? false,
      raw: row,
    });
  }

  return out;
}
