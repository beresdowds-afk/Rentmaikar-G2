import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

export type BridgeMode = "active" | "disabled" | "maintenance" | "restricted";

export interface FrontendCallTriggerInfo {
  timestamp: string;
  origin?: string;
  referer?: string;
  path?: string;
  method?: string;
  ip?: string;
  userAgent?: string;
  actionTaken: string;
}

export interface BridgeToggleEvent {
  id: string;
  timestamp: string;
  previousState: boolean;
  newState: boolean;
  mode: BridgeMode;
  toggledBy: string;
  reason: string;
}

export interface FrontendResponseTelemetry {
  id: string;
  correlationId: string;
  eventType: string;
  status: string;
  clientTimestamp?: string;
  serverTimestamp: string;
  clientOrigin?: string;
  clientIp?: string;
  communicationChannel: "direct" | "staging_fallback";
  latencyMs?: number;
  payload?: any;
}

export interface BridgeEventPacket {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  targetDomain: string;
  data: any;
}

export interface BridgeConfig {
  enabled: boolean;
  mode: BridgeMode;
  frontendDomain: string;
  frontendOrigin: string;
  backendDomain: string;
  backendUrl: string;
  allowedOrigins: string[];
  allowCredentials: boolean;
  maintenanceMessage: string;
  lastToggledAt: string;
  lastToggledBy: string;
  autoDisconnectOnFrontendTraffic: boolean;
  autoDisconnectTriggerCount: number;
  lastAutoDisconnectTrigger?: FrontendCallTriggerInfo | null;
  history: BridgeToggleEvent[];
}

const DATA_DIR = path.resolve(__dirname, "../../data");
const CONFIG_FILE = path.join(DATA_DIR, "bridge-config.json");

const DEFAULT_CONFIG: BridgeConfig = {
  enabled: true,
  mode: "active",
  frontendDomain: "rentmaikar.com",
  frontendOrigin: "https://rentmaikar.com",
  backendDomain: "staging.rentmaikar.com",
  backendUrl: process.env.PUBLIC_BACKEND_URL || "https://staging.rentmaikar.com",
  allowedOrigins: [
    "https://rentmaikar.com",
    "https://www.rentmaikar.com",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  allowCredentials: true,
  maintenanceMessage:
    "Direct connection between frontend (rentmaikar.com) and backend (staging.rentmaikar.com) is currently disabled by the Platform Administrator.",
  lastToggledAt: new Date().toISOString(),
  lastToggledBy: "System (Default)",
  autoDisconnectOnFrontendTraffic: true,
  autoDisconnectTriggerCount: 0,
  lastAutoDisconnectTrigger: null,
  history: [
    {
      id: "init-1",
      timestamp: new Date().toISOString(),
      previousState: false,
      newState: true,
      mode: "active",
      toggledBy: "System Initialization",
      reason: "Initial deployment setup connecting rentmaikar.com to staging.rentmaikar.com",
    },
  ],
};

class BridgeManager extends EventEmitter {
  private config: BridgeConfig;
  private activeListenersCount = 0;
  private responseHistory: FrontendResponseTelemetry[] = [];
  private eventHistory: BridgeEventPacket[] = [];

  constructor() {
    super();
    this.config = this.loadConfig();
    this.setMaxListeners(100);
  }

  private ensureDataDir(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn("[BridgeManager] Could not create data directory, using memory state:", err);
    }
  }

  private loadConfig(): BridgeConfig {
    try {
      this.ensureDataDir();
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (err) {
      console.warn("[BridgeManager] Error reading config file, falling back to defaults:", err);
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      this.ensureDataDir();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      console.warn("[BridgeManager] Failed to persist config to disk:", err);
    }
  }

  public getConfig(): BridgeConfig {
    return { ...this.config };
  }

  public isDirectConnectionEnabled(): boolean {
    return this.config.enabled;
  }

  public isOriginAllowed(origin?: string): boolean {
    if (!origin) return true; // Direct non-browser/internal requests
    const normalized = origin.trim().replace(/\/+$/, "").toLowerCase();
    return this.config.allowedOrigins.some(
      (allowed) => allowed.toLowerCase().replace(/\/+$/, "") === normalized
    );
  }

  public setConnectionState(
    enabled: boolean,
    toggledBy: string,
    reason = "Manual administration toggle",
    mode: BridgeMode = enabled ? "active" : "disabled"
  ): BridgeConfig {
    const previousState = this.config.enabled;
    const event: BridgeToggleEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      previousState,
      newState: enabled,
      mode,
      toggledBy: toggledBy || "Admin",
      reason: reason || (enabled ? "Restored frontend-backend link" : "Severed frontend-backend link"),
    };

    this.config.enabled = enabled;
    this.config.mode = mode;
    this.config.lastToggledAt = event.timestamp;
    this.config.lastToggledBy = event.toggledBy;
    this.config.history = [event, ...this.config.history.slice(0, 49)]; // keep latest 50

    this.saveConfig();
    console.info(
      `[BridgeManager] Frontend direct connection ${enabled ? "ENABLED" : "DISABLED"} by ${toggledBy}`
    );

    // Broadcast change to all listening frontend clients on staging.rentmaikar.com
    this.broadcastEvent({
      id: `evt-bridge-state-${Date.now()}`,
      type: "bridge_status_changed",
      timestamp: new Date().toISOString(),
      source: "staging.rentmaikar.com",
      targetDomain: "rentmaikar.com",
      data: {
        enabled,
        mode,
        toggledBy,
        reason,
        directConnectionActive: enabled,
        fallbackActive: !enabled,
      },
    });

    return this.getConfig();
  }

  public updateAllowedOrigins(origins: string[], updatedBy: string): BridgeConfig {
    const cleaned = Array.from(
      new Set(
        origins
          .map((o) => o.trim().replace(/\/+$/, ""))
          .filter(Boolean)
      )
    );
    this.config.allowedOrigins = cleaned;
    this.config.lastToggledBy = updatedBy;
    this.saveConfig();
    return this.getConfig();
  }

  public setMaintenanceMessage(message: string, updatedBy: string): BridgeConfig {
    this.config.maintenanceMessage = message.trim();
    this.config.lastToggledBy = updatedBy;
    this.saveConfig();
    return this.getConfig();
  }

  // -------------------------------------------------------------
  // Automatic Disconnect on Frontend Call Detection
  // -------------------------------------------------------------

  public isAutoDisconnectOnFrontendTrafficEnabled(): boolean {
    return this.config.autoDisconnectOnFrontendTraffic === true;
  }

  public setAutoDisconnectOnFrontendTraffic(enabled: boolean, toggledBy = "Admin"): BridgeConfig {
    this.config.autoDisconnectOnFrontendTraffic = enabled;
    this.config.lastToggledBy = toggledBy;
    this.config.lastToggledAt = new Date().toISOString();
    this.saveConfig();

    console.info(
      `[BridgeManager] Auto-disconnect switch on frontend calls ${enabled ? "ARMED/ENABLED" : "DISARMED/DISABLED"} by ${toggledBy}`
    );

    this.broadcastEvent({
      id: `evt-auto-disconnect-toggle-${Date.now()}`,
      type: "auto_disconnect_policy_toggled",
      timestamp: new Date().toISOString(),
      source: "staging.rentmaikar.com",
      targetDomain: "rentmaikar.com",
      data: {
        autoDisconnectOnFrontendTraffic: enabled,
        toggledBy,
      },
    });

    return this.getConfig();
  }

  public triggerAutoDisconnectOnFrontendCall(details: {
    origin?: string;
    referer?: string;
    path?: string;
    method?: string;
    ip?: string;
    userAgent?: string;
  }): {
    disconnected: boolean;
    bridgeActive: boolean;
    triggerCount: number;
    message: string;
  } {
    const triggerRecord: FrontendCallTriggerInfo = {
      timestamp: new Date().toISOString(),
      origin: details.origin,
      referer: details.referer,
      path: details.path,
      method: details.method,
      ip: details.ip,
      userAgent: details.userAgent,
      actionTaken: "Direct link severed; staging bridge activated",
    };

    this.config.autoDisconnectTriggerCount = (this.config.autoDisconnectTriggerCount || 0) + 1;
    this.config.lastAutoDisconnectTrigger = triggerRecord;

    const previousState = this.config.enabled;
    const wasAlreadyDisconnected = !previousState;

    if (!wasAlreadyDisconnected) {
      this.config.enabled = false;
      this.config.mode = "disabled";
      this.config.lastToggledAt = triggerRecord.timestamp;
      this.config.lastToggledBy = `Auto-Trigger (Call from ${details.origin || details.referer || "rentmaikar.com"})`;

      const event: BridgeToggleEvent = {
        id: `evt-auto-disc-${Date.now()}`,
        timestamp: triggerRecord.timestamp,
        previousState: true,
        newState: false,
        mode: "disabled",
        toggledBy: this.config.lastToggledBy,
        reason: `Auto-disconnect triggered by call from rentmaikar.com frontend (${details.method || "GET"} ${details.path || "/"}). Bridge activated immediately.`,
      };
      this.config.history = [event, ...this.config.history.slice(0, 49)];
      this.saveConfig();

      console.warn(
        `[BridgeManager] ⚡ CALL DETECTED from rentmaikar.com frontend (${details.origin || details.referer})! Direct link severed immediately. Fallback bridge is now ACTIVE.`
      );

      this.broadcastEvent({
        id: `evt-auto-bridge-active-${Date.now()}`,
        type: "frontend_call_auto_disconnected",
        timestamp: triggerRecord.timestamp,
        source: "staging.rentmaikar.com",
        targetDomain: "rentmaikar.com",
        data: {
          directConnectionActive: false,
          bridgeActive: true,
          fallbackActive: true,
          trigger: triggerRecord,
          message: "Front files disconnected from back end files immediately upon call detection. Fallback bridge is now ACTIVE.",
        },
      });
    }

    return {
      disconnected: true,
      bridgeActive: true,
      triggerCount: this.config.autoDisconnectTriggerCount,
      message: "Direct link disconnected upon call from rentmaikar.com. Fallback bridge is ACTIVE.",
    };
  }

  // -------------------------------------------------------------
  // Event Listening & Telemetry Support for Frontend Calls/Responses
  // -------------------------------------------------------------

  public incrementListeners(): number {
    this.activeListenersCount++;
    return this.activeListenersCount;
  }

  public decrementListeners(): number {
    this.activeListenersCount = Math.max(0, this.activeListenersCount - 1);
    return this.activeListenersCount;
  }

  public getActiveListenersCount(): number {
    return this.activeListenersCount;
  }

  public broadcastEvent(packet: BridgeEventPacket): void {
    this.eventHistory = [packet, ...this.eventHistory.slice(0, 49)];
    this.emit("bridge_event", packet);
  }

  public logFrontendResponse(telemetry: Omit<FrontendResponseTelemetry, "id" | "serverTimestamp">): FrontendResponseTelemetry {
    const record: FrontendResponseTelemetry = {
      ...telemetry,
      id: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      serverTimestamp: new Date().toISOString(),
    };

    this.responseHistory = [record, ...this.responseHistory.slice(0, 99)]; // keep latest 100
    console.info(
      `[BridgeManager] Frontend response received [${record.communicationChannel}] type=${record.eventType} corr=${record.correlationId}`
    );
    return record;
  }

  public getResponseHistory(limit = 20): FrontendResponseTelemetry[] {
    return this.responseHistory.slice(0, limit);
  }

  public getRecentEvents(limit = 20): BridgeEventPacket[] {
    return this.eventHistory.slice(0, limit);
  }
}

export const bridgeManager = new BridgeManager();

