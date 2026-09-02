/** Detects crashes caused by a stale HTML shell referencing deleted chunks. */
export function isStaleBundleError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|Failed to fetch dynamically/i.test(
    msg,
  );
}

/** Evict service workers + caches, then reload with a cache-busting param. */
export async function hardReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString(36));
  window.location.replace(url.toString());
}
