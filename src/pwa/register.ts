// src/pwa/register.ts
//
// PWA Worker Architecture:
// The PWA operates background sync via a Dedicated Web Worker (src/workers/live-sync.worker.ts)
// instead of a Service Worker fetch interceptor. This avoids stale cached HTML shells,
// prevents deployment synchronization lag, and eliminates background interval throttling.
//
// Service workers (other than Web Push) are actively decommissioned and uninstalled.

import { pwaWorkerManager } from "./pwa-worker-manager";

export { pwaWorkerManager };

const RELOAD_FLAG = "rentmaikar_stale_sw_reloaded";

const isPushWorker = (scriptURL: string) =>
  scriptURL.includes("push-sw.js") || scriptURL.includes("firebase-messaging");

const isKeepCache = (name: string) => {
  const lower = name.toLowerCase();
  return lower.includes("firebase") || lower.includes("push");
};

async function purgeCaches(): Promise<string[]> {
  if (!("caches" in window)) return [];
  try {
    const names = await caches.keys();
    const removable = names.filter((name) => !isKeepCache(name));
    await Promise.allSettled(removable.map((name) => caches.delete(name)));
    return removable;
  } catch {
    return [];
  }
}

function reloadOnce() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage unavailable — skip the reload rather than loop.
    return;
  }
  window.location.reload();
}

/**
 * Bootstraps the PWA Worker architecture:
 * 1. Unregisters any obsolete service worker cache layers.
 * 2. Purges stale cache buckets.
 * 3. Confirms Dedicated Web Worker readiness for background live-sync.
 */
export async function registerPWA(): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. Ensure any legacy/stale Service Worker caching layer is completely dismantled
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();

      const obsolete = registrations.filter((registration) => {
        const script =
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          "";
        return script !== "" && !isPushWorker(script);
      });

      const controlledByObsolete =
        !!navigator.serviceWorker.controller &&
        !isPushWorker(navigator.serviceWorker.controller.scriptURL);

      await Promise.allSettled(obsolete.map((r) => r.unregister()));

      const purged = await purgeCaches();

      if (obsolete.length || purged.length) {
        console.info(
          `[PWA] Decommissioned ${obsolete.length} legacy service worker(s), purged ${purged.length} cache bucket(s).`,
        );
      }

      if (controlledByObsolete) {
        console.info("[PWA] Stale service worker was controlling this page — reloading once.");
        reloadOnce();
        return;
      }
    } catch (err) {
      console.error("[PWA] Service worker decommission check failed:", err);
    }
  }

  // 2. Initialize the Dedicated Web Worker for PWA sync
  try {
    const state = pwaWorkerManager.getState();
    console.info(`[PWA] Active background engine: ${state.workerType}`);
  } catch (err) {
    console.warn("[PWA] Dedicated web worker initialization warning:", err);
  }
}

