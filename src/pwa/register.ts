// src/pwa/register.ts
//
// Cache decommissioning.
//
// Older deployments shipped a Workbox/vite-plugin-pwa app-shell service worker
// that precached index.html. Those workers keep serving a stale landing page
// long after a new deploy — including inside the Lovable preview, where the
// origin can still be controlled by a worker registered by an earlier build.
//
// This module therefore runs in EVERY environment (dev, preview, production):
//   1. Unregister any service worker that is not the push worker.
//   2. Delete every non-push/non-firebase cache bucket.
//   3. Reload exactly once per browsing session if the page was being
//      controlled by one of those obsolete workers (so the user immediately
//      gets the fresh HTML instead of the cached shell).

const CLEANUP_SW = "/sw.js";
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

export async function registerPWA(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

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
        `[PWA] Decommissioned ${obsolete.length} worker(s), purged ${purged.length} cache bucket(s).`,
      );
    }

    if (controlledByObsolete) {
      console.info("[PWA] Stale worker was controlling this page — reloading once.");
      reloadOnce();
      return;
    }

    // Production only: register the self-terminating cleanup worker so returning
    // visitors whose browsers still hold an old worker get scrubbed as well.
    if (import.meta.env.PROD) {
      await navigator.serviceWorker.register(CLEANUP_SW, { updateViaCache: "none" });

      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "CACHE_CLEANUP_COMPLETE") {
          console.info("[PWA] Cache cleanup complete.");
        } else if (event.data?.type === "CACHE_CLEANUP_FAILED") {
          console.error("[PWA] Cache cleanup failed.", event.data.error);
        }
      });
    }
  } catch (err) {
    console.error("[PWA] Cache decommission failed.", err);
  }
}
