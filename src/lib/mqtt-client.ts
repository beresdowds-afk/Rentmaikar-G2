import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { supabase } from '@/integrations/supabase/client';
import {
  TELEMETRY_SCHEDULES,
  ALERT_RULES,
  getLastWillConfig,
  checkTelemetryRateLimit,
  telemetryScheduler,
  type AlertRule,
  type AlertSeverity,
} from '@/lib/telemetry-scheduler';
import {
  buildEMQXConnectOptions,
  EMQX_SHARED_SUBSCRIPTIONS,
  EMQX_SYS_TOPICS,
  EMQX_PROFILES,
  type EMQXBrokerProfile,
} from '@/lib/emqx-config';

export interface VehicleLocation {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignitionStatus: boolean;
  batteryLevel: number;
  timestamp: Date;
  isParked: boolean;
}

export interface AccelerometerData {
  vehicleId: string;
  x: number; // G-force
  y: number;
  z: number;
  totalG: number;
  timestamp: Date;
}

export interface AccidentEvent {
  vehicleId: string;
  driverId?: string;
  ownerId?: string;
  triggerType: 'sudden_deceleration' | 'impact' | 'rollover' | 'airbag' | 'fire';
  decelerationG: number;
  speedAtImpact: number;
  latitude: number;
  longitude: number;
  timestamp: Date;
  severity?: 'minor' | 'severe' | 'critical';
  isVerified?: boolean;
}

// Post-accident telemetry data
export interface PostAccidentTelemetry {
  vehicleId: string;
  location?: { latitude: number; longitude: number; accuracy?: number };
  imageUrls?: string[];
  occupantVitals?: {
    heartRate?: number;
    seatbeltEngaged?: boolean;
    consciousnessScore?: number; // 0-15 GCS scale
  };
  timestamp: Date;
}

// Accident alert routing targets
export type AccidentAlertTarget = 'emergency' | 'fleet' | 'insurance' | 'emergency_contact';

// IoT Telemetry Snapshot for incident logging
export interface IoTTelemetrySnapshot {
  vehicleId: string;
  capturedAt: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null;
  motion: {
    speed: number;
    heading: number;
    isParked: boolean;
  } | null;
  vehicle: {
    ignitionStatus: boolean;
    batteryLevel: number;
    fuelLevel?: number;
    engineTemp?: number;
    odometerReading?: number;
  } | null;
  diagnostics: {
    engineCode?: string[];
    checkEngineLightOn?: boolean;
    tirePressure?: { fl: number; fr: number; rl: number; rr: number };
    brakeWearLevel?: number;
    oilLevel?: number;
    coolantLevel?: number;
    transmissionTemp?: number;
  } | null;
  sensors: {
    lastAccelerometerReading?: { x: number; y: number; z: number; totalG: number };
    ambientTemp?: number;
    humidity?: number;
  } | null;
  connectivity: {
    signalStrength: number;
    lastPingMs: number;
    firmwareVersion?: string;
  } | null;
}

export interface MQTTConfig {
  brokerUrl: string;
  options?: IClientOptions;
}

export interface SafetyCheckResult {
  canProceed: boolean;
  reason: string;
  requiresConfirmation: boolean;
  vehicleStatus?: {
    isParked: boolean;
    isWithinSafeHours: boolean;
    speed: number;
  };
}

type LocationCallback = (location: VehicleLocation) => void;
type StatusCallback = (vehicleId: string, status: 'online' | 'offline') => void;
type AccidentCallback = (event: AccidentEvent) => void;
type PostAccidentTelemetryCallback = (data: PostAccidentTelemetry) => void;
type TelemetryFailureCallback = (failure: TelemetryFailureEvent) => void;

// Telemetry failure event for recall triggering
export interface TelemetryFailureEvent {
  vehicleId: string;
  failureType: 'telemetry_timeout' | 'connection_lost' | 'data_corruption' | 'sensor_malfunction';
  lastSuccessfulPing: Date | null;
  lastKnownLocation: VehicleLocation | null;
  failedAttempts: number;
  timestamp: Date;
}

// Safety Rules Helper Functions
const isWithinSafeDeactivationHours = (): boolean => {
  const now = new Date();
  const hour = now.getHours();
  // Safe hours: 1 AM to 5 AM (1:00 - 4:59)
  return hour >= 1 && hour < 5;
};

const PARKED_SPEED_THRESHOLD = 2; // mph - vehicle considered parked if speed < 2

// Accident detection thresholds
const ACCIDENT_THRESHOLDS = {
  SUDDEN_DECELERATION_G: 5.0, // 5G deceleration triggers detection (P0)
  CRITICAL_G: 8.0, // 8G+ is severe
  SPEED_BUFFER_MS: 5000, // Store last 5 seconds of speed data
};

class MQTTVehicleTracker {
  private client: MqttClient | null = null;
  private locationCallbacks: Map<string, Set<LocationCallback>> = new Map();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private accidentCallbacks: Set<AccidentCallback> = new Set();
  private postAccidentCallbacks: Set<PostAccidentTelemetryCallback> = new Set();
  private telemetryFailureCallbacks: Set<TelemetryFailureCallback> = new Set();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  
  // Telemetry monitoring
  private telemetryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private telemetryFailureCounts: Map<string, number> = new Map();
  private readonly TELEMETRY_TIMEOUT_MS = 120000; // 2 minutes without data = timeout
  private readonly MAX_FAILURES_BEFORE_RECALL = 3;
  
  // Store latest vehicle locations for safety checks
  private vehicleLocations: Map<string, VehicleLocation> = new Map();
  // Store speed history for accident detection
  private speedHistory: Map<string, { speed: number; timestamp: number }[]> = new Map();
  // Driver/owner mapping for accident reports
  private vehicleDriverMap: Map<string, { driverId: string; ownerId?: string }> = new Map();
  // Store latest sensor/diagnostic data for telemetry snapshots
  private vehicleDiagnostics: Map<string, any> = new Map();
  private vehicleSensors: Map<string, any> = new Map();
  private lastAccelerometer: Map<string, { x: number; y: number; z: number; totalG: number }> = new Map();

  // Alert callbacks
  private alertCallbacks: Set<(vehicleId: string, rule: AlertRule, result: { severity: AlertSeverity; message: string }) => void> = new Set();

  // EMQX broker monitoring data
  private sysMetrics: Map<string, any> = new Map();
  private brokerProfile: keyof typeof EMQX_PROFILES = 'production';
  private useSharedSubscriptions: boolean = true;

  // Default broker configuration — EMQX with persistent sessions & last will
  private defaultConfig: MQTTConfig = (() => {
    const emqx = buildEMQXConnectOptions('production');
    return {
      brokerUrl: emqx.brokerUrl,
      options: {
        ...emqx.options,
      },
    };
  })();

  connect(config?: Partial<MQTTConfig>): Promise<void> {
    return new Promise((resolve, reject) => {
      const finalConfig = {
        ...this.defaultConfig,
        ...config,
        options: { ...this.defaultConfig.options, ...config?.options }
      };

      try {
        // Add Last Will and Testament for vehicle offline detection
        const lwt = getLastWillConfig('fleet-monitor');
        finalConfig.options.will = {
          topic: lwt.topic,
          payload: Buffer.from(lwt.payload),
          qos: lwt.qos,
          retain: lwt.retain,
        };

        console.log(`[MQTT/EMQX] Connecting to ${finalConfig.brokerUrl} (profile: ${this.brokerProfile})`);
        this.client = mqtt.connect(finalConfig.brokerUrl, finalConfig.options);

        this.client.on('connect', () => {
          console.log('[MQTT/EMQX] Connected to EMQX broker');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // ── Subscribe using EMQX shared subscriptions for load balancing ──
          if (this.useSharedSubscriptions) {
            // Fleet monitor shared group — distributes telemetry across dashboard clients
            EMQX_SHARED_SUBSCRIPTIONS.FLEET_MONITOR.topics.forEach(topic => {
              this.client?.subscribe(topic, { qos: 1 }, (err) => {
                if (err) console.error(`[MQTT/EMQX] Shared sub error for ${topic}:`, err);
                else console.log(`[MQTT/EMQX] Shared subscription: ${topic}`);
              });
            });

            // Accident responder shared group
            EMQX_SHARED_SUBSCRIPTIONS.ACCIDENT_RESPONDER.topics.forEach(topic => {
              this.client?.subscribe(topic, { qos: 1 }, (err) => {
                if (err) console.error(`[MQTT/EMQX] Shared sub error for ${topic}:`, err);
              });
            });

            // Command processor shared group
            EMQX_SHARED_SUBSCRIPTIONS.COMMAND_PROCESSOR.topics.forEach(topic => {
              this.client?.subscribe(topic, { qos: 1 }, (err) => {
                if (err) console.error(`[MQTT/EMQX] Shared sub error for ${topic}:`, err);
              });
            });

            console.log('[MQTT/EMQX] Shared subscriptions active (fleet-monitor, accident-responder, cmd-processor)');
          } else {
            // Fallback: standard subscriptions (no load balancing)
            const telemetryTopics = [
              'rentmaikar/vehicles/+/telemetry/gps',
              'rentmaikar/vehicles/+/telemetry/engine',
              'rentmaikar/vehicles/+/telemetry/diagnostics',
              'rentmaikar/vehicles/+/telemetry/batch',
            ];
            telemetryTopics.forEach(topic => {
              this.client?.subscribe(topic, (err) => {
                if (err) console.error(`[MQTT/EMQX] Subscription error for ${topic}:`, err);
              });
            });
          }

          // Subscribe to legacy telemetry root (backward compat)
          this.client?.subscribe('rentmaikar/vehicles/+/telemetry', (err) => {
            if (err) console.error('[MQTT/EMQX] Subscription error:', err);
          });

          // Subscribe to status and commands (if not in shared mode already)
          if (!this.useSharedSubscriptions) {
            this.client?.subscribe('rentmaikar/vehicles/+/status', (err) => {
              if (err) console.error('[MQTT/EMQX] Subscription error:', err);
            });
            this.client?.subscribe('rentmaikar/vehicles/+/commands', (err) => {
              if (err) console.error('[MQTT/EMQX] Subscription error:', err);
            });
          }

          // ── Accident topics (direct — critical, not shared) ───
          const accidentTopics = [
            'rentmaikar/vehicles/+/accident/raw',
            'rentmaikar/vehicles/+/accident/raw/impact',
            'rentmaikar/vehicles/+/accident/raw/airbag',
            'rentmaikar/vehicles/+/accident/raw/rollover',
            'rentmaikar/vehicles/+/accident/verified',
            'rentmaikar/vehicles/+/accident/verified/severe',
            'rentmaikar/vehicles/+/accident/verified/minor',
            'rentmaikar/vehicles/+/accident/verified/fire',
            'rentmaikar/vehicles/+/accident/telemetry/location',
            'rentmaikar/vehicles/+/accident/telemetry/images',
            'rentmaikar/vehicles/+/accident/telemetry/vitals',
          ];

          accidentTopics.forEach(topic => {
            this.client?.subscribe(topic, { qos: 1 }, (err) => {
              if (err) console.error(`[MQTT/EMQX] Accident sub error for ${topic}:`, err);
            });
          });

          // Alert routing topics
          const alertTopics = [
            'rentmaikar/accident/alerts/emergency/+',
            'rentmaikar/accident/alerts/fleet/+',
            'rentmaikar/accident/alerts/insurance/+',
            'rentmaikar/accident/alerts/emergency_contact/+',
          ];

          alertTopics.forEach(topic => {
            this.client?.subscribe(topic, { qos: 1 }, (err) => {
              if (err) console.error(`[MQTT/EMQX] Alert sub error for ${topic}:`, err);
            });
          });

          // ── EMQX $SYS topics for broker monitoring ──────────
          Object.values(EMQX_SYS_TOPICS).forEach(sysTopic => {
            this.client?.subscribe(sysTopic, { qos: 0 }, (err) => {
              if (err) console.error(`[MQTT/EMQX] $SYS sub error for ${sysTopic}:`, err);
            });
          });
          console.log('[MQTT/EMQX] Subscribed to $SYS broker monitoring topics');

          // Subscribe to EMQX client events for connection tracking
          this.client?.subscribe('$SYS/brokers/+/clients/+/connected', { qos: 0 });
          this.client?.subscribe('$SYS/brokers/+/clients/+/disconnected', { qos: 0 });

          resolve();
        });

        this.client.on('message', (topic, message) => {
          // Handle $SYS metrics separately
          if (topic.startsWith('$SYS/')) {
            this.handleSysMessage(topic, message.toString());
            return;
          }
          this.handleMessage(topic, message.toString());
        });

        this.client.on('error', (error) => {
          console.error('[MQTT/EMQX] Connection error:', error);
          reject(error);
        });

        this.client.on('close', () => {
          console.log('[MQTT/EMQX] Connection closed');
          this.isConnected = false;
        });

        this.client.on('reconnect', () => {
          this.reconnectAttempts++;
          console.log(`[MQTT/EMQX] Reconnecting... Attempt ${this.reconnectAttempts}`);
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[MQTT/EMQX] Max reconnect attempts reached');
            this.client?.end();
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle EMQX $SYS monitoring messages
   */
  private handleSysMessage(topic: string, message: string): void {
    this.sysMetrics.set(topic, message);
  }

  /**
   * Get current EMQX $SYS metrics snapshot
   */
  getSysMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    this.sysMetrics.forEach((value, key) => {
      // Simplify key names
      const shortKey = key.replace(/\$SYS\/brokers\/[^/]+\//, '');
      metrics[shortKey] = value;
    });
    return metrics;
  }

  /**
   * Set the EMQX broker profile (production/staging/local)
   */
  setBrokerProfile(profile: keyof typeof EMQX_PROFILES): void {
    this.brokerProfile = profile;
    const emqx = buildEMQXConnectOptions(profile);
    this.defaultConfig = {
      brokerUrl: emqx.brokerUrl,
      options: emqx.options as any,
    };
    console.log(`[MQTT/EMQX] Broker profile set to: ${profile}`);
  }

  /**
   * Get current broker profile info
   */
  getBrokerProfile(): EMQXBrokerProfile & { profileKey: string } {
    return {
      ...EMQX_PROFILES[this.brokerProfile],
      profileKey: this.brokerProfile,
    };
  }

  /**
   * Toggle shared subscriptions on/off
   */
  setSharedSubscriptions(enabled: boolean): void {
    this.useSharedSubscriptions = enabled;
    console.log(`[MQTT/EMQX] Shared subscriptions: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Query EMQX HTTP API via edge function proxy.
   * Returns `{ __unavailable: true, reason, hint }` when the management API is
   * disabled/unreachable (e.g. serverless plans) instead of throwing, so callers
   * can degrade gracefully.
   */
  async queryEMQXApi(action: string, params?: Record<string, any>): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('emqx-monitoring', {
        body: { action, params },
      });
      if (error) throw error;
      if (data?.unavailable) {
        console.warn(`[MQTT/EMQX] management API unavailable (${action}):`, data.reason);
        return { __unavailable: true, reason: data.reason, hint: data.hint, config: data.config };
      }
      return data?.data;
    } catch (err) {
      console.error(`[MQTT/EMQX] API query failed (${action}):`, err);
      return { __unavailable: true, reason: 'request_failed', hint: (err as Error)?.message };
    }
  }

  disconnect(): void {
    if (this.client) {
      telemetryScheduler.stopAll();
      this.client.end();
      this.client = null;
      this.isConnected = false;
      console.log('[MQTT] Disconnected');
    }
  }

  private handleMessage(topic: string, message: string): void {
    try {
      const parts = topic.split('/');
      // Topic format: rentmaikar/vehicles/{vehicle_id}/{type}[/{subtype}]
      const vehicleId = parts[2];
      const messageType = parts[3];
      const subType = parts[4] || null; // e.g. gps, engine, diagnostics, batch

      // ── Telemetry topics ──────────────────────────────────
      if (messageType === 'telemetry') {
        // Rate limit check
        if (this.isRateLimited(vehicleId, message.length)) return;

        const data = JSON.parse(message);

        // Reset telemetry failure count on any successful telemetry data
        this.telemetryFailureCounts.set(vehicleId, 0);
        this.resetTelemetryTimeout(vehicleId);

        switch (subType) {
          case 'gps':
          case null: {
            // GPS / location data (also handles legacy root telemetry with lat/lng)
            const hasLocation = data.lat || data.latitude || data.lng || data.longitude;
            if (!hasLocation && subType === null) {
              // Root telemetry without location — may contain mixed data, fan out
              if (data.engine || data.rpm !== undefined) this.handleEngineData(vehicleId, data);
              if (data.dtcCodes || data.checkEngineLight !== undefined) this.handleSensorData(vehicleId, { type: 'diagnostics', ...data });
              break;
            }

            const location: VehicleLocation = {
              vehicleId,
              latitude: data.lat || data.latitude,
              longitude: data.lng || data.longitude,
              speed: data.speed || 0,
              heading: data.heading || 0,
              ignitionStatus: data.ignition ?? true,
              batteryLevel: data.battery || 100,
              timestamp: new Date(data.timestamp || Date.now()),
              isParked: (data.speed || 0) < PARKED_SPEED_THRESHOLD,
            };

            this.vehicleLocations.set(vehicleId, location);
            this.trackSpeedHistory(vehicleId, location.speed);

            // Notify location callbacks
            const callbacks = this.locationCallbacks.get(vehicleId);
            if (callbacks) callbacks.forEach(cb => cb(location));
            const allCallbacks = this.locationCallbacks.get('*');
            if (allCallbacks) allCallbacks.forEach(cb => cb(location));

            // Evaluate GPS alert rules (speeding, geofence)
            this.evaluateAlertRules(vehicleId, 'gps', data);

            // Update GPS schedule based on motion state
            const isMoving = location.speed >= TELEMETRY_SCHEDULES.GPS.movingThresholdMph;
            telemetryScheduler.updateGpsMotionState(vehicleId, isMoving, () => this.requestLocationReport(vehicleId));
            break;
          }

          case 'engine': {
            this.handleEngineData(vehicleId, data);
            // Evaluate engine alert rules (overheating, high RPM, low fuel, oil pressure)
            this.evaluateAlertRules(vehicleId, 'engine', data);
            break;
          }

          case 'diagnostics': {
            this.handleSensorData(vehicleId, { type: 'diagnostics', ...data });
            // Evaluate diagnostic alert rules immediately (on occurrence)
            this.evaluateAlertRules(vehicleId, 'diagnostics', data);
            telemetryScheduler.recordDiagnosticEvent(vehicleId);
            break;
          }

          case 'batch': {
            // Bulk historical data — process each record sequentially
            const records = Array.isArray(data) ? data : data.records || [];
            console.log(`[MQTT] Processing batch telemetry for ${vehicleId}: ${records.length} records`);
            records.forEach((record: any) => {
              if (record.lat || record.latitude) {
                const location: VehicleLocation = {
                  vehicleId,
                  latitude: record.lat || record.latitude,
                  longitude: record.lng || record.longitude,
                  speed: record.speed || 0,
                  heading: record.heading || 0,
                  ignitionStatus: record.ignition ?? true,
                  batteryLevel: record.battery || 100,
                  timestamp: new Date(record.timestamp || Date.now()),
                  isParked: (record.speed || 0) < PARKED_SPEED_THRESHOLD,
                };
                this.vehicleLocations.set(vehicleId, location);
                this.trackSpeedHistory(vehicleId, location.speed);
              }
            });

            // Notify with latest position after batch processing
            const latest = this.vehicleLocations.get(vehicleId);
            if (latest) {
              const cbs = this.locationCallbacks.get(vehicleId);
              if (cbs) cbs.forEach(cb => cb(latest));
              const allCbs = this.locationCallbacks.get('*');
              if (allCbs) allCbs.forEach(cb => cb(latest));
            }
            break;
          }
        }
      }

      // ── Status confirmation from immobilizer ──────────────
      if (messageType === 'status') {
        const data = JSON.parse(message);
        this.statusCallbacks.forEach(cb => cb(vehicleId, data.status));
      }

      // ── Commands topic (ack / responses from immobilizer) ─
      if (messageType === 'commands') {
        const data = JSON.parse(message);
        console.log(`[MQTT] Command response from ${vehicleId}:`, data);
      }

      // ── Accident topics ───────────────────────────────────
      if (messageType === 'accident') {
        const data = JSON.parse(message);
        this.handleAccidentMessage(vehicleId, subType, parts[5] || null, data);
      }

      // ── Alert topics (rentmaikar/accident/alerts/{target}/{vehicle_id}) ──
      if (parts[0] === 'rentmaikar' && parts[1] === 'accident' && parts[2] === 'alerts') {
        const alertTarget = parts[3] as AccidentAlertTarget;
        const alertVehicleId = parts[4];
        const data = JSON.parse(message);
        console.log(`[MQTT] Accident alert received — target: ${alertTarget}, vehicle: ${alertVehicleId}`, data);
        // Alert routing is handled by the backend; log for dashboards
      }
    } catch (error) {
      console.error('[MQTT] Error parsing message:', error);
    }
  }

  /**
   * Handle all accident subtopics
   */
  private handleAccidentMessage(vehicleId: string, category: string | null, subCategory: string | null, data: any): void {
    switch (category) {
      // ── Raw sensor data (immediate, unprocessed) ──────────
      case 'raw': {
        const triggerMap: Record<string, AccidentEvent['triggerType']> = {
          impact: 'impact',
          airbag: 'airbag',
          rollover: 'rollover',
        };
        const triggerType = (subCategory && triggerMap[subCategory]) || 'sudden_deceleration';
        const totalG = data.totalG || data.deceleration_g || data.force || 0;

        console.log(`[MQTT] Raw accident data (${triggerType}) for ${vehicleId}: ${totalG.toFixed(2)}G`);

        // Store accelerometer reading
        if (data.x !== undefined) {
          this.lastAccelerometer.set(vehicleId, {
            x: data.x, y: data.y || 0, z: data.z || 0, totalG,
          });
        }

        // Trigger accident event if above threshold
        if (totalG >= ACCIDENT_THRESHOLDS.SUDDEN_DECELERATION_G || triggerType === 'airbag') {
          this.triggerAccidentEvent(vehicleId, totalG, triggerType);
        }
        break;
      }

      // ── Verified/processed accidents ──────────────────────
      case 'verified': {
        const severityMap: Record<string, AccidentEvent['severity']> = {
          severe: 'severe',
          minor: 'minor',
          fire: 'critical',
        };
        const severity = (subCategory && severityMap[subCategory]) || 'severe';
        const location = this.vehicleLocations.get(vehicleId);
        const driverInfo = this.vehicleDriverMap.get(vehicleId);

        const event: AccidentEvent = {
          vehicleId,
          driverId: driverInfo?.driverId,
          ownerId: driverInfo?.ownerId,
          triggerType: data.triggerType || (subCategory === 'fire' ? 'fire' : 'impact'),
          decelerationG: data.deceleration_g || data.totalG || 0,
          speedAtImpact: data.speed_at_impact || data.speedAtImpact || 0,
          latitude: data.latitude || location?.latitude || 0,
          longitude: data.longitude || location?.longitude || 0,
          timestamp: new Date(data.timestamp || Date.now()),
          severity,
          isVerified: true,
        };

        console.log(`[MQTT] Verified accident (${severity}) for ${vehicleId}`);
        this.accidentCallbacks.forEach(cb => cb(event));

        // Publish to alert channels
        this.publishAccidentAlerts(vehicleId, event);

        // Send to backend
        this.sendAccidentToBackend(event);
        break;
      }

      // ── Post-accident telemetry ───────────────────────────
      case 'telemetry': {
        const postTelemetry: PostAccidentTelemetry = {
          vehicleId,
          timestamp: new Date(data.timestamp || Date.now()),
        };

        if (subCategory === 'location') {
          postTelemetry.location = {
            latitude: data.lat || data.latitude,
            longitude: data.lng || data.longitude,
            accuracy: data.accuracy,
          };
          // Update tracked location
          if (postTelemetry.location.latitude) {
            const existing = this.vehicleLocations.get(vehicleId);
            if (existing) {
              existing.latitude = postTelemetry.location.latitude;
              existing.longitude = postTelemetry.location.longitude;
              this.vehicleLocations.set(vehicleId, existing);
            }
          }
        }

        if (subCategory === 'images') {
          postTelemetry.imageUrls = data.urls || data.imageUrls || [];
          console.log(`[MQTT] Post-accident images for ${vehicleId}: ${postTelemetry.imageUrls?.length} photos`);
        }

        if (subCategory === 'vitals') {
          postTelemetry.occupantVitals = {
            heartRate: data.heart_rate || data.heartRate,
            seatbeltEngaged: data.seatbelt_engaged ?? data.seatbeltEngaged,
            consciousnessScore: data.gcs_score || data.consciousnessScore,
          };
          console.log(`[MQTT] Post-accident vitals for ${vehicleId}:`, postTelemetry.occupantVitals);
        }

        this.postAccidentCallbacks.forEach(cb => cb(postTelemetry));
        break;
      }
    }
  }

  /**
   * Publish accident alerts to routed alert topics
   */
  private publishAccidentAlerts(vehicleId: string, event: AccidentEvent): void {
    if (!this.client || !this.isConnected) return;

    const alertPayload = JSON.stringify({
      vehicleId: event.vehicleId,
      severity: event.severity || 'severe',
      triggerType: event.triggerType,
      decelerationG: event.decelerationG,
      speedAtImpact: event.speedAtImpact,
      latitude: event.latitude,
      longitude: event.longitude,
      timestamp: event.timestamp.toISOString(),
      driverId: event.driverId,
      ownerId: event.ownerId,
    });

    // Determine which alert channels to publish to based on severity
    const targets: AccidentAlertTarget[] = ['fleet']; // Always notify fleet manager

    if (event.severity === 'severe' || event.severity === 'critical' || event.triggerType === 'airbag' || event.triggerType === 'fire') {
      targets.push('emergency', 'insurance', 'emergency_contact');
    } else if (event.severity === 'minor') {
      targets.push('insurance');
    }

    targets.forEach(target => {
      const topic = `rentmaikar/accident/alerts/${target}/${vehicleId}`;
      this.client!.publish(topic, alertPayload, { qos: 1, retain: true }, (err) => {
        if (err) console.error(`[MQTT] Failed to publish alert to ${topic}:`, err);
        else console.log(`[MQTT] Accident alert published to ${target} for ${vehicleId}`);
      });
    });
  }

  /**
   * Send accident event to backend edge function
   */
  private async sendAccidentToBackend(event: AccidentEvent): Promise<void> {
    try {
      await supabase.functions.invoke('iot-accident-detection', {
        body: {
          ...event,
          deviceId: `device-${event.vehicleId}`,
          timestamp: event.timestamp.toISOString(),
        },
      });
      console.log('[MQTT] Accident event sent to backend');
    } catch (error) {
      console.error('[MQTT] Failed to send accident event:', error);
    }
  }

  // Subscribe to post-accident telemetry
  onPostAccidentTelemetry(callback: PostAccidentTelemetryCallback): () => void {
    this.postAccidentCallbacks.add(callback);
    return () => {
      this.postAccidentCallbacks.delete(callback);
    };
  }

  /**
   * Handle engine telemetry data (RPM, temperature, fuel level)
   */
  private handleEngineData(vehicleId: string, data: any): void {
    const engineData = {
      rpm: data.rpm,
      engineTemp: data.engine_temp || data.engineTemp,
      coolantTemp: data.coolant_temp || data.coolantTemp,
      fuelLevel: data.fuel_level || data.fuelLevel,
      oilPressure: data.oil_pressure || data.oilPressure,
      transmissionTemp: data.transmission_temp || data.transmissionTemp,
      odometer: data.odometer,
      updatedAt: Date.now(),
    };

    this.vehicleDiagnostics.set(vehicleId, {
      ...this.vehicleDiagnostics.get(vehicleId),
      ...engineData,
    });

    // Also process as sensor data for backward compat
    this.handleSensorData(vehicleId, { type: 'diagnostics', ...engineData });
  }

  private resetTelemetryTimeout(vehicleId: string): void {
    // Clear existing timeout
    const existingTimeout = this.telemetryTimeouts.get(vehicleId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout - if no data received within threshold, trigger failure
    const timeout = setTimeout(() => {
      this.handleTelemetryTimeout(vehicleId);
    }, this.TELEMETRY_TIMEOUT_MS);

    this.telemetryTimeouts.set(vehicleId, timeout);
  }

  private handleTelemetryTimeout(vehicleId: string): void {
    const failureCount = (this.telemetryFailureCounts.get(vehicleId) || 0) + 1;
    this.telemetryFailureCounts.set(vehicleId, failureCount);

    console.warn(`[MQTT] Telemetry timeout for vehicle ${vehicleId} (failure #${failureCount})`);

    // Notify callbacks about the failure
    const lastLocation = this.vehicleLocations.get(vehicleId);
    const failureEvent: TelemetryFailureEvent = {
      vehicleId,
      failureType: 'telemetry_timeout',
      lastSuccessfulPing: lastLocation?.timestamp || null,
      lastKnownLocation: lastLocation || null,
      failedAttempts: failureCount,
      timestamp: new Date(),
    };

    this.telemetryFailureCallbacks.forEach(cb => cb(failureEvent));

    // Reset timeout to continue monitoring
    this.resetTelemetryTimeout(vehicleId);
  }

  // Subscribe to telemetry failure events
  onTelemetryFailure(callback: TelemetryFailureCallback): () => void {
    this.telemetryFailureCallbacks.add(callback);
    return () => {
      this.telemetryFailureCallbacks.delete(callback);
    };
  }

  private trackSpeedHistory(vehicleId: string, speed: number): void {
    const now = Date.now();
    if (!this.speedHistory.has(vehicleId)) {
      this.speedHistory.set(vehicleId, []);
    }
    
    const history = this.speedHistory.get(vehicleId)!;
    history.push({ speed, timestamp: now });
    
    // Keep only last 5 seconds of data
    const cutoff = now - ACCIDENT_THRESHOLDS.SPEED_BUFFER_MS;
    this.speedHistory.set(
      vehicleId,
      history.filter(h => h.timestamp > cutoff)
    );
  }

  private handleSensorData(vehicleId: string, data: any): void {
    // Store sensor data for telemetry snapshots
    if (data.type === 'accelerometer' || data.type === 'impact') {
      const totalG = data.totalG || Math.sqrt(
        Math.pow(data.x || 0, 2) + 
        Math.pow(data.y || 0, 2) + 
        Math.pow(data.z || 0, 2)
      );

      // Store latest accelerometer reading
      this.lastAccelerometer.set(vehicleId, {
        x: data.x || 0,
        y: data.y || 0,
        z: data.z || 0,
        totalG,
      });

      if (totalG >= ACCIDENT_THRESHOLDS.SUDDEN_DECELERATION_G) {
        console.log(`[MQTT] Accident detected for ${vehicleId}: ${totalG.toFixed(2)}G`);
        // Publish raw accident data to the new accident/raw topic
        this.publishRawAccidentData(vehicleId, totalG, data.type === 'impact' ? 'impact' : 'sudden_deceleration', data);
        this.triggerAccidentEvent(vehicleId, totalG, data.type === 'impact' ? 'impact' : 'sudden_deceleration');
      }
    }

    // Store diagnostic data
    if (data.type === 'diagnostics') {
      this.vehicleDiagnostics.set(vehicleId, {
        ...this.vehicleDiagnostics.get(vehicleId),
        ...data,
        updatedAt: Date.now(),
      });
    }

    // Store environmental/other sensor data
    if (data.type === 'environment' || data.type === 'sensors') {
      this.vehicleSensors.set(vehicleId, {
        ...this.vehicleSensors.get(vehicleId),
        ...data,
        updatedAt: Date.now(),
      });
    }

    // Handle airbag deployment signal
    if (data.type === 'airbag' && data.deployed) {
      console.log(`[MQTT] Airbag deployment detected for ${vehicleId}`);
      this.publishRawAccidentData(vehicleId, 10, 'airbag', data);
      this.triggerAccidentEvent(vehicleId, 10, 'airbag');
    }
  }

  /**
   * Publish raw accident sensor data to dedicated accident/raw subtopics
   */
  private publishRawAccidentData(
    vehicleId: string,
    totalG: number,
    triggerType: AccidentEvent['triggerType'],
    rawData: any
  ): void {
    if (!this.client || !this.isConnected) return;

    const location = this.vehicleLocations.get(vehicleId);
    const payload = JSON.stringify({
      totalG,
      triggerType,
      latitude: location?.latitude || 0,
      longitude: location?.longitude || 0,
      speed: location?.speed || 0,
      timestamp: new Date().toISOString(),
      raw: rawData,
    });

    // Publish to root raw topic
    this.client.publish(
      `rentmaikar/vehicles/${vehicleId}/accident/raw`,
      payload,
      { qos: 1 },
      (err) => { if (err) console.error('[MQTT] Failed to publish raw accident:', err); }
    );

    // Publish to specific subtype
    const subtypeMap: Record<string, string> = {
      impact: 'impact',
      sudden_deceleration: 'impact',
      airbag: 'airbag',
      rollover: 'rollover',
      fire: 'impact',
    };
    const subTopic = subtypeMap[triggerType] || 'impact';
    this.client.publish(
      `rentmaikar/vehicles/${vehicleId}/accident/raw/${subTopic}`,
      payload,
      { qos: 1 },
      (err) => { if (err) console.error(`[MQTT] Failed to publish raw/${subTopic}:`, err); }
    );
  }

  private async triggerAccidentEvent(
    vehicleId: string, 
    decelerationG: number, 
    triggerType: AccidentEvent['triggerType']
  ): Promise<void> {
    const location = this.vehicleLocations.get(vehicleId);
    const speedHistory = this.speedHistory.get(vehicleId) || [];
    const speedAtImpact = speedHistory.length > 0 
      ? speedHistory[speedHistory.length - 1].speed 
      : 0;

    const driverInfo = this.vehicleDriverMap.get(vehicleId);
    
    // Determine severity
    const severity: AccidentEvent['severity'] = 
      decelerationG >= ACCIDENT_THRESHOLDS.CRITICAL_G || triggerType === 'airbag' || triggerType === 'fire'
        ? 'critical'
        : decelerationG >= ACCIDENT_THRESHOLDS.SUDDEN_DECELERATION_G
          ? 'severe'
          : 'minor';

    const event: AccidentEvent = {
      vehicleId,
      driverId: driverInfo?.driverId,
      ownerId: driverInfo?.ownerId,
      triggerType,
      decelerationG,
      speedAtImpact,
      latitude: location?.latitude || 0,
      longitude: location?.longitude || 0,
      timestamp: new Date(),
      severity,
      isVerified: false, // Raw detection — not yet verified
    };

    // Notify local callbacks
    this.accidentCallbacks.forEach(cb => cb(event));

    // Publish accident alerts to routed channels
    this.publishAccidentAlerts(vehicleId, event);

    // Send to backend for incident creation
    this.sendAccidentToBackend(event);

    // P0: Dispatch emergency services for severe/critical accidents
    if (severity === 'severe' || severity === 'critical' || triggerType === 'airbag' || triggerType === 'fire') {
      this.dispatchEmergencyServices(event);
    }
  }

  // Register vehicle-driver mapping for accident reports
  registerVehicleDriver(vehicleId: string, driverId: string, ownerId?: string): void {
    this.vehicleDriverMap.set(vehicleId, { driverId, ownerId });
  }

  // Subscribe to accident events
  onAccident(callback: AccidentCallback): () => void {
    this.accidentCallbacks.add(callback);
    return () => {
      this.accidentCallbacks.delete(callback);
    };
  }

  subscribeToVehicle(vehicleId: string, callback: LocationCallback): () => void {
    if (!this.locationCallbacks.has(vehicleId)) {
      this.locationCallbacks.set(vehicleId, new Set());
    }
    this.locationCallbacks.get(vehicleId)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.locationCallbacks.get(vehicleId)?.delete(callback);
    };
  }

  subscribeToAllVehicles(callback: LocationCallback): () => void {
    return this.subscribeToVehicle('*', callback);
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  // Get vehicle's latest known location
  getVehicleLocation(vehicleId: string): VehicleLocation | undefined {
    return this.vehicleLocations.get(vehicleId);
  }

  // Update local vehicle state (for mock/demo purposes)
  updateVehicleLocation(vehicleId: string, location: VehicleLocation): void {
    this.vehicleLocations.set(vehicleId, location);
  }

  /**
   * SAFETY CHECK: Validate if vehicle can be disabled
   * Rules enforced:
   * 1. Vehicle MUST be parked (speed < 2 mph)
   * 2. Automatic deactivation only between 1AM-5AM
   * 3. Outside safe hours, admin confirmation is required
   */
  performSafetyCheck(vehicleId: string, isAfterThirdNotification: boolean = false): SafetyCheckResult {
    const location = this.vehicleLocations.get(vehicleId);
    const isWithinSafeHours = isWithinSafeDeactivationHours();
    
    // If no location data, we cannot verify safety
    if (!location) {
      return {
        canProceed: false,
        reason: 'Cannot verify vehicle status. No location data available.',
        requiresConfirmation: false,
        vehicleStatus: undefined,
      };
    }

    const isParked = location.isParked || location.speed < PARKED_SPEED_THRESHOLD;

    // RULE 1: Vehicle MUST be parked
    if (!isParked) {
      return {
        canProceed: false,
        reason: `Vehicle is currently moving at ${Math.round(location.speed)} mph. Deactivation is only allowed when the vehicle is parked for safety.`,
        requiresConfirmation: false,
        vehicleStatus: {
          isParked,
          isWithinSafeHours,
          speed: location.speed,
        },
      };
    }

    // RULE 2: After 3rd payment default notification, can deactivate any time (if parked)
    if (isAfterThirdNotification) {
      return {
        canProceed: true,
        reason: 'Vehicle is parked and 3rd payment notification has been sent. Deactivation authorized.',
        requiresConfirmation: false,
        vehicleStatus: {
          isParked,
          isWithinSafeHours,
          speed: location.speed,
        },
      };
    }

    // RULE 3: Within safe hours (1AM-5AM), can proceed automatically
    if (isWithinSafeHours) {
      return {
        canProceed: true,
        reason: 'Vehicle is parked and within safe deactivation hours (1AM-5AM). Deactivation authorized.',
        requiresConfirmation: false,
        vehicleStatus: {
          isParked,
          isWithinSafeHours,
          speed: location.speed,
        },
      };
    }

    // RULE 4: Outside safe hours, require admin confirmation
    return {
      canProceed: true,
      reason: `Vehicle is parked but outside safe hours (current time: ${new Date().toLocaleTimeString()}). Admin confirmation required to proceed.`,
      requiresConfirmation: true,
      vehicleStatus: {
        isParked,
        isWithinSafeHours,
        speed: location.speed,
      },
    };
  }

  /**
   * Send command to vehicle with safety checks
   * @param vehicleId - The vehicle ID
   * @param command - The command to send
   * @param options - Additional options including override flags
   */
  async sendCommand(
    vehicleId: string, 
    command: 'disable' | 'enable' | 'lock' | 'unlock',
    options: { 
      adminConfirmed?: boolean; 
      isAfterThirdNotification?: boolean;
      bypassSafetyCheck?: boolean;
    } = {}
  ): Promise<{ success: boolean; message: string; safetyCheck?: SafetyCheckResult }> {
    
    // Enable command doesn't require safety checks
    if (command === 'enable' || command === 'unlock') {
      return this.executeCommand(vehicleId, command);
    }

    // For disable/lock commands, perform safety checks unless bypassed
    if (!options.bypassSafetyCheck) {
      const safetyCheck = this.performSafetyCheck(vehicleId, options.isAfterThirdNotification);

      // Cannot proceed at all
      if (!safetyCheck.canProceed) {
        console.warn(`[MQTT] Safety check failed for ${vehicleId}: ${safetyCheck.reason}`);
        return {
          success: false,
          message: safetyCheck.reason,
          safetyCheck,
        };
      }

      // Requires confirmation but not confirmed
      if (safetyCheck.requiresConfirmation && !options.adminConfirmed) {
        console.warn(`[MQTT] Admin confirmation required for ${vehicleId}: ${safetyCheck.reason}`);
        return {
          success: false,
          message: safetyCheck.reason,
          safetyCheck,
        };
      }
    }

    // All checks passed, execute command
    return this.executeCommand(vehicleId, command);
  }

  private async executeCommand(
    vehicleId: string, 
    command: 'disable' | 'enable' | 'lock' | 'unlock'
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      if (!this.client || !this.isConnected) {
        // For demo/offline mode, still allow command
        console.log(`[MQTT] Offline mode: ${command} command for vehicle ${vehicleId}`);
        resolve({
          success: true,
          message: `${command.charAt(0).toUpperCase() + command.slice(1)} command queued (offline mode)`,
        });
        return;
      }

      const topic = `rentmaikar/vehicles/${vehicleId}/commands`;
      const payload = JSON.stringify({
        command,
        timestamp: new Date().toISOString(),
        requestId: Math.random().toString(36).slice(2, 11),
      });

      this.client.publish(topic, payload, { qos: 1 }, (error) => {
        if (error) {
          console.error('[MQTT] Command send error:', error);
          resolve({
            success: false,
            message: `Failed to send ${command} command: ${error.message}`,
          });
        } else {
          console.log(`[MQTT] Command sent: ${command} to vehicle ${vehicleId}`);
          resolve({
            success: true,
            message: `${command.charAt(0).toUpperCase() + command.slice(1)} command sent successfully`,
          });
        }
      });
    });
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Capture complete IoT telemetry snapshot for incident logging
   * Called when driver reports maintenance/breakdown to preserve vehicle state
   */
  captureIoTSnapshot(vehicleId: string): IoTTelemetrySnapshot {
    const location = this.vehicleLocations.get(vehicleId);
    const diagnostics = this.vehicleDiagnostics.get(vehicleId);
    const sensors = this.vehicleSensors.get(vehicleId);
    const accelerometer = this.lastAccelerometer.get(vehicleId);
    const speedHistory = this.speedHistory.get(vehicleId) || [];

    console.log(`[MQTT] Capturing IoT snapshot for vehicle ${vehicleId}`);

    const snapshot: IoTTelemetrySnapshot = {
      vehicleId,
      capturedAt: new Date().toISOString(),
      location: location ? {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: 5, // meters (simulated)
      } : null,
      motion: location ? {
        speed: location.speed,
        heading: location.heading,
        isParked: location.isParked,
      } : null,
      vehicle: location ? {
        ignitionStatus: location.ignitionStatus,
        batteryLevel: location.batteryLevel,
        fuelLevel: diagnostics?.fuelLevel,
        engineTemp: diagnostics?.engineTemp,
        odometerReading: diagnostics?.odometer,
      } : null,
      diagnostics: diagnostics ? {
        engineCode: diagnostics.dtcCodes || [],
        checkEngineLightOn: diagnostics.checkEngineLight || false,
        tirePressure: diagnostics.tirePressure,
        brakeWearLevel: diagnostics.brakeWear,
        oilLevel: diagnostics.oilLevel,
        coolantLevel: diagnostics.coolantLevel,
        transmissionTemp: diagnostics.transmissionTemp,
      } : null,
      sensors: {
        lastAccelerometerReading: accelerometer,
        ambientTemp: sensors?.ambientTemp,
        humidity: sensors?.humidity,
      },
      connectivity: {
        signalStrength: diagnostics?.signalStrength || 85,
        lastPingMs: location ? Date.now() - location.timestamp.getTime() : 0,
        firmwareVersion: diagnostics?.firmwareVersion,
      },
    };

    console.log(`[MQTT] IoT snapshot captured:`, snapshot);
    return snapshot;
  }

  /**
   * Request fresh diagnostic data from vehicle
   * Sends command to IoT device to report all current parameters
   */
  async requestDiagnosticReport(vehicleId: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      console.log(`[MQTT] Offline mode: Cannot request diagnostics for ${vehicleId}`);
      return;
    }

    const topic = `rentmaikar/vehicles/${vehicleId}/commands`;
    const payload = JSON.stringify({
      command: 'report_diagnostics',
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).slice(2, 11),
      params: {
        includeOBD: true,
        includeSensors: true,
        includeLocation: true,
      },
    });

    return new Promise((resolve) => {
      this.client!.publish(topic, payload, { qos: 1 }, (error) => {
        if (error) {
          console.error('[MQTT] Diagnostic request error:', error);
        } else {
          console.log(`[MQTT] Diagnostic report requested for ${vehicleId}`);
        }
        resolve();
      });
    });
  }

  // ── Alert Rules Engine ───────────────────────────────────

  /**
   * Evaluate telemetry data against all enabled alert rules.
   * Called automatically on every GPS, engine, and diagnostics message.
   */
  private evaluateAlertRules(vehicleId: string, source: AlertRule['source'], data: Record<string, any>): void {
    const rules = ALERT_RULES.filter(r => r.enabled && r.source === source);
    for (const rule of rules) {
      const result = rule.evaluate(data);
      if (result) {
        console.log(`[MQTT] Alert triggered: ${rule.name} for ${vehicleId} — ${result.severity}: ${result.message}`);
        this.alertCallbacks.forEach(cb => cb(vehicleId, rule, result));

        // Log alert to telemetry
        this.logTelemetryAlert(vehicleId, rule, result);
      }
    }
  }

  private async logTelemetryAlert(vehicleId: string, rule: AlertRule, result: { severity: AlertSeverity; message: string }): Promise<void> {
    try {
      await supabase.from('mqtt_telemetry_logs').insert({
        vehicle_id: vehicleId,
        data_type: `alert:${rule.id}`,
        payload: { ruleId: rule.id, ruleName: rule.name, severity: result.severity, message: result.message },
        mqtt_topic: `rentmaikar/vehicles/${vehicleId}/alerts/${rule.id}`,
      });
    } catch (e) {
      console.error('[MQTT] Failed to log alert:', e);
    }
  }

  /**
   * Subscribe to alert rule triggers
   */
  onAlert(callback: (vehicleId: string, rule: AlertRule, result: { severity: AlertSeverity; message: string }) => void): () => void {
    this.alertCallbacks.add(callback);
    return () => { this.alertCallbacks.delete(callback); };
  }

  // ── Telemetry Scheduling ─────────────────────────────────

  /**
   * Start telemetry schedules for a vehicle.
   * GPS: 1hr parked / 30s moving. Engine: 15min. Diagnostics: on occurrence.
   */
  startTelemetrySchedules(vehicleId: string): void {
    // GPS schedule
    telemetryScheduler.startGpsSchedule(vehicleId, () => {
      this.requestLocationReport(vehicleId);
    }, false);

    // Engine schedule (every 15 min)
    telemetryScheduler.startEngineSchedule(vehicleId, () => {
      this.requestEngineReport(vehicleId);
    });

    console.log(`[MQTT] Telemetry schedules started for ${vehicleId}`);
  }

  stopTelemetrySchedules(vehicleId: string): void {
    telemetryScheduler.stopAllForVehicle(vehicleId);
  }

  private requestLocationReport(vehicleId: string): void {
    if (!this.client || !this.isConnected) return;
    const topic = `rentmaikar/vehicles/${vehicleId}/commands`;
    this.client.publish(topic, JSON.stringify({
      command: 'report_gps',
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).slice(2, 11),
    }), { qos: TELEMETRY_SCHEDULES.GPS.qos });
  }

  private requestEngineReport(vehicleId: string): void {
    if (!this.client || !this.isConnected) return;
    const topic = `rentmaikar/vehicles/${vehicleId}/commands`;
    this.client.publish(topic, JSON.stringify({
      command: 'report_engine',
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).slice(2, 11),
    }), { qos: TELEMETRY_SCHEDULES.ENGINE.qos });
  }

  /**
   * Check rate limit before processing a message (prevents overload)
   */
  private isRateLimited(vehicleId: string, messageBytes: number): boolean {
    const result = checkTelemetryRateLimit(vehicleId, messageBytes);
    if (!result.allowed) {
      console.warn(`[MQTT] Rate limited for ${vehicleId}: ${result.reason}`);
    }
    return !result.allowed;
  }

  // ── Emergency Dispatch Integration ───────────────────────

  /**
   * Dispatch emergency services for severe/critical accidents.
   * Sends to accident-emergency-dispatch edge function.
   */
  private async dispatchEmergencyServices(event: AccidentEvent): Promise<void> {
    try {
      const speedHistory = this.speedHistory.get(event.vehicleId) || [];
      const accelerometerData = this.lastAccelerometer.get(event.vehicleId);

      await supabase.functions.invoke('accident-emergency-dispatch', {
        body: {
          incidentId: `incident-${Date.now()}`,
          vehicleId: event.vehicleId,
          driverId: event.driverId || 'unknown',
          ownerId: event.ownerId,
          severity: event.severity || 'severe',
          triggerType: event.triggerType,
          decelerationG: event.decelerationG,
          speedAtImpact: event.speedAtImpact,
          latitude: event.latitude,
          longitude: event.longitude,
          timestamp: event.timestamp.toISOString(),
          blackBoxData: {
            speedHistory: speedHistory.slice(-30),
            accelerometerHistory: accelerometerData ? [{ ...accelerometerData, t: Date.now() }] : [],
          },
        },
      });
      console.log('[MQTT] Emergency dispatch invoked');
    } catch (error) {
      console.error('[MQTT] Emergency dispatch failed:', error);
    }
  }

  getScheduleStatus(vehicleId: string) {
    return telemetryScheduler.getScheduleStatus(vehicleId);
  }
}

// Singleton instance
export const mqttTracker = new MQTTVehicleTracker();
