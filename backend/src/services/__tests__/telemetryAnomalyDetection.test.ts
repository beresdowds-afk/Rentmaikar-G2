import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyFleetFreshness,
  detectTelemetryAnomalies,
  type TelemetryAnomalyInput,
} from "../telemetryAnomalyDetection";

const now = Date.parse("2026-11-09T12:00:00.000Z");
const valid: TelemetryAnomalyInput = {
  registeredVehicleId: "vehicle-1",
  claimedVehicleId: "vehicle-1",
  latitude: 6.45,
  longitude: 3.39,
  speedKmh: 45,
  batteryPercent: 70,
  engineTemperatureCelsius: 85,
  fuelPercent: 60,
  ignition: true,
  eventTimeMs: now - 60_000,
  nowMs: now,
  previousLatitude: 6.44,
  previousLongitude: 3.38,
  previousEventTimeMs: now - 10 * 60_000,
  previousFuelPercent: 65,
  lastPingMs: now - 60_000,
  deviceStatus: "active",
  eventsInWindow: 2,
};

function detected(input: Partial<TelemetryAnomalyInput>): string[] {
  return detectTelemetryAnomalies({ ...valid, ...input }).map(({ type }) => type);
}

describe("telemetry anomaly detection", () => {
  const cases: Array<[string, Partial<TelemetryAnomalyInput>, string]> = [
    ["device/vehicle mismatch", { claimedVehicleId: "vehicle-2" }, "device_vehicle_mismatch"],
    ["invalid GPS", { latitude: 91 }, "invalid_gps"],
    ["impossible speed", { speedKmh: 301 }, "impossible_speed"],
    ["critical battery", { batteryPercent: 3 }, "critical_battery"],
    ["engine overheating", { engineTemperatureCelsius: 140 }, "engine_overheating"],
    ["invalid timestamp", { eventTimeMs: Number.NaN }, "invalid_timestamp"],
    ["future timestamp", { eventTimeMs: now + 10 * 60_000 }, "future_timestamp"],
    ["clock skew", { eventTimeMs: now + 2 * 60_000 }, "clock_skew"],
    ["implausible position jump", {
      latitude: 40,
      longitude: 3.39,
      previousLatitude: 6.44,
      previousLongitude: 3.38,
      previousEventTimeMs: now - 10 * 60_000,
    }, "implausible_position_jump"],
    ["sudden fuel decrease", { fuelPercent: 20, previousFuelPercent: 60 }, "sudden_fuel_decrease"],
    ["stale telemetry", { eventTimeMs: now - 7 * 60 * 60_000 }, "stale_telemetry"],
    ["replayed telemetry", { eventTimeMs: now - 12 * 60_000 }, "replayed_telemetry"],
    ["unexpected disconnection", { deviceStatus: "offline" }, "unexpected_device_disconnection"],
    ["abnormal telemetry frequency", { eventsInWindow: 121 }, "abnormal_telemetry_frequency"],
  ];

  for (const [label, input, expected] of cases) {
    it(`detects ${label}`, () => {
      assert.ok(detected(input).includes(expected));
    });
  }

  it("does not flag a valid telemetry sample", () => {
    assert.deepEqual(detectTelemetryAnomalies(valid), []);
  });

  it("uses configured regional/vehicle thresholds", () => {
    const anomalies = detectTelemetryAnomalies({
      ...valid,
      speedKmh: 101,
      thresholds: { maxSpeedKmh: 100 },
    });
    assert.ok(anomalies.some(({ type }) => type === "impossible_speed"));
  });
});

describe("fleet telemetry freshness SLA", () => {
  const thresholds = { delayedMinutes: 15, degradedMinutes: 60, breachMinutes: 360 };

  it("distinguishes compliant, delayed, degraded and breached vehicles", () => {
    assert.equal(classifyFleetFreshness(15, thresholds), "compliant");
    assert.equal(classifyFleetFreshness(16, thresholds), "delayed");
    assert.equal(classifyFleetFreshness(61, thresholds), "degraded");
    assert.equal(classifyFleetFreshness(361, thresholds), "breached");
  });

  it("fails closed for negative or invalid telemetry ages", () => {
    assert.equal(classifyFleetFreshness(-1, thresholds), "breached");
    assert.equal(classifyFleetFreshness(Number.NaN, thresholds), "breached");
  });
});
