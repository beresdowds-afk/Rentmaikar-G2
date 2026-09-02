/**
 * Detects when a newer build of the site has been deployed.
 *
 * Installed PWAs and long-lived tabs keep running old JavaScript until the
 * document is reloaded, so a shipped feature can be invisible for days. The
 * app's entry script is content-hashed at build time, so comparing the hash in
 * a freshly fetched `index.html` against the one this session booted with is a
 * reliable "new features available" signal — with no service worker involved.
 */

const SCRIPT_RE = /<script[^>]+src=["']([^"']+\.js)["']/gi;

function extractBuildId(html: string): string | null {
  const sources: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_RE.exec(html)) !== null) sources.push(m[1]);
  SCRIPT_RE.lastIndex = 0;
  if (!sources.length) return null;
  return sources.sort().join("|");
}

let bootBuildId: string | null = null;

/** Fetches the current deployed build id (entry script fingerprint). */
export async function fetchBuildId(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?ts=${Date.now()}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    return extractBuildId(await res.text());
  } catch {
    return null;
  }
}

/**
 * Returns true when the deployed build differs from the one that is running.
 * Always false in development, where scripts are not content-hashed.
 */
export async function isNewBuildAvailable(signal?: AbortSignal): Promise<boolean> {
  if (!import.meta.env.PROD) return false;
  const current = await fetchBuildId(signal);
  if (!current) return false;
  if (bootBuildId === null) {
    bootBuildId = current;
    return false;
  }
  return current !== bootBuildId;
}

/** Records the build that is currently running (called once on boot). */
export async function primeBuildId(): Promise<void> {
  if (!import.meta.env.PROD || bootBuildId !== null) return;
  bootBuildId = await fetchBuildId();
}
