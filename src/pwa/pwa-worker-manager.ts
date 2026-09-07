// src/pwa/pwa-worker-manager.ts
/**
 * Dedicated Web Worker manager for PWA live synchronization.
 *
 * Replaces the traditional Service Worker background sync with a dedicated
 * Web Worker executing on an isolated background thread. This avoids:
 * - Stale HTML/JS cache poisoning caused by service worker fetch interceptors.
 * - Service worker lifecycle activation delays and reload loops.
 * - Background timer throttling imposed on main-thread window intervals.
 */

import type { LiveSyncCommand, LiveSyncTick } from "@/workers/live-sync.worker";

export interface PwaWorkerState {
  isSupported: boolean;
  isRunning: boolean;
  lastHeartbeatAt: number | null;
  lastVersionCheckAt: number | null;
  ticksEmitted: number;
  uptimeMs: number;
  workerType: "dedicated-worker" | "timer-fallback";
}

type TickListener = (tick: LiveSyncTick) => void;

class PwaWorkerManager {
  private worker: Worker | null = null;
  private listeners = new Set<TickListener>();
  private state: PwaWorkerState = {
    isSupported: typeof Worker !== "undefined",
    isRunning: false,
    lastHeartbeatAt: null,
    lastVersionCheckAt: null,
    ticksEmitted: 0,
    uptimeMs: 0,
    workerType: "timer-fallback",
  };
  private fallbackInterval: number | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === "undefined" || !this.state.isSupported) {
      this.state.workerType = "timer-fallback";
      return;
    }

    try {
      this.worker = new Worker(
        new URL("../workers/live-sync.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (event: MessageEvent<LiveSyncTick>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (err) => {
        console.warn("[PWA Worker] Dedicated worker error, maintaining fallback:", err);
      };

      this.state.workerType = "dedicated-worker";
      console.info("[PWA] Dedicated Web Worker initialized for background sync.");
    } catch (e) {
      console.warn("[PWA] Could not spawn dedicated module worker, using fallback timers:", e);
      this.state.workerType = "timer-fallback";
    }
  }

  private handleWorkerMessage(tick: LiveSyncTick) {
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
    }

    // Dispatch to registered listeners
    for (const listener of this.listeners) {
      try {
        listener(tick);
      } catch (err) {
        console.error("[PWA Worker] Listener error:", err);
      }
    }
  }

  public subscribe(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public sendCommand(cmd: LiveSyncCommand) {
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
          const ms = cmd.type === "start" && cmd.heartbeatMs ? cmd.heartbeatMs : 60_000;
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

  public triggerImmediateSync() {
    this.sendCommand({ type: "sync-now" });
  }

  public getState(): Readonly<PwaWorkerState> {
    return { ...this.state };
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
