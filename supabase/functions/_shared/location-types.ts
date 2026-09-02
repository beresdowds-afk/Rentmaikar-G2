/**
 * Unified GPS location model.
 *
 * Every provider (SareKon/GPSANDTRACK, Traccar, EMQX-MQTT) is translated into
 * this single shape by an adapter under `location-adapters/`, then persisted by
 * `unified-location-service.ts`. No provider-specific parsing may leak past the
 * adapter boundary — the maps and dashboards only ever see this type.
 */

export type LocationProvider = "sarekon" | "traccar" | "emqx";

export interface NormalizedVehicleLocation {
  /** Resolved vehicle uuid, or null when the device is not linked yet. */
  vehicleId: string | null;
  provider: LocationProvider;
  /** The provider's own device identifier (SareKon device_id, Traccar id…). */
  providerDeviceId: string;
  /** Physical serial, when the provider exposes one. Used as mapping fallback. */
  serialNumber?: string | null;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  /** km/h, always normalised from the provider unit. */
  speedKmh?: number | null;
  /** degrees, 0–360 */
  heading?: number | null;
  ignition?: boolean | null;
  address?: string | null;
  /** Time the fix was produced by the device. */
  gpsTimestamp: string;
  /** Time our infrastructure received it. */
  receivedAt: string;
  /** True for backfilled/history rows — never overwrites the live fix. */
  isHistoric?: boolean;
  raw?: Record<string, unknown>;
}

export const KNOTS_TO_KMH = 1.852;

export function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function toIso(value: unknown, fallback = new Date().toISOString()): string {
  if (!value) return fallback;
  const d = new Date(typeof value === "number" ? value : String(value));
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

/**
 * Coordinates must be finite, in range, and not the "null island" 0/0 fix that
 * trackers emit when they have no lock.
 */
export function validateCoordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = toNumber(lat);
  const ln = toNumber(lng);
  if (la === null || ln === null) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

export function normaliseHeading(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  const wrapped = ((n % 360) + 360) % 360;
  return Number.isFinite(wrapped) ? wrapped : null;
}

/** Canonical MQTT topic for a normalized fix (existing singular convention). */
export function locationTopic(vehicleId: string): string {
  return `rentmaikar/vehicle/${vehicleId}/location`;
}
