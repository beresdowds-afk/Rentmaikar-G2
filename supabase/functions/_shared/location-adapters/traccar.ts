import {
  KNOTS_TO_KMH,
  normaliseHeading,
  toIso,
  toNumber,
  validateCoordinates,
  type NormalizedVehicleLocation,
} from "../location-types.ts";

export interface TraccarPositionLike {
  deviceId: number | string;
  latitude: unknown;
  longitude: unknown;
  altitude?: unknown;
  speed?: unknown; // knots per Traccar spec
  course?: unknown;
  fixTime?: string;
  deviceTime?: string;
  serverTime?: string;
  address?: string | null;
  valid?: boolean;
  outdated?: boolean;
  attributes?: Record<string, unknown>;
}

/**
 * Traccar `/positions` rows → normalized fixes. Speed arrives in knots and is
 * converted to km/h here so the rest of the platform is unit-consistent.
 */
export function adaptTraccarPositions(
  positions: TraccarPositionLike[],
  opts: { receivedAt?: string; serials?: Map<string, string>; isHistoric?: boolean } = {},
): NormalizedVehicleLocation[] {
  const receivedAt = opts.receivedAt ?? new Date().toISOString();
  const out: NormalizedVehicleLocation[] = [];

  for (const p of positions ?? []) {
    if (!p || p.deviceId === undefined || p.deviceId === null) continue;
    if (p.valid === false) continue;
    const coords = validateCoordinates(p.latitude, p.longitude);
    if (!coords) continue;

    const deviceId = String(p.deviceId);
    const knots = toNumber(p.speed);
    const attrs = (p.attributes ?? {}) as Record<string, unknown>;
    const ignitionRaw = attrs.ignition;

    out.push({
      vehicleId: null,
      provider: "traccar",
      providerDeviceId: deviceId,
      serialNumber: opts.serials?.get(deviceId) ?? null,
      latitude: coords.lat,
      longitude: coords.lng,
      altitude: toNumber(p.altitude),
      speedKmh: knots === null ? null : knots * KNOTS_TO_KMH,
      heading: normaliseHeading(p.course),
      ignition: typeof ignitionRaw === "boolean" ? ignitionRaw : null,
      address: p.address ?? null,
      gpsTimestamp: toIso(p.fixTime ?? p.deviceTime ?? p.serverTime, receivedAt),
      receivedAt,
      isHistoric: opts.isHistoric ?? !!p.outdated,
      raw: p as unknown as Record<string, unknown>,
    });
  }

  return out;
}
