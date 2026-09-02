/*
 * RentMaikar Cleanup Service Worker
 *
 * Purpose:
 * - Remove obsolete Workbox/Vite caches.
 * - Leave Firebase Messaging alone.
 * - Notify clients when cleanup finishes.
 * - Unregister itself.
 */

const CLEANUP_VERSION = "2026.07.30";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanup());
});

async function cleanup() {

  try {

    await self.clients.claim();

    if (
      self.registration.navigationPreload &&
      self.registration.navigationPreload.enable
    ) {
      try {
        await self.registration.navigationPreload.enable();
      } catch (_) {}
    }

    const cacheNames = await caches.keys();

    const removableCaches = cacheNames.filter((name) => {

      const lower = name.toLowerCase();

      if (lower.includes("firebase")) return false;

      if (lower.includes("push")) return false;

      return (
        lower.includes("workbox") ||
        lower.includes("precache") ||
        lower.includes("runtime") ||
        lower.includes("vite") ||
        lower.includes("image") ||
        lower.includes("images") ||
        lower.includes("font") ||
        lower.includes("fonts") ||
        lower.includes("asset")
      );

    });

    await Promise.allSettled(
      removableCaches.map((cache) => caches.delete(cache))
    );

    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: "window",
    });

    for (const client of clients) {

      client.postMessage({
        type: "CACHE_CLEANUP_COMPLETE",
        version: CLEANUP_VERSION,
        deletedCaches: removableCaches,
      });

    }

  } catch (error) {

    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: "window",
    });

    for (const client of clients) {

      client.postMessage({
        type: "CACHE_CLEANUP_FAILED",
        error: String(error),
      });

    }

  } finally {

    await self.registration.unregister();

  }

}
