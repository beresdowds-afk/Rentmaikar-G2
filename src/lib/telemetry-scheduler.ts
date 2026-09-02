/**
 * Telemetry Scheduling & Rules Engine
 * 
 * GPS: every 1 hour (or 30s when moving)
 * Engine: every 15 minutes
 * Diagnostics: on occurrence (immediate)
 * 
 * QoS Strategy:
 *   GPS      → QoS 0 (best effort, high frequency)
 *   Engine   → QoS 1 (at least once, moderate frequency)
 *   Diagnostics → QoS 1 (at least once, on occurrence)
 *   Accident → QoS 2 (exactly once, critical)
 *   Commands → QoS 1 (at least once)
 *   Batch    → QoS 1 (at least once)
 */

// ── Schedule Intervals ─────────────────────────────────────

export const TELEMETRY_SCHEDULES = {
  GPS: {
    /** Parked interval: report location once per hour */
    parkedIntervalMs: 60 * 60 * 1000, // 1 hour
    /** Moving interval: report every 30 seconds */
    movingIntervalMs: 30 * 1000, // 30s
    /** Speed threshold to switch between parked/moving */
    movingThresholdMph: 2,
    qos: 0 as const,
  },
  ENGINE: {
    /** Engine telemetry every 15 minutes */
    intervalMs: 15 * 60 * 1000, // 15 minutes
    qos: 1 as const,
  },
  DIAGNOSTICS: {
    /** Diagnostics fire on occurrence — no interval */
    intervalMs: 0,
    qos: 1 as const,
  },
  BATCH: {
    /** Batch upload of stored records when connectivity restored */
    maxRecordsPerBatch: 500,
    qos: 1 as const,
  },
  ACCIDENT: {
    /** Accident events use QoS 2 — exactly once delivery */
    qos: 2 as const,
  },
} as const;

// ── Alert Rule Definitions ─────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Data source: which telemetry subtopic triggers this rule */
  source: 'gps' | 'engine' | 'diagnostics' | 'accident';
  /** Evaluation function — returns severity or null (no alert) */
  evaluate: (data: Record<string, any>) => { severity: AlertSeverity; message: string } | null;
}

export const ALERT_RULES: AlertRule[] = [
  // ── GPS / Speed ────────────────────────────────
  {
    id: 'speeding',
    name: 'Speeding Alert',
    description: 'Vehicle exceeds speed limit',
    enabled: true,
    source: 'gps',
    evaluate: (data) => {
      const speed = data.speed || 0;
      if (speed > 120) return { severity: 'critical', message: `Extreme speed: ${speed} mph` };
      if (speed > 85) return { severity: 'warning', message: `Speeding: ${speed} mph` };
      return null;
    },
  },
  {
    id: 'geofence_breach',
    name: 'Geofence Breach',
    description: 'Vehicle left authorized area',
    enabled: true,
    source: 'gps',
    evaluate: (data) => {
      if (data.geofenceBreach) {
        return { severity: 'critical', message: `Vehicle left authorized zone: ${data.geofenceZone || 'unknown'}` };
      }
      return null;
    },
  },

  // ── Engine ─────────────────────────────────────
  {
    id: 'overheating',
    name: 'Engine Overheating',
    description: 'Engine temperature exceeds safe limit',
    enabled: true,
    source: 'engine',
    evaluate: (data) => {
      const temp = data.engine_temp || data.engineTemp || 0;
      if (temp > 260) return { severity: 'critical', message: `Engine critical: ${temp}°F` };
      if (temp > 230) return { severity: 'warning', message: `Engine hot: ${temp}°F` };
      return null;
    },
  },
  {
    id: 'low_fuel',
    name: 'Low Fuel',
    description: 'Fuel level below threshold',
    enabled: true,
    source: 'engine',
    evaluate: (data) => {
      const fuel = data.fuel_level || data.fuelLevel;
      if (fuel !== undefined && fuel < 10) return { severity: 'warning', message: `Low fuel: ${fuel}%` };
      return null;
    },
  },
  {
    id: 'high_rpm',
    name: 'High RPM',
    description: 'Sustained high RPM indicating aggressive driving',
    enabled: true,
    source: 'engine',
    evaluate: (data) => {
      const rpm = data.rpm || 0;
      if (rpm > 6500) return { severity: 'critical', message: `Dangerously high RPM: ${rpm}` };
      if (rpm > 5000) return { severity: 'warning', message: `High RPM: ${rpm}` };
      return null;
    },
  },
  {
    id: 'low_oil_pressure',
    name: 'Low Oil Pressure',
    description: 'Oil pressure below safe operating range',
    enabled: true,
    source: 'engine',
    evaluate: (data) => {
      const oilPressure = data.oil_pressure || data.oilPressure;
      if (oilPressure !== undefined && oilPressure < 20) {
        return { severity: 'critical', message: `Low oil pressure: ${oilPressure} PSI` };
      }
      return null;
    },
  },

  // ── Diagnostics ────────────────────────────────
  {
    id: 'check_engine',
    name: 'Check Engine Light',
    description: 'Check engine light activated',
    enabled: true,
    source: 'diagnostics',
    evaluate: (data) => {
      if (data.checkEngineLight || data.check_engine_light) {
        const codes = data.dtcCodes || data.dtc_codes || [];
        return { severity: 'warning', message: `Check engine: ${codes.length} DTC codes (${codes.slice(0, 3).join(', ')})` };
      }
      return null;
    },
  },
  {
    id: 'low_battery',
    name: 'Low Device Battery',
    description: 'IoT device battery critically low',
    enabled: true,
    source: 'diagnostics',
    evaluate: (data) => {
      const battery = data.batteryLevel ?? data.battery_level;
      if (battery !== undefined && battery < 15) {
        return { severity: 'critical', message: `IoT device battery critical: ${battery}%` };
      }
      if (battery !== undefined && battery < 30) {
        return { severity: 'warning', message: `IoT device battery low: ${battery}%` };
      }
      return null;
    },
  },
  {
    id: 'low_tire_pressure',
    name: 'Low Tire Pressure',
    description: 'One or more tires below safe pressure',
    enabled: true,
    source: 'diagnostics',
    evaluate: (data) => {
      const tires = data.tirePressure || data.tire_pressure;
      if (!tires) return null;
      const low = Object.entries(tires).filter(([, psi]) => (psi as number) < 28);
      if (low.length > 0) {
        return {
          severity: low.some(([, psi]) => (psi as number) < 22) ? 'critical' : 'warning',
          message: `Low tire pressure: ${low.map(([pos, psi]) => `${pos}=${psi}PSI`).join(', ')}`,
        };
      }
      return null;
    },
  },
];

// ── EMQX Monitoring Thresholds ─────────────────────────────

export const MONITORING_THRESHOLDS = {
  /** Alert when vehicle stops publishing (no telemetry for 30 minutes) */
  vehicleOfflineTimeoutMs: 30 * 60 * 1000,
  /** Alert on high message backlog (messages queued) */
  messageBacklogThreshold: 1000,
  /** Max bandwidth per vehicle per hour (bytes) */
  maxBandwidthPerVehiclePerHour: 5 * 1024 * 1024, // 5MB
  /** Max messages per vehicle per minute (rate limit) */
  maxMessagesPerVehiclePerMinute: 60,
};

// ── Last Will & Testament Config ───────────────────────────

export interface LastWillConfig {
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
  retain: boolean;
}

export function getLastWillConfig(vehicleId: string): LastWillConfig {
  return {
    topic: `rentmaikar/vehicles/${vehicleId}/status`,
    payload: JSON.stringify({
      status: 'offline',
      reason: 'unexpected_disconnect',
      lastSeen: new Date().toISOString(),
    }),
    qos: 1,
    retain: true,
  };
}

// ── Persistent Session Config ──────────────────────────────

export interface PersistentSessionConfig {
  /** Use clean=false for spotty connections so broker queues messages */
  cleanSession: boolean;
  /** Session expiry in seconds (24 hours) */
  sessionExpiryIntervalSec: number;
  /** Maximum queued messages while offline */
  receiveMaximum: number;
}

export function getPersistentSessionConfig(): PersistentSessionConfig {
  return {
    cleanSession: false,
    sessionExpiryIntervalSec: 86400, // 24 hours
    receiveMaximum: 1000,
  };
}

// ── Rate Limiter for MQTT Messages ─────────────────────────

interface VehicleRateState {
  messageCount: number;
  windowStart: number;
  bytesThisHour: number;
  hourStart: number;
}

const vehicleRates = new Map<string, VehicleRateState>();

export function checkTelemetryRateLimit(vehicleId: string, messageBytes: number): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let state = vehicleRates.get(vehicleId);

  if (!state) {
    state = { messageCount: 0, windowStart: now, bytesThisHour: 0, hourStart: now };
    vehicleRates.set(vehicleId, state);
  }

  // Reset minute window
  if (now - state.windowStart > 60_000) {
    state.messageCount = 0;
    state.windowStart = now;
  }

  // Reset hour window
  if (now - state.hourStart > 3600_000) {
    state.bytesThisHour = 0;
    state.hourStart = now;
  }

  // Check message rate
  if (state.messageCount >= MONITORING_THRESHOLDS.maxMessagesPerVehiclePerMinute) {
    return { allowed: false, reason: `Rate limit: ${state.messageCount} msgs/min exceeded` };
  }

  // Check bandwidth
  if (state.bytesThisHour + messageBytes > MONITORING_THRESHOLDS.maxBandwidthPerVehiclePerHour) {
    return { allowed: false, reason: `Bandwidth limit: ${(state.bytesThisHour / 1024 / 1024).toFixed(1)}MB/hr exceeded` };
  }

  state.messageCount++;
  state.bytesThisHour += messageBytes;
  return { allowed: true };
}

// ── Telemetry Schedule Manager ─────────────────────────────

type TelemetryType = 'gps' | 'engine' | 'diagnostics';

interface ScheduleEntry {
  vehicleId: string;
  type: TelemetryType;
  timer: ReturnType<typeof setInterval> | null;
  lastSent: number;
  isMoving: boolean;
}

class TelemetryScheduleManager {
  private schedules = new Map<string, ScheduleEntry>();

  private getKey(vehicleId: string, type: TelemetryType): string {
    return `${vehicleId}:${type}`;
  }

  /**
   * Start GPS schedule for a vehicle. Adapts interval based on motion.
   */
  startGpsSchedule(vehicleId: string, publishFn: () => void, isMoving: boolean = false): void {
    const key = this.getKey(vehicleId, 'gps');
    this.stopSchedule(vehicleId, 'gps');

    const interval = isMoving
      ? TELEMETRY_SCHEDULES.GPS.movingIntervalMs
      : TELEMETRY_SCHEDULES.GPS.parkedIntervalMs;

    const timer = setInterval(publishFn, interval);
    this.schedules.set(key, {
      vehicleId,
      type: 'gps',
      timer,
      lastSent: Date.now(),
      isMoving,
    });

    console.log(`[TelemetryScheduler] GPS schedule started for ${vehicleId}: every ${interval / 1000}s (${isMoving ? 'moving' : 'parked'})`);
  }

  /**
   * Update GPS schedule when vehicle motion state changes.
   */
  updateGpsMotionState(vehicleId: string, isMoving: boolean, publishFn: () => void): void {
    const key = this.getKey(vehicleId, 'gps');
    const existing = this.schedules.get(key);
    if (existing && existing.isMoving !== isMoving) {
      console.log(`[TelemetryScheduler] Motion state changed for ${vehicleId}: ${isMoving ? 'moving' : 'parked'}`);
      this.startGpsSchedule(vehicleId, publishFn, isMoving);
    }
  }

  /**
   * Start engine telemetry schedule (every 15 minutes).
   */
  startEngineSchedule(vehicleId: string, publishFn: () => void): void {
    const key = this.getKey(vehicleId, 'engine');
    this.stopSchedule(vehicleId, 'engine');

    const timer = setInterval(publishFn, TELEMETRY_SCHEDULES.ENGINE.intervalMs);
    this.schedules.set(key, {
      vehicleId,
      type: 'engine',
      timer,
      lastSent: Date.now(),
      isMoving: false,
    });

    console.log(`[TelemetryScheduler] Engine schedule started for ${vehicleId}: every 15 min`);
  }

  /**
   * Diagnostics are immediate (on occurrence) — no schedule needed.
   * This just records the last sent time for monitoring.
   */
  recordDiagnosticEvent(vehicleId: string): void {
    const key = this.getKey(vehicleId, 'diagnostics');
    const existing = this.schedules.get(key);
    if (existing) {
      existing.lastSent = Date.now();
    } else {
      this.schedules.set(key, {
        vehicleId,
        type: 'diagnostics',
        timer: null,
        lastSent: Date.now(),
        isMoving: false,
      });
    }
  }

  stopSchedule(vehicleId: string, type: TelemetryType): void {
    const key = this.getKey(vehicleId, type);
    const entry = this.schedules.get(key);
    if (entry?.timer) {
      clearInterval(entry.timer);
      this.schedules.delete(key);
    }
  }

  stopAllForVehicle(vehicleId: string): void {
    (['gps', 'engine', 'diagnostics'] as TelemetryType[]).forEach(type => {
      this.stopSchedule(vehicleId, type);
    });
  }

  stopAll(): void {
    this.schedules.forEach(entry => {
      if (entry.timer) clearInterval(entry.timer);
    });
    this.schedules.clear();
  }

  getScheduleStatus(vehicleId: string): Record<TelemetryType, { active: boolean; lastSent: number; isMoving?: boolean }> {
    const result = {} as any;
    (['gps', 'engine', 'diagnostics'] as TelemetryType[]).forEach(type => {
      const key = this.getKey(vehicleId, type);
      const entry = this.schedules.get(key);
      result[type] = {
        active: !!entry?.timer || type === 'diagnostics',
        lastSent: entry?.lastSent || 0,
        ...(type === 'gps' ? { isMoving: entry?.isMoving } : {}),
      };
    });
    return result;
  }
}

export const telemetryScheduler = new TelemetryScheduleManager();
