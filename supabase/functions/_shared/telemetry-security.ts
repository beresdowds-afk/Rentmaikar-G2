import type { LocationProvider, NormalizedVehicleLocation } from "./location-types.ts";

export interface RegisteredTelemetryDevice {
  id: string;
  vehicle_id: string | null;
  provider: string | null;
  serial_number: string | null;
  provider_device_id: string | null;
  status: string | null;
  telemetry_enabled: boolean | null;
}

export interface DeviceBindingResult {
  device: RegisteredTelemetryDevice | null;
  vehicleId: string | null;
  reason: "unregistered" | "inactive" | "unassigned" | "vehicle_mismatch" | null;
}

export function isTrustedIngestionCaller(
  authorization: string | null,
  providedCronSecret: string | null,
  serviceRoleKey: string | undefined,
  cronSecret: string | undefined,
): boolean {
  return (!!serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`) ||
    (!!cronSecret && providedCronSecret === cronSecret);
}

export function resolveTelemetryBinding(
  location: NormalizedVehicleLocation,
  candidates: RegisteredTelemetryDevice[],
): DeviceBindingResult {
  const providerMatches = candidates.filter((device) =>
    device.provider === location.provider &&
    ((device.provider_device_id && device.provider_device_id === location.providerDeviceId) ||
      (location.serialNumber && device.serial_number === location.serialNumber))
  );
  const unique = [...new Map(providerMatches.map((device) => [device.id, device])).values()];
  if (unique.length !== 1) return { device: null, vehicleId: null, reason: "unregistered" };

  const device = unique[0];
  if (device.status !== "active" || device.telemetry_enabled !== true) {
    return { device, vehicleId: null, reason: "inactive" };
  }
  if (!device.vehicle_id) return { device, vehicleId: null, reason: "unassigned" };
  if (location.vehicleId && location.vehicleId !== device.vehicle_id) {
    return { device, vehicleId: null, reason: "vehicle_mismatch" };
  }

  return { device, vehicleId: device.vehicle_id, reason: null };
}

const MAX_EVENT_AGE_MS: Record<LocationProvider, number> = {
  emqx: 24 * 60 * 60 * 1000,
  sarekon: 48 * 60 * 60 * 1000,
  traccar: 24 * 60 * 60 * 1000,
};

export function isAcceptableTelemetryTimestamp(
  timestamp: string,
  provider: LocationProvider,
  now = Date.now(),
): boolean {
  const eventTime = Date.parse(timestamp);
  return Number.isFinite(eventTime) &&
    eventTime <= now + 5 * 60 * 1000 &&
    now - eventTime <= MAX_EVENT_AGE_MS[provider];
}

export function isNewerTelemetryEvent(timestamp: string, previousTimestamp: string | null): boolean {
  const next = Date.parse(timestamp);
  if (!Number.isFinite(next)) return false;
  if (!previousTimestamp) return true;
  const previous = Date.parse(previousTimestamp);
  return !Number.isFinite(previous) || next > previous;
}

export function isAcceptableTelemetryPayload(payload: Record<string, unknown>): boolean {
  const numberValue = (...values: unknown[]): number | null => {
    const value = values.find((candidate) => candidate !== undefined && candidate !== null);
    if (value === undefined) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };
  const lat = numberValue(payload.latitude, payload.lat);
  const lng = numberValue(payload.longitude, payload.lng, payload.lon);
  if ((lat !== null || lng !== null) &&
    (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
      (lat === 0 && lng === 0))) return false;

  const speed = numberValue(payload.speed_kmh, payload.speed_kph, payload.speed);
  const heading = numberValue(payload.heading, payload.course);
  const battery = numberValue(payload.battery, payload.battery_level, payload.batteryLevel);
  const fuel = numberValue(payload.fuel, payload.fuel_level);
  const temperature = numberValue(payload.temperature, payload.engine_temperature);
  return (speed === null || (speed >= 0 && speed <= 300)) &&
    (heading === null || (heading >= 0 && heading < 360)) &&
    (battery === null || (battery >= 0 && battery <= 100)) &&
    (fuel === null || (fuel >= 0 && fuel <= 100)) &&
    (temperature === null || (temperature >= -100 && temperature <= 300));
}

export function isAcceptableTelemetryValues(location: NormalizedVehicleLocation): boolean {
  return Number.isFinite(location.latitude) &&
    location.latitude >= -90 && location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 && location.longitude <= 180 &&
    !(location.latitude === 0 && location.longitude === 0) &&
    (location.speedKmh == null ||
      (Number.isFinite(location.speedKmh) && location.speedKmh >= 0 && location.speedKmh <= 300)) &&
    (location.heading == null ||
      (Number.isFinite(location.heading) && location.heading >= 0 && location.heading < 360));
}
