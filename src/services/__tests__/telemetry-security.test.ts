import { describe, expect, it } from "vitest";
import type { NormalizedVehicleLocation } from "../../../supabase/functions/_shared/location-types";
import {
  isAcceptableTelemetryTimestamp,
  isAcceptableTelemetryPayload,
  isAcceptableTelemetryValues,
  isNewerTelemetryEvent,
  isTrustedIngestionCaller,
  resolveTelemetryBinding,
  type RegisteredTelemetryDevice,
} from "../../../supabase/functions/_shared/telemetry-security";

const now = Date.parse("2026-11-07T12:00:00.000Z");
const vehicleA = "11111111-2222-3333-4444-555555555555";
const vehicleB = "99999999-8888-7777-6666-555555555555";

const device: RegisteredTelemetryDevice = {
  id: "device-row",
  vehicle_id: vehicleA,
  provider: "emqx",
  provider_device_id: "registered-device",
  serial_number: "SERIAL-1",
  status: "active",
  telemetry_enabled: true,
};

const location = (overrides: Partial<NormalizedVehicleLocation> = {}): NormalizedVehicleLocation => ({
  vehicleId: vehicleA,
  provider: "emqx",
  providerDeviceId: "registered-device",
  latitude: 6.5,
  longitude: 3.3,
  speedKmh: 45,
  heading: 90,
  gpsTimestamp: new Date(now).toISOString(),
  receivedAt: new Date(now).toISOString(),
  ...overrides,
});

describe("telemetry ingestion authorization", () => {
  it("accepts only configured service and cron credentials", () => {
    expect(isTrustedIngestionCaller("Bearer service-key", null, "service-key", "cron-secret")).toBe(true);
    expect(isTrustedIngestionCaller(null, "cron-secret", "service-key", "cron-secret")).toBe(true);
    expect(isTrustedIngestionCaller("Bearer user-jwt", null, "service-key", "cron-secret")).toBe(false);
    expect(isTrustedIngestionCaller("Bearer service-key", null, undefined, "cron-secret")).toBe(false);
  });

  it("rejects forged or cross-vehicle identifiers and allows the current device assignment", () => {
    expect(resolveTelemetryBinding(location({ providerDeviceId: "forged" }), [device]).reason)
      .toBe("unregistered");
    expect(resolveTelemetryBinding(location({ vehicleId: vehicleB }), [device]).reason)
      .toBe("vehicle_mismatch");
    const reassigned = { ...device, vehicle_id: vehicleB };
    expect(resolveTelemetryBinding(location(), [reassigned]).reason).toBe("vehicle_mismatch");
    expect(resolveTelemetryBinding(location({ vehicleId: vehicleB }), [reassigned]).vehicleId)
      .toBe(vehicleB);
    expect(resolveTelemetryBinding(location(), [device]).vehicleId).toBe(vehicleA);
  });

  it("rejects inactive, revoked, suspended, and unassigned devices", () => {
    for (const status of ["inactive", "maintenance", "revoked", "suspended"]) {
      expect(resolveTelemetryBinding(location(), [{ ...device, status }]).reason).toBe("inactive");
    }
    expect(resolveTelemetryBinding(location(), [{ ...device, vehicle_id: null }]).reason)
      .toBe("unassigned");
  });

  it("rejects stale and future events and makes duplicate timestamps non-updatable", () => {
    expect(isAcceptableTelemetryTimestamp(new Date(now - 25 * 60 * 60_000).toISOString(), "emqx", now))
      .toBe(false);
    expect(isAcceptableTelemetryTimestamp(new Date(now + 6 * 60_000).toISOString(), "emqx", now))
      .toBe(false);
    expect(isAcceptableTelemetryTimestamp(new Date(now - 10 * 60_000).toISOString(), "emqx", now))
      .toBe(true);
    expect(isAcceptableTelemetryTimestamp(new Date(now - 25 * 60 * 60_000).toISOString(), "sarekon", now))
      .toBe(true);
    expect(isNewerTelemetryEvent(new Date(now).toISOString(), new Date(now).toISOString())).toBe(false);
    expect(isNewerTelemetryEvent(new Date(now + 1).toISOString(), new Date(now).toISOString())).toBe(true);
  });

  it("rejects impossible coordinates and telemetry values", () => {
    expect(isAcceptableTelemetryValues(location({ latitude: 91 }))).toBe(false);
    expect(isAcceptableTelemetryValues(location({ longitude: 181 }))).toBe(false);
    expect(isAcceptableTelemetryValues(location({ latitude: 0, longitude: 0 }))).toBe(false);
    expect(isAcceptableTelemetryValues(location({ speedKmh: 301 }))).toBe(false);
    expect(isAcceptableTelemetryValues(location({ heading: 360 }))).toBe(false);
    expect(isAcceptableTelemetryValues(location())).toBe(true);
    expect(isAcceptableTelemetryPayload({ lat: 91, lng: 3 })).toBe(false);
    expect(isAcceptableTelemetryPayload({ lat: 6, lng: 3, speed: -1 })).toBe(false);
    expect(isAcceptableTelemetryPayload({ latitude: 6, longitude: 3, battery: 120 })).toBe(false);
    expect(isAcceptableTelemetryPayload({ latitude: 6, longitude: 3, speed: 45 })).toBe(true);
  });
});
