import { describe, expect, it } from "vitest";
import {
  locationTopic,
  normaliseHeading,
  validateCoordinates,
} from "../../../supabase/functions/_shared/location-types";
import { adaptSarekonLocations } from "../../../supabase/functions/_shared/location-adapters/sarekon";
import { adaptTraccarPositions } from "../../../supabase/functions/_shared/location-adapters/traccar";
import {
  adaptMqttLocations,
  vehicleIdFromTopic,
} from "../../../supabase/functions/_shared/location-adapters/emqx";

const VEHICLE = "11111111-2222-3333-4444-555555555555";

describe("coordinate validation", () => {
  it("accepts valid coordinates", () => {
    expect(validateCoordinates(6.5244, 3.3792)).toEqual({ lat: 6.5244, lng: 3.3792 });
    expect(validateCoordinates("40.7128", "-74.0060")).toEqual({ lat: 40.7128, lng: -74.006 });
  });

  it("rejects NaN, out-of-range and null-island fixes", () => {
    expect(validateCoordinates("abc", 3)).toBeNull();
    expect(validateCoordinates(91, 0)).toBeNull();
    expect(validateCoordinates(10, 181)).toBeNull();
    expect(validateCoordinates(0, 0)).toBeNull();
    expect(validateCoordinates(null, undefined)).toBeNull();
  });

  it("wraps headings into 0-360", () => {
    expect(normaliseHeading(370)).toBe(10);
    expect(normaliseHeading(-90)).toBe(270);
    expect(normaliseHeading("bad")).toBeNull();
  });
});

describe("sarekon adapter", () => {
  it("normalizes a location row and drops invalid siblings", () => {
    const out = adaptSarekonLocations([
      {
        device_id: "DVD-1",
        latitude: "6.4550",
        longitude: "3.3841",
        speed_kph: "42",
        bearing_deg: 370,
        ignition: "1",
        address: "Ikoyi, Lagos",
        triggered_on_local: "2026-01-01T10:00:00Z",
        device: { device_description: "V24346052939583" },
      },
      { device_id: "DVD-2", latitude: 0, longitude: 0 },
      { latitude: 5, longitude: 5 },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      provider: "sarekon",
      providerDeviceId: "DVD-1",
      serialNumber: "V24346052939583",
      latitude: 6.455,
      longitude: 3.3841,
      speedKmh: 42,
      heading: 10,
      ignition: true,
      address: "Ikoyi, Lagos",
      vehicleId: null,
    });
    expect(out[0].gpsTimestamp).toBe("2026-01-01T10:00:00.000Z");
  });
});

describe("traccar adapter", () => {
  it("converts knots to km/h and skips invalid fixes", () => {
    const out = adaptTraccarPositions(
      [
        {
          deviceId: 7,
          latitude: 40.7,
          longitude: -74,
          altitude: 12,
          speed: 10, // knots
          course: 90,
          fixTime: "2026-01-01T09:00:00Z",
          valid: true,
          attributes: { ignition: true },
        },
        { deviceId: 8, latitude: 40.7, longitude: -74, valid: false },
        { deviceId: 9, latitude: "x", longitude: "y" },
      ],
      { serials: new Map([["7", "TRK-7"]]) },
    );

    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe("traccar");
    expect(out[0].providerDeviceId).toBe("7");
    expect(out[0].serialNumber).toBe("TRK-7");
    expect(out[0].speedKmh).toBeCloseTo(18.52, 2);
    expect(out[0].ignition).toBe(true);
  });
});

describe("emqx/mqtt adapter", () => {
  it("derives the vehicle from the canonical topic", () => {
    expect(vehicleIdFromTopic(`rentmaikar/vehicle/${VEHICLE}/location`)).toBe(VEHICLE);
    expect(vehicleIdFromTopic(`rentmaikar/vehicles/${VEHICLE}/location`)).toBe(VEHICLE);
    expect(vehicleIdFromTopic(null)).toBeNull();
  });

  it("normalizes payloads and ignores non-location telemetry", () => {
    const out = adaptMqttLocations([
      {
        topic: `rentmaikar/vehicle/${VEHICLE}/location`,
        timestamp: "2026-01-01T08:00:00Z",
        payload: { lat: 6.6, lng: 3.3, speed_kmh: 15, heading: 45, ignition: false },
      },
      { topic: `rentmaikar/vehicle/${VEHICLE}/status`, payload: { ignition: true } },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      vehicleId: VEHICLE,
      provider: "emqx",
      latitude: 6.6,
      longitude: 3.3,
      speedKmh: 15,
      heading: 45,
    });
  });

  it("keeps providers isolated and multi-vehicle batches intact", () => {
    const second = "99999999-8888-7777-6666-555555555555";
    const out = adaptMqttLocations([
      { topic: `rentmaikar/vehicle/${VEHICLE}/location`, payload: { lat: 1, lng: 1 } },
      { topic: `rentmaikar/vehicle/${second}/location`, payload: { lat: 2, lng: 2 } },
    ]);
    expect(out.map((o) => o.vehicleId)).toEqual([VEHICLE, second]);
    expect(new Set(out.map((o) => o.provider))).toEqual(new Set(["emqx"]));
  });

  it("emits the canonical topic for publishing", () => {
    expect(locationTopic(VEHICLE)).toBe(`rentmaikar/vehicle/${VEHICLE}/location`);
  });

  it("returns an empty batch when the provider reports nothing", () => {
    expect(adaptMqttLocations([])).toEqual([]);
    expect(adaptSarekonLocations([])).toEqual([]);
    expect(adaptTraccarPositions([])).toEqual([]);
  });
});
