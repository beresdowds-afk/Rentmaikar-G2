export type TelemetryAnomalySeverity = "info" | "warning" | "critical";

export interface TelemetryAnomalyCandidate {
  type: string;
  severity: TelemetryAnomalySeverity;
  details: Record<string, unknown>;
}

export interface TelemetryAnomalyThresholds {
  maxSpeedKmh: number;
  criticalBatteryPercent: number;
  criticalBatteryCriticalPercent: number;
  engineTemperatureCelsius: number;
  engineTemperatureCriticalCelsius: number;
  futureClockSkewMinutes: number;
  maxTelemetryAgeMinutes: number;
  maxPositionSpeedKmh: number;
  minPositionJumpKm: number;
  fuelDropPercent: number;
  disconnectedAfterMinutes: number;
  maxEventsPerFiveMinutes: number;
}

export const DEFAULT_TELEMETRY_ANOMALY_THRESHOLDS: TelemetryAnomalyThresholds = {
  maxSpeedKmh: 200,
  criticalBatteryPercent: 10,
  criticalBatteryCriticalPercent: 5,
  engineTemperatureCelsius: 115,
  engineTemperatureCriticalCelsius: 130,
  futureClockSkewMinutes: 5,
  maxTelemetryAgeMinutes: 360,
  maxPositionSpeedKmh: 250,
  minPositionJumpKm: 10,
  fuelDropPercent: 30,
  disconnectedAfterMinutes: 30,
  maxEventsPerFiveMinutes: 120,
};

export interface TelemetryAnomalyInput {
  registeredVehicleId?: string | null;
  claimedVehicleId?: string | null;
  latitude?: number;
  longitude?: number;
  speedKmh?: number;
  batteryPercent?: number;
  engineTemperatureCelsius?: number;
  fuelPercent?: number;
  ignition?: boolean;
  eventTimeMs?: number;
  nowMs?: number;
  previousLatitude?: number | null;
  previousLongitude?: number | null;
  previousEventTimeMs?: number;
  previousFuelPercent?: number | null;
  lastPingMs?: number | null;
  deviceStatus?: string | null;
  eventsInWindow?: number;
  thresholds?: Partial<TelemetryAnomalyThresholds>;
}

export function detectTelemetryAnomalies(input: TelemetryAnomalyInput): TelemetryAnomalyCandidate[] {
  const thresholds = { ...DEFAULT_TELEMETRY_ANOMALY_THRESHOLDS, ...input.thresholds };
  const nowMs = input.nowMs ?? Date.now();
  const candidates: TelemetryAnomalyCandidate[] = [];

  if (
    input.claimedVehicleId &&
    input.registeredVehicleId &&
    input.claimedVehicleId !== input.registeredVehicleId
  ) {
    candidates.push({
      type: "device_vehicle_mismatch",
      severity: "critical",
      details: {
        claimed_vehicle_id: input.claimedVehicleId,
        registered_vehicle_id: input.registeredVehicleId,
      },
    });
  }

  const { latitude, longitude } = input;
  if (
    latitude === undefined ||
    longitude === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    candidates.push({
      type: "invalid_gps",
      severity: "warning",
      details: { latitude: latitude ?? null, longitude: longitude ?? null },
    });
  }

  const speed = input.speedKmh;
  if (speed !== undefined && (!Number.isFinite(speed) || speed < 0 || speed > thresholds.maxSpeedKmh)) {
    candidates.push({
      type: "impossible_speed",
      severity: speed > thresholds.maxSpeedKmh * 1.25 ? "critical" : "warning",
      details: { speed_kmh: speed, threshold_kmh: thresholds.maxSpeedKmh },
    });
  }

  const battery = input.batteryPercent;
  if (
    battery !== undefined &&
    Number.isFinite(battery) &&
    battery > 0 &&
    battery < thresholds.criticalBatteryPercent
  ) {
    candidates.push({
      type: "critical_battery",
      severity: battery < thresholds.criticalBatteryCriticalPercent ? "critical" : "warning",
      details: { battery_percent: battery, threshold_percent: thresholds.criticalBatteryPercent },
    });
  }

  const temperature = input.engineTemperatureCelsius;
  if (
    temperature !== undefined &&
    Number.isFinite(temperature) &&
    temperature > thresholds.engineTemperatureCelsius
  ) {
    candidates.push({
      type: "engine_overheating",
      severity: temperature >= thresholds.engineTemperatureCriticalCelsius ? "critical" : "warning",
      details: { temperature_celsius: temperature, threshold_celsius: thresholds.engineTemperatureCelsius },
    });
  }

  const eventTimeMs = input.eventTimeMs;
  if (eventTimeMs !== undefined && !Number.isFinite(eventTimeMs)) {
    candidates.push({
      type: "invalid_timestamp",
      severity: "warning",
      details: { event_time_ms: eventTimeMs },
    });
  } else if (eventTimeMs !== undefined) {
    const skewMinutes = (eventTimeMs - nowMs) / 60_000;
    if (skewMinutes > 0) {
      candidates.push({
        type: skewMinutes > thresholds.futureClockSkewMinutes ? "future_timestamp" : "clock_skew",
        severity: skewMinutes > thresholds.futureClockSkewMinutes ? "warning" : "info",
        details: { clock_skew_minutes: Number(skewMinutes.toFixed(2)), event_time_ms: eventTimeMs },
      });
    } else if (nowMs - eventTimeMs > thresholds.maxTelemetryAgeMinutes * 60_000) {
      candidates.push({
        type: "stale_telemetry",
        severity: "warning",
        details: {
          age_minutes: Math.floor((nowMs - eventTimeMs) / 60_000),
          threshold_minutes: thresholds.maxTelemetryAgeMinutes,
        },
      });
    }

    if (
      input.previousEventTimeMs !== undefined &&
      eventTimeMs <= input.previousEventTimeMs
    ) {
      candidates.push({
        type: "replayed_telemetry",
        severity: "warning",
        details: { event_time_ms: eventTimeMs, previous_event_time_ms: input.previousEventTimeMs },
      });
    }
  }

  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(input.previousLatitude) &&
    Number.isFinite(input.previousLongitude) &&
    input.previousEventTimeMs !== undefined &&
    eventTimeMs !== undefined &&
    eventTimeMs > input.previousEventTimeMs
  ) {
    const distanceKm = haversineDistanceKm(
      input.previousLatitude!,
      input.previousLongitude!,
      latitude!,
      longitude!,
    );
    const elapsedHours = (eventTimeMs - input.previousEventTimeMs) / 3_600_000;
    const impliedSpeedKmh = distanceKm / elapsedHours;
    if (
      (distanceKm > thresholds.minPositionJumpKm && impliedSpeedKmh > thresholds.maxPositionSpeedKmh) ||
      (distanceKm > 500 && elapsedHours < 0.1)
    ) {
      candidates.push({
        type: "implausible_position_jump",
        severity: "critical",
        details: {
          distance_km: Number(distanceKm.toFixed(2)),
          elapsed_seconds: Math.round(elapsedHours * 3600),
          implied_speed_kmh: Math.round(impliedSpeedKmh),
        },
      });
    }
  }

  if (
    input.previousFuelPercent !== undefined &&
    input.previousFuelPercent !== null &&
    input.fuelPercent !== undefined &&
    Number.isFinite(input.fuelPercent)
  ) {
    const decrease = input.previousFuelPercent - input.fuelPercent;
    if (decrease > thresholds.fuelDropPercent) {
      candidates.push({
        type: "sudden_fuel_decrease",
        severity: decrease > thresholds.fuelDropPercent * 2 ? "critical" : "warning",
        details: { previous_fuel_percent: input.previousFuelPercent, fuel_percent: input.fuelPercent, decrease_percent: decrease },
      });
    }
  }

  if (
    input.deviceStatus === "offline" ||
    (input.lastPingMs !== undefined &&
      input.lastPingMs !== null &&
      nowMs - input.lastPingMs > thresholds.disconnectedAfterMinutes * 60_000)
  ) {
    candidates.push({
      type: "unexpected_device_disconnection",
      severity: "warning",
      details: {
        device_status: input.deviceStatus ?? null,
        last_ping_ms: input.lastPingMs ?? null,
        threshold_minutes: thresholds.disconnectedAfterMinutes,
      },
    });
  }

  if ((input.eventsInWindow ?? 0) > thresholds.maxEventsPerFiveMinutes) {
    candidates.push({
      type: "abnormal_telemetry_frequency",
      severity: "warning",
      details: {
        events_in_five_minutes: input.eventsInWindow,
        threshold: thresholds.maxEventsPerFiveMinutes,
      },
    });
  }

  return candidates;
}

export interface FleetSlaThresholds {
  delayedMinutes: number;
  degradedMinutes: number;
  breachMinutes: number;
}

export type FleetSlaState = "compliant" | "delayed" | "degraded" | "breached";

export function classifyFleetFreshness(ageMinutes: number, thresholds: FleetSlaThresholds): FleetSlaState {
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0) return "breached";
  if (ageMinutes <= thresholds.delayedMinutes) return "compliant";
  if (ageMinutes <= thresholds.degradedMinutes) return "delayed";
  if (ageMinutes <= thresholds.breachMinutes) return "degraded";
  return "breached";
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
