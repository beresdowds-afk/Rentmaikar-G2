/**
 * Startup + pre-flight validation for the onboarding pipeline.
 *
 * Runs two families of checks:
 *  1. Configuration — required environment variables and URLs are present and
 *     point at the right environment (catches "works locally, breaks in prod").
 *  2. Device / browser capability — cookies, storage, pop-ups, camera, secure
 *     context, browser age. These are the top causes of Google OAuth and
 *     Persona failures, and we detect them BEFORE the user starts a flow.
 */
import { FAILURE_CATALOGUE, type FailureDefinition } from '@/lib/verification-failures';

export interface PreflightIssue extends FailureDefinition {
  /** 'block' prevents starting the flow, 'warn' is advisory. */
  severity: 'block' | 'warn';
  detail?: string;
}

export interface PreflightReport {
  ok: boolean;
  blocking: PreflightIssue[];
  warnings: PreflightIssue[];
  checkedAt: string;
}

function issue(code: string, severity: 'block' | 'warn', detail?: string): PreflightIssue {
  const def = FAILURE_CATALOGUE[code] ?? FAILURE_CATALOGUE.unknown_failure;
  return { ...def, severity, detail };
}

/* ------------------------------- config ------------------------------- */

export interface ConfigCheckResult {
  ok: boolean;
  missing: string[];
  suspicious: string[];
}

/** Validate the client-side configuration required for auth to work at all. */
export function checkAppConfig(): ConfigCheckResult {
  const env = import.meta.env as Record<string, string | undefined>;
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
  const missing = required.filter((k) => !env[k]);
  const suspicious: string[] = [];

  const url = env.VITE_SUPABASE_URL;
  if (url && !/^https:\/\//.test(url)) suspicious.push('VITE_SUPABASE_URL is not https');
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (protocol !== 'https:' && hostname !== 'localhost' && !hostname.startsWith('127.')) {
      suspicious.push('App is not served over HTTPS — OAuth and camera access will fail');
    }
  }
  return { ok: missing.length === 0, missing, suspicious };
}

/* --------------------------- browser capability --------------------------- */

function cookiesEnabled(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.cookieEnabled === false) return false;
    // Probe with a few attempts: inside an embedded/partitioned context the
    // first write can be dropped even though cookies work, which used to
    // produce a random "third-party cookies blocked" block on Google sign-in.
    for (let i = 0; i < 3; i++) {
      const name = `rm_probe${i}`;
      document.cookie = `${name}=1; SameSite=None; Secure; path=/`;
      if (!document.cookie.includes(`${name}=1`)) {
        document.cookie = `${name}=1; SameSite=Lax; path=/`;
      }
      const ok = document.cookie.includes(`${name}=1`);
      document.cookie = `${name}=; Max-Age=0; path=/`;
      if (ok) return true;
    }
    return false;
  } catch {
    return false;
  }
}


function storageAvailable(): boolean {
  try {
    const k = '__rm_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Rough browser-age check — Persona requires a modern engine. */
function browserTooOld(): boolean {
  if (typeof window === 'undefined') return false;
  const missingModernApis =
    typeof window.fetch !== 'function' ||
    typeof Promise === 'undefined' ||
    typeof (window as unknown as { AbortController?: unknown }).AbortController === 'undefined' ||
    typeof (window as unknown as { ResizeObserver?: unknown }).ResizeObserver === 'undefined';
  return missingModernApis;
}

function cameraApiAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

async function cameraPermissionState(): Promise<PermissionState | 'unsupported'> {
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) return 'unsupported';
    const res = await perms.query({ name: 'camera' as PermissionName });
    return res.state;
  } catch {
    return 'unsupported';
  }
}

/** Detect a clock more than 5 minutes off using the server Date header. */
export async function checkClockSkew(probeUrl?: string): Promise<number | null> {
  try {
    const url = probeUrl ?? `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const serverDate = res.headers.get('date');
    if (!serverDate) return null;
    return Math.abs(Date.parse(serverDate) - Date.now());
  } catch {
    return null;
  }
}

export interface PreflightOptions {
  /** Include camera / liveness checks (identity verification flows). */
  requireCamera?: boolean;
  /** Include pop-up + third-party cookie checks (OAuth flows). */
  requireOAuth?: boolean;
  /** Skip the network round-trip clock check. */
  skipClockCheck?: boolean;
}

/** Full pre-flight. Safe to call on any device; never throws. */
export async function runPreflight(opts: PreflightOptions = {}): Promise<PreflightReport> {
  const blocking: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];

  const cfg = checkAppConfig();
  if (!cfg.ok) blocking.push(issue('config_missing', 'block', `Missing: ${cfg.missing.join(', ')}`));
  for (const s of cfg.suspicious) warnings.push(issue('config_missing', 'warn', s));

  if (browserTooOld()) blocking.push(issue('outdated_browser', 'block'));
  const hasStorage = storageAvailable();
  if (!hasStorage) blocking.push(issue('storage_disabled', 'block'));
  if (!cookiesEnabled()) {
    // The Supabase session lives in localStorage, so a failed cookie probe is
    // only advisory when storage works — blocking here caused spurious
    // "third-party cookies blocked" errors on Google sign-in.
    const severity: 'block' | 'warn' = opts.requireOAuth && !hasStorage ? 'block' : 'warn';
    (severity === 'block' ? blocking : warnings).push(issue('third_party_cookies_blocked', severity));
  }


  if (opts.requireCamera) {
    if (!cameraApiAvailable()) {
      blocking.push(issue('camera_unavailable', 'block'));
    } else {
      const state = await cameraPermissionState();
      if (state === 'denied') blocking.push(issue('camera_permission_denied', 'block'));
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      blocking.push(issue('unsupported_browser', 'block', 'Camera requires a secure (HTTPS) context'));
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    blocking.push(issue('network_offline', 'block'));
  }

  if (!opts.skipClockCheck) {
    const skew = await checkClockSkew();
    if (skew !== null && skew > 5 * 60 * 1000) {
      warnings.push(issue('clock_skew', 'warn', `Device clock is ${Math.round(skew / 60000)} minutes off`));
    }
  }

  return { ok: blocking.length === 0, blocking, warnings, checkedAt: new Date().toISOString() };
}

/**
 * Detects whether a pop-up would be blocked. Must be called from a user
 * gesture handler; closes the probe window immediately.
 */
export function popupsAllowed(): boolean {
  try {
    const w = window.open('', '_blank', 'width=1,height=1');
    if (!w || w.closed) return false;
    w.close();
    return true;
  } catch {
    return false;
  }
}
