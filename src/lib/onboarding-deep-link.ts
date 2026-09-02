// Deep-link helpers that work for both web (react-router) and native
// Capacitor shells (iOS/Android). Native deep links arrive via the Capacitor
// `App.appUrlOpen` event; we also honor `App.getLaunchUrl()` so cold starts
// (app terminated then re-launched via a deep link) still resume the exact
// onboarding screen the user tapped.

export const ONBOARDING_DEEP_LINK_SCHEME = 'rentmaikar://onboarding';
const LAST_PATH_KEY = 'rentmaikar:last_deeplink_path';
const LAST_PATH_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function inCapacitor(): boolean {
  return (
    typeof window !== 'undefined' &&
    // @ts-expect-error – Capacitor injects a global at runtime.
    !!(window.Capacitor?.isNativePlatform?.() ?? false)
  );
}

/** Convert a deep-link URL (e.g. `rentmaikar://onboarding?step=documents`)
 *  into an in-app pathname a react-router listener can handle. */
export function deepLinkToPath(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host || u.pathname.replace(/^\/+/, '').split('/')[0];
    if (host === 'onboarding') {
      const search = u.search || '';
      return `/onboarding-redirect${search}`;
    }
    return u.pathname + u.search;
  } catch {
    return '/';
  }
}

function persistDeepLinkPath(path: string) {
  try {
    localStorage.setItem(LAST_PATH_KEY, JSON.stringify({ path, ts: Date.now() }));
  } catch {
    /* ignore quota */
  }
}

/** Read a still-fresh deep-link path stored from a prior launch. Returns
 *  null when nothing stored, expired, or storage unavailable. */
export function consumeStoredDeepLinkPath(): string | null {
  try {
    const raw = localStorage.getItem(LAST_PATH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string; ts?: number };
    localStorage.removeItem(LAST_PATH_KEY);
    if (!parsed?.path || !parsed?.ts) return null;
    if (Date.now() - parsed.ts > LAST_PATH_TTL_MS) return null;
    return parsed.path;
  } catch {
    return null;
  }
}

async function loadCapacitorApp(): Promise<{ addListener?: Function; getLaunchUrl?: Function } | null> {
  try {
    const modName = '@capacitor/app';
    // Hide the specifier from Vite's static analyzer — the peer only resolves
    // inside the native (Capacitor) runtime.
    const mod = await (Function('m', 'return import(m)') as (m: string) => Promise<unknown>)(modName);
    return (mod as { App?: { addListener?: Function; getLaunchUrl?: Function } }).App ?? null;
  } catch {
    return null;
  }
}

/** Register a global capacitor `appUrlOpen` listener that routes native
 *  deep links to the correct react-router path. Also inspects the launch
 *  URL for cold starts so an app that was terminated still resumes the
 *  onboarding screen the deep link targeted. Returns a cleanup fn. */
export async function installOnboardingDeepLinkListener(
  navigate: (path: string) => void,
): Promise<() => void> {
  // On web, still hydrate a previously-stored path from a prior visit so
  // "Resume" works after browser restart / PWA relaunch.
  if (!inCapacitor()) {
    const stored = consumeStoredDeepLinkPath();
    if (stored && stored.startsWith('/')) {
      // Defer so the router is mounted before navigation.
      queueMicrotask(() => navigate(stored));
    }
    return () => {};
  }

  const App = await loadCapacitorApp();
  if (!App?.addListener) return () => {};

  // 1) Cold-start deep link (app was terminated, launched via URL).
  try {
    if (typeof App.getLaunchUrl === 'function') {
      const launch = (await App.getLaunchUrl()) as { url?: string } | undefined;
      if (launch?.url) {
        const path = deepLinkToPath(launch.url);
        persistDeepLinkPath(path);
        queueMicrotask(() => navigate(path));
      } else {
        // No launch URL — hydrate any path we stored from a prior session.
        const stored = consumeStoredDeepLinkPath();
        if (stored) queueMicrotask(() => navigate(stored));
      }
    }
  } catch {
    /* ignore */
  }

  // 2) Warm deep links while the app is running.
  const handle = await App.addListener('appUrlOpen', (evt: { url: string }) => {
    const path = deepLinkToPath(evt.url);
    persistDeepLinkPath(path);
    navigate(path);
  });
  return () => handle?.remove?.();
}

/** Build a shareable deep link that opens the onboarding step in the mobile
 *  app if installed, otherwise the same path on the web. */
export function buildOnboardingDeepLink(
  role: 'driver' | 'owner' | null,
  step: 'documents' | 'verification' | 'email' | 'root',
): { web: string; native: string } {
  const base = role === 'owner' ? '/owner/onboarding' : '/driver/onboarding';
  const web = step === 'email'
    ? '/verify-email'
    : step === 'root'
      ? base
      : `${base}?step=${step}`;
  const native = step === 'email'
    ? `${ONBOARDING_DEEP_LINK_SCHEME}?step=email`
    : `${ONBOARDING_DEEP_LINK_SCHEME}?step=${step}&role=${role ?? 'driver'}`;
  return { web, native };
}

/** Record the current onboarding path so a cold app restart can resume it. */
export function rememberOnboardingPath(path: string) {
  if (!path?.startsWith('/')) return;
  persistDeepLinkPath(path);
}
