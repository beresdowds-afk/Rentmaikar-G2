export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: '>' | '<' | '==' | '!=';
  threshold: number;
  severity: AlertSeverity;
  category: 'gps' | 'engine' | 'diagnostics' | 'security';
}

export const TELEMETRY_SCHEDULES = {
  GPS: {
    parkedIntervalMs: 3600000, // 1 hr
    movingIntervalMs: 30000, // 30s
    movingThresholdMph: 3,
  },
  ENGINE: {
    intervalMs: 900000, // 15 min
  },
};

export const ALERT_RULES: AlertRule[] = [
  {
    id: 'rule-speed',
    name: 'Over Speeding',
    metric: 'speed',
    condition: '>',
    threshold: 80,
    severity: 'warning',
    category: 'gps',
  },
  {
    id: 'rule-temp',
    name: 'High Engine Temperature',
    metric: 'coolantTemp',
    condition: '>',
    threshold: 105,
    severity: 'critical',
    category: 'engine',
  },
  {
    id: 'rule-battery',
    name: 'Low Battery Voltage',
    metric: 'batteryVoltage',
    condition: '<',
    threshold: 11.8,
    severity: 'warning',
    category: 'engine',
  },
];

export const MONITORING_THRESHOLDS = {
  maxSpeedMph: 85,
  maxCoolantTempC: 110,
  minBatteryVolts: 11.5,
  offlineTimeoutSeconds: 300,
};

export function getLastWillConfig(clientId: string) {
  return {
    topic: `rentmaikar/clients/${clientId}/status`,
    payload: JSON.stringify({ status: 'offline', timestamp: Date.now() }),
    qos: 1 as const,
    retain: true,
  };
}

export function checkTelemetryRateLimit(vehicleId: string, messageBytes: number): { allowed: boolean; reason?: string } {
  return { allowed: true };
}

class TelemetryScheduler {
  private timers = new Map<string, any>();

  startGpsSchedule(vehicleId: string, callback: () => void, isMoving: boolean = false) {
    this.stopGpsSchedule(vehicleId);
    const interval = isMoving ? TELEMETRY_SCHEDULES.GPS.movingIntervalMs : TELEMETRY_SCHEDULES.GPS.parkedIntervalMs;
    const timer = setInterval(callback, interval);
    this.timers.set(`gps-${vehicleId}`, timer);
  }

  stopGpsSchedule(vehicleId: string) {
    const key = `gps-${vehicleId}`;
    if (this.timers.has(key)) {
      clearInterval(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  updateGpsMotionState(vehicleId: string, isMoving: boolean, callback: () => void) {
    this.startGpsSchedule(vehicleId, callback, isMoving);
  }

  startEngineSchedule(vehicleId: string, callback: () => void) {
    this.stopEngineSchedule(vehicleId);
    const timer = setInterval(callback, TELEMETRY_SCHEDULES.ENGINE.intervalMs);
    this.timers.set(`engine-${vehicleId}`, timer);
  }

  stopEngineSchedule(vehicleId: string) {
    const key = `engine-${vehicleId}`;
    if (this.timers.has(key)) {
      clearInterval(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  recordDiagnosticEvent(vehicleId: string) {
    // Record occurrence
  }

  stopAllForVehicle(vehicleId: string) {
    this.stopGpsSchedule(vehicleId);
    this.stopEngineSchedule(vehicleId);
  }

  stopAll() {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  getScheduleStatus(vehicleId: string) {
    return {
      gpsActive: this.timers.has(`gps-${vehicleId}`),
      engineActive: this.timers.has(`engine-${vehicleId}`),
    };
  }
}

export const telemetryScheduler = new TelemetryScheduler();
