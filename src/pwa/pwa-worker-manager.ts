// src/pwa/pwa-worker-manager.ts
/**
 * Dedicated Web Worker Manager for Real-Time PWA Platform Sync.
 *
 * Coordinates the off-main-thread synchronization engine between installed PWAs,
 * mobile browser clients, and the RentMaikar platform in real time.
 *
 * Capabilities:
 * - Spawns and supervises `src/workers/pwa-platform-sync.worker.ts`.
 * - Manages store-and-forward offline mutation queue with persistence.
 * - Bridges platform delta events into TanStack React Query cache invalidations.
 * - Synchronizes across multi-tab PWA instances via BroadcastChannel.
 * - Provides live latency, online/offline status, and diagnostic telemetry.
 */

import type {
  PlatformSyncDelta,
  PwaPlatformSyncCommand,
  PwaPlatformSyncTick,
  QueuedMutation,
  SyncWorkerConfig,
} from "@/workers/pwa-platform-sync.worker";
import type { LiveSyncCommand, LiveSyncTick } from "@/workers/live-sync.worker";

export interface PwaWorkerState {
  isSupported: boolean;
  isRunning: boolean;
  isOnline: boolean;
  latencyMs: number | null;
  lastHeartbeatAt: number | null;
  lastSyncedAt: number | null;
  lastVersionCheckAt: number | null;
  platformVersion: string | null;
  ticksEmitted: number;
  uptimeMs: number;
  pendingMutationsCount: number;
  failedMutationsCount: number;
  workerType: "dedicated-worker" | "timer-fallback";
  lastDelta: PlatformSyncDelta | null;
}

export type AnySyncTick = LiveSyncTick | PwaPlatformSyncTick;
type TickListener = (tick: AnySyncTick) => void;
type DeltaListener = (delta: PlatformSyncDelta, latencyMs: number) => void;

const PENDING_MUTATIONS_STORAGE_KEY = "rmk_pwa_pending_mutations_v1";

class PwaWorkerManager {
  private worker: Worker | null = null;
  private listeners = new Set<TickListener>();
  private deltaListeners = new Set<DeltaListener>();
  private state: PwaWorkerState = {
    isSupported: typeof Worker !== "undefined",
    isRunning: false,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    latencyMs: null,
    lastHeartbeatAt: null,
    lastSyncedAt: null,
    lastVersionCheckAt: null,
    platformVersion: null,
    ticksEmitted: 0,
    uptimeMs: 0,
    pendingMutationsCount: 0,
    failedMutationsCount: 0,
    workerType: "timer-fallback",
    lastDelta: null,
  };
  private fallbackInterval: number | null = null;
  private queryInvalidator: ((keys: string[]) => void) | null = null;

  constructor() {
    this.init();
    this.setupWindowListeners();
  }

  private init() {
    if (typeof window === "undefined" || !this.state.isSupported) {
      this.state.workerType = "timer-fallback";
      return;
    }

    try {
      // Primary: Real-time PWA platform sync worker
      this.worker = new Worker(
        new URL("../workers/pwa-platform-sync.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (event: MessageEvent<PwaPlatformSyncTick>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (err) => {
        console.warn("[PWA Real-time Sync Worker] Dedicated worker notice:", err);
      };

      this.state.workerType = "dedicated-worker";
      console.info("[PWA] Dedicated Platform Sync Worker initialized for real-time sync.");

      // Restore any persisted offline mutations
      this.restoreOfflineMutations();
    } catch (e) {
      console.warn("[PWA] Falling back to legacy worker or timer scheduler:", e);
      try {
        this.worker = new Worker(
          new URL("../workers/live-sync.worker.ts", import.meta.url),
          { type: "module" }
        );
        this.worker.onmessage = (event: MessageEvent<LiveSyncTick>) => {
          this.handleWorkerMessage(event.data);
        };
        this.state.workerType = "dedicated-worker";
      } catch (fallbackErr) {
        console.warn("[PWA] Could not spawn fallback module worker:", fallbackErr);
        this.state.workerType = "timer-fallback";
      }
    }
  }

  private setupWindowListeners() {
    if (typeof window === "undefined") return;

    window.addEventListener("online", () => {
      this.state.isOnline = true;
      this.sendCommand({ type: "resume" });
      this.sendCommand({ type: "sync-now", forceFull: true });
    });

    window.addEventListener("offline", () => {
      this.state.isOnline = false;
    });
  }

  private handleWorkerMessage(tick: AnySyncTick) {
    if (!tick) return;

    if (tick.type === "heartbeat") {
      this.state.lastHeartbeatAt = tick.at;
      this.state.ticksEmitted++;
    } else if (tick.type === "version-check") {
      this.state.lastVersionCheckAt = tick.at;
    } else if (tick.type === "status") {
      this.state.isRunning = tick.running;
      this.state.ticksEmitted = tick.ticksEmitted;
      this.state.uptimeMs = tick.uptimeMs;
      if ("latencyMs" in tick && tick.latencyMs !== undefined) {
        this.state.latencyMs = tick.latencyMs;
      }
      if ("isOnline" in tick && tick.isOnline !== undefined) {
        this.state.isOnline = tick.isOnline;
      }
      if ("pendingMutationsCount" in tick && tick.pendingMutationsCount !== undefined) {
        this.state.pendingMutationsCount = tick.pendingMutationsCount;
      }
      if ("platformVersion" in tick && tick.platformVersion !== undefined) {
        this.state.platformVersion = tick.platformVersion;
      }
    } else if (tick.type === "sync:platform-delta") {
      this.state.lastSyncedAt = tick.at;
      this.state.latencyMs = tick.latencyMs;
      this.state.lastDelta = tick.delta;
      this.state.ticksEmitted++;

      // Trigger delta listeners
      for (const listener of this.deltaListeners) {
        try {
          listener(tick.delta, tick.latencyMs);
        } catch (err) {
          console.error("[PWA Sync] Delta listener error:", err);
        }
      }

      // Automatically invalidate queries based on platform changes
      this.handleDeltaInvalidations(tick.delta);
    } else if (tick.type === "sync:mutation-applied") {
      this.state.pendingMutationsCount = tick.remainingQueue;
      this.removeFromOfflineStorage(tick.mutationId);
    } else if (tick.type === "sync:mutation-failed") {
      this.state.failedMutationsCount++;
    } else if (tick.type === "sync:queue-status") {
      this.state.pendingMutationsCount = tick.pendingCount;
      this.state.failedMutationsCount = tick.failedCount;
    } else if (tick.type === "sync:network-change") {
      this.state.isOnline = tick.isOnline;
    }

    // Dispatch to registered tick listeners
    for (const listener of this.listeners) {
      try {
        listener(tick);
      } catch (err) {
        console.error("[PWA Worker] Listener error:", err);
      }
    }
  }

  private handleDeltaInvalidations(delta: PlatformSyncDelta) {
    if (!this.queryInvalidator) return;

    const keysToInvalidate: string[] = [];

    // If vehicles updated on platform
    if (delta.vehiclesUpdated && delta.vehiclesUpdated > (this.state.lastSyncedAt || 0) - 60_000) {
      keysToInvalidate.push("vehicles", "catalogue", "owner-vehicles", "public-vehicles");
    }

    // If platform announcements or features updated
    if (delta.systemAnnouncements && delta.systemAnnouncements > 0) {
      keysToInvalidate.push("admin-notifications", "platform-features");
    }

    if (keysToInvalidate.length > 0) {
      this.queryInvalidator(keysToInvalidate);
    }
  }

  public registerQueryInvalidator(invalidator: (keys: string[]) => void) {
    this.queryInvalidator = invalidator;
  }

  public subscribe(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeDelta(listener: DeltaListener): () => void {
    this.deltaListeners.add(listener);
    return () => {
      this.deltaListeners.delete(listener);
    };
  }

  public sendCommand(cmd: PwaPlatformSyncCommand | LiveSyncCommand) {
    if (this.worker) {
      this.worker.postMessage(cmd);
      if (cmd.type === "start" || cmd.type === "resume") {
        this.state.isRunning = true;
      } else if (cmd.type === "pause" || cmd.type === "stop") {
        this.state.isRunning = false;
      }
    } else {
      // Fallback timer simulation
      if (cmd.type === "start" || cmd.type === "resume") {
        this.state.isRunning = true;
        if (!this.fallbackInterval) {
          const ms = cmd.type === "start" && "heartbeatMs" in cmd && cmd.heartbeatMs ? cmd.heartbeatMs : 60_000;
          this.fallbackInterval = window.setInterval(() => {
            this.handleWorkerMessage({ type: "heartbeat", at: Date.now() });
          }, ms);
        }
      } else if (cmd.type === "pause" || cmd.type === "stop") {
        this.state.isRunning = false;
        if (this.fallbackInterval !== null) {
          clearInterval(this.fallbackInterval);
          this.fallbackInterval = null;
        }
      } else if (cmd.type === "sync-now") {
        this.handleWorkerMessage({ type: "heartbeat", at: Date.now() });
        this.handleWorkerMessage({ type: "version-check", at: Date.now() });
      }
    }
  }

  public triggerImmediateSync(forceFull: boolean = false) {
    this.sendCommand({ type: "sync-now", forceFull });
  }

  /**
   * Enqueues an offline action/mutation to be synchronized with the RentMaikar platform.
   */
  public async queueMutation(action: string, payload: Record<string, any>): Promise<string> {
    const id = `mut_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const mutation: QueuedMutation = {
      id,
      action,
      payload,
      createdAt: Date.now(),
      retryCount: 0,
      status: "pending",
    };

    // Save locally to storage for persistence across reloads
    this.saveToOfflineStorage(mutation);

    // Dispatch to worker
    this.sendCommand({
      type: "queue-mutation",
      mutation,
    });

    this.state.pendingMutationsCount++;
    return id;
  }

  public clearQueue() {
    this.clearOfflineStorage();
    this.sendCommand({ type: "clear-queue" });
    this.state.pendingMutationsCount = 0;
    this.state.failedMutationsCount = 0;
  }

  public retryFailedMutations() {
    this.sendCommand({ type: "retry-failed-mutations" });
  }

  public getState(): Readonly<PwaWorkerState> {
    return { ...this.state };
  }

  // --- Offline Storage Helpers ---
  private saveToOfflineStorage(mutation: QueuedMutation) {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(PENDING_MUTATIONS_STORAGE_KEY);
      const list: QueuedMutation[] = raw ? JSON.parse(raw) : [];
      list.push(mutation);
      localStorage.setItem(PENDING_MUTATIONS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  private removeFromOfflineStorage(mutationId: string) {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(PENDING_MUTATIONS_STORAGE_KEY);
      if (!raw) return;
      const list: QueuedMutation[] = JSON.parse(raw);
      const filtered = list.filter((m) => m.id !== mutationId);
      localStorage.setItem(PENDING_MUTATIONS_STORAGE_KEY, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  }

  private clearOfflineStorage() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(PENDING_MUTATIONS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private restoreOfflineMutations() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(PENDING_MUTATIONS_STORAGE_KEY);
      if (!raw) return;
      const list: QueuedMutation[] = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        console.info(`[PWA Sync] Restoring ${list.length} pending mutation(s) from offline storage.`);
        for (const mutation of list) {
          this.sendCommand({
            type: "queue-mutation",
            mutation,
          });
        }
      }
    } catch (e) {
      console.warn("[PWA Sync] Failed to parse offline mutations:", e);
    }
  }

  public terminate() {
    if (this.worker) {
      this.sendCommand({ type: "stop" });
      this.worker.terminate();
      this.worker = null;
    }
    if (this.fallbackInterval !== null) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    this.state.isRunning = false;
  }
}

// Global singleton instance
export const pwaWorkerManager = new PwaWorkerManager();
export { pwaWorkerManager as pwaPlatformSyncManager };
