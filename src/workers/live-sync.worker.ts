/// <reference lib="webworker" />
/**
 * Live-sync scheduler worker.
 *
 * Browsers aggressively throttle `setInterval` on background tabs and on
 * installed PWAs that are not in the foreground, which is exactly when a
 * suspended app drifts out of sync. A dedicated worker keeps its own timers
 * running on a separate thread, so the main thread receives reliable ticks it
 * can turn into cache refreshes and app-update checks.
 *
 * Intervals are supplied by the main thread and can be reconfigured or paused
 * at any time (see `src/lib/live-sync-settings.ts`), so battery/data-saver
 * modes translate directly into fewer wakeups here.
 *
 * This is NOT a service worker: it never intercepts fetches and never caches
 * anything, so it does not interfere with the kill-switch `public/sw.js`.
 */

export type LiveSyncTick =
  | { type: "heartbeat"; at: number }
  | { type: "version-check"; at: number };

export type LiveSyncCommand =
  | { type: "start"; heartbeatMs?: number; versionCheckMs?: number }
  | { type: "configure"; heartbeatMs?: number; versionCheckMs?: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const MIN_HEARTBEAT_MS = 15_000;
const MIN_VERSION_CHECK_MS = 60_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let versionTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatMs = 60_000;
let versionCheckMs = 5 * 60_000;
let running = false;

function clearTimers() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (versionTimer) clearInterval(versionTimer);
  heartbeatTimer = null;
  versionTimer = null;
}

function schedule() {
  clearTimers();
  if (!running) return;
  heartbeatTimer = setInterval(() => {
    ctx.postMessage({ type: "heartbeat", at: Date.now() } satisfies LiveSyncTick);
  }, heartbeatMs);
  versionTimer = setInterval(() => {
    ctx.postMessage({ type: "version-check", at: Date.now() } satisfies LiveSyncTick);
  }, versionCheckMs);
}

function applyConfig(next: { heartbeatMs?: number; versionCheckMs?: number }) {
  if (typeof next.heartbeatMs === "number" && next.heartbeatMs > 0) {
    heartbeatMs = Math.max(MIN_HEARTBEAT_MS, Math.round(next.heartbeatMs));
  }
  if (typeof next.versionCheckMs === "number" && next.versionCheckMs > 0) {
    versionCheckMs = Math.max(MIN_VERSION_CHECK_MS, Math.round(next.versionCheckMs));
  }
}

ctx.onmessage = (event: MessageEvent<LiveSyncCommand>) => {
  const data = event.data;
  if (!data) return;
  switch (data.type) {
    case "start":
      applyConfig(data);
      running = true;
      schedule();
      break;
    case "configure":
      applyConfig(data);
      // Reschedule only while running so a paused worker stays asleep.
      if (running) schedule();
      break;
    case "pause":
      running = false;
      clearTimers();
      break;
    case "resume":
      if (!running) {
        running = true;
        schedule();
      }
      break;
    case "stop":
      running = false;
      clearTimers();
      break;
  }
};
