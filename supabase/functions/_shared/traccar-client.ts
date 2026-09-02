// Traccar API client — reads TRACCAR_BASE_URL and either TRACCAR_API_TOKEN /
// TRACCAR_TOKEN (session bearer / API token) OR TRACCAR_EMAIL + TRACCAR_PASSWORD.
// When both are configured, the token is tried first and a 401 automatically
// falls back to the email/password combination (Basic → session cookie).
// Returns { ok: false, reason: "not_configured" } until secrets are set,
// so the rest of the app keeps working.
//
// Built against the official OpenAPI contract (Traccar 6.14.x):
// https://www.traccar.org/api-reference/  (spec: /api-reference/openapi.yaml)
//
// Contract details honoured here:
//  - Security schemes are BasicAuth and ApiKey (HTTP bearer). Both supported.
//  - `POST /session` is form-urlencoded (email/password) and returns a
//    JSESSIONID cookie — used as a fallback when a server rejects Basic auth.
//  - `GET /health` is unauthenticated and returns text/plain.
//  - `POST /commands/send` returns 200 (sent) or 202 (queued for offline device).
//  - `GET /positions` requires `from`+`to` whenever `deviceId` is used;
//    `id` may repeat (`id=1&id=2`) and needs no time range.
//  - `GET /devices` supports all/userId/id/uniqueId/keyword/limit/offset/
//    excludeAttributes.
//  - Reports return JSON only when `Accept: application/json` is sent.

import { ensureProviderConfig, providerConfigSource, providerOverride } from "./provider-config.ts";

type OkResult<T = unknown> = { ok: true; body: T; status: number; queued?: boolean };
type ErrResult =
  | { ok: false; reason: "not_configured"; missing?: string[] }
  | { ok: false; reason: "network_error"; message: string; attempts?: number }
  | {
    ok: false;
    reason: "provider_error";
    status: number;
    body: unknown;
    auth_mode?: string;
    attempts?: number;
    retry_after_seconds?: number | null;
  };
export type TraccarResult<T = unknown> = OkResult<T> | ErrResult;

/** The stored secret is TRACCAR_API_TOKEN; TRACCAR_TOKEN kept as a legacy alias. */
function envToken(): string {
  return Deno.env.get("TRACCAR_API_TOKEN") || Deno.env.get("TRACCAR_TOKEN") || "";
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function creds() {
  const base = (providerOverride("traccar", "base_url") || Deno.env.get("TRACCAR_BASE_URL") || "").replace(/\/+$/, "");
  const token = providerOverride("traccar", "token") || envToken();
  const email = providerOverride("traccar", "email") || Deno.env.get("TRACCAR_EMAIL") || "";
  const password = providerOverride("traccar", "password") || Deno.env.get("TRACCAR_PASSWORD") || "";
  if (!base) return null;
  if (!token && !(email && password)) return null;
  return { base, token, email, password };
}

/** Which credential pieces are absent — powers precise "not configured" errors. */
export function missingCredentials(): string[] {
  const base = providerOverride("traccar", "base_url") || Deno.env.get("TRACCAR_BASE_URL") || "";
  const token = providerOverride("traccar", "token") || envToken();
  const email = providerOverride("traccar", "email") || Deno.env.get("TRACCAR_EMAIL") || "";
  const password = providerOverride("traccar", "password") || Deno.env.get("TRACCAR_PASSWORD") || "";
  const missing: string[] = [];
  if (!base) missing.push("base_url");
  if (!token) {
    if (!email) missing.push("email");
    if (!password) missing.push("password");
  }
  return missing;
}

export function authMode(): "token" | "basic" | "none" {
  const c = creds();
  if (!c) return "none";
  return c.token && !isTokenRejected() ? "token" : "basic";
}

// ── Token → email/password fallback ────────────────────────────────────────
// When the configured API token is rejected (HTTP 401) but TRACCAR_EMAIL +
// TRACCAR_PASSWORD are also present, the client automatically falls back to
// the email/password combination (Basic header, then the session-cookie flow).
// The rejection is remembered for TOKEN_RETRY_AFTER_MS so every request does
// not pay a wasted 401 round-trip; after the cooldown the token is tried again
// so a rotated/fixed token is picked up without a redeploy.
const TOKEN_RETRY_AFTER_MS = 5 * 60_000;
let tokenRejectedAt = 0;

function isTokenRejected(): boolean {
  return tokenRejectedAt !== 0 && Date.now() - tokenRejectedAt < TOKEN_RETRY_AFTER_MS;
}

function markTokenRejected() {
  tokenRejectedAt = Date.now();
}

function authHeader(
  c: NonNullable<ReturnType<typeof creds>>,
  useToken: boolean,
): Record<string, string> {
  if (useToken && c.token) return { Authorization: `Bearer ${c.token}` };
  return { Authorization: "Basic " + btoa(`${c.email}:${c.password}`) };
}

// ── Session-cookie fallback ────────────────────────────────────────────────
// Some Traccar deployments disable Basic auth for the REST API. The spec's
// POST /session accepts form-urlencoded credentials and hands back a
// JSESSIONID cookie that authenticates subsequent calls.
let sessionCookie: string | null = null;
let sessionCookieBase: string | null = null;

function parseSetCookie(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const m = /JSESSIONID=([^;]+)/i.exec(raw);
  return m ? `JSESSIONID=${m[1]}` : null;
}

async function openSession(c: NonNullable<ReturnType<typeof creds>>): Promise<boolean> {
  if (!c.email || !c.password) return false;
  try {
    const res = await fetch(`${c.base}/api/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ email: c.email, password: c.password }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return false;
    }
    await res.text().catch(() => "");
    const cookie = parseSetCookie(res);
    if (!cookie) return false;
    sessionCookie = cookie;
    sessionCookieBase = c.base;
    return true;
  } catch {
    return false;
  }
}

/** Drop any cached session + token rejection (used when credentials are rotated). */
export function resetTraccarSession() {
  sessionCookie = null;
  sessionCookieBase = null;
  tokenRejectedAt = 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterSeconds(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n)) return n;
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, Math.round((when - Date.now()) / 1000)) : null;
}

interface CallOptions extends RequestInit {
  /** Parse the response as text instead of JSON (e.g. /health, /session/token). */
  text?: boolean;
  /** Skip credentials entirely — only /health is unauthenticated in the spec. */
  anonymous?: boolean;
  timeoutMs?: number;
}

async function call<T = unknown>(path: string, opts: CallOptions = {}): Promise<TraccarResult<T>> {
  const c = creds();
  if (!c) return { ok: false, reason: "not_configured", missing: missingCredentials() };
  const { text, anonymous, timeoutMs, ...init } = opts;

  if (sessionCookieBase && sessionCookieBase !== c.base) resetTraccarSession();

  let attempt = 0;
  let lastNetworkError = "";
  let retriedWithSession = false;
  let retriedWithBasic = false;
  // Effective auth for this call: token first, unless it was rejected recently
  // (or is absent) and the email/password combination exists as fallback.
  let useToken = !!c.token && !isTokenRejected();

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.body !== undefined && !(init.headers as Record<string, string> | undefined)?.["Content-Type"]
        ? { "Content-Type": "application/json" }
        : {}),
      ...(anonymous ? {} : sessionCookie ? { Cookie: sessionCookie } : authHeader(c, useToken)),
      ...(init.headers as Record<string, string> | undefined ?? {}),
    };

    let res: Response;
    try {
      res = await fetch(`${c.base}/api${path}`, {
        ...init,
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs ?? REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      lastNetworkError = (e as Error).message || String(e);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(300 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
        continue;
      }
      return { ok: false, reason: "network_error", message: lastNetworkError, attempts: attempt };
    }

    const raw = await res.text().catch(() => "");

    // Token rejected → fall back to the email/password combination once,
    // remembering the rejection so later calls skip the dead token.
    // 401 = token refused; 400 = Traccar's TokenManager fails to even decode
    // a malformed token (NegativeArraySizeException) before auth runs.
    // A genuine bad-request 400 simply fails again after the auth switch.
    if ((res.status === 401 || res.status === 400) && !anonymous && useToken && c.email && c.password && !retriedWithBasic) {
      retriedWithBasic = true;
      sessionCookie = null;
      sessionCookieBase = null;
      markTokenRejected();
      useToken = false;
      attempt--; // the auth fallback shouldn't burn a retry budget
      continue;
    }
    // 401 with basic credentials → try the documented session-cookie flow once.
    if (res.status === 401 && !anonymous && !useToken && !sessionCookie && !retriedWithSession) {
      retriedWithSession = true;
      sessionCookie = null;
      sessionCookieBase = null;
      if (await openSession(c)) {
        attempt--; // the session handshake shouldn't burn a retry budget
        continue;
      }
    }
    // A stale cookie also surfaces as 401 — fall back to header auth (the
    // token-rejection memory is kept so we don't re-try a dead token).
    if (res.status === 401 && sessionCookie && !retriedWithSession) {
      retriedWithSession = true;
      sessionCookie = null;
      sessionCookieBase = null;
      continue;
    }

    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
      const ra = retryAfterSeconds(res);
      await sleep(ra != null ? Math.min(ra, 10) * 1000 : 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
      continue;
    }

    let body: unknown = text ? raw : {};
    if (!text) {
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = raw.slice(0, 400); }
    }

    if (!res.ok) {
      return {
        ok: false,
        reason: "provider_error",
        status: res.status,
        body,
        auth_mode: useToken ? "token" : sessionCookie ? "session" : "basic",
        attempts: attempt,
        retry_after_seconds: retryAfterSeconds(res),
      };
    }
    // A token that works again clears any remembered rejection.
    if (useToken && tokenRejectedAt !== 0) tokenRejectedAt = 0;
    return { ok: true, body: body as T, status: res.status, queued: res.status === 202 };
  }

  return { ok: false, reason: "network_error", message: lastNetworkError || "exhausted retries", attempts: attempt };
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item !== undefined && item !== null) sp.append(k, String(item));
    } else {
      sp.append(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string | null;
  positionId: number | null;
  groupId?: number | null;
  model?: string | null;
  category?: string | null;
  contact?: string | null;
  phone?: string | null;
  disabled?: boolean;
  expirationTime?: string | null;
  attributes?: Record<string, unknown>;
}

export interface TraccarPosition {
  id: number;
  deviceId: number;
  protocol: string;
  serverTime: string;
  deviceTime: string;
  fixTime: string;
  outdated?: boolean;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number; // knots
  course: number;
  accuracy?: number;
  address: string | null;
  attributes: Record<string, unknown>;
}

export interface TraccarCommandType {
  type: string;
}

export interface TraccarEvent {
  id: number;
  type: string;
  eventTime: string;
  deviceId: number;
  positionId?: number | null;
  geofenceId?: number | null;
  maintenanceId?: number | null;
  attributes?: Record<string, unknown>;
}

export interface DeviceQuery {
  all?: boolean;
  userId?: number;
  id?: number[];
  uniqueId?: string[];
  keyword?: string;
  excludeAttributes?: boolean;
  limit?: number;
  offset?: number;
}

/** Positions endpoint requires from+to whenever deviceId is used. */
function assertRange(fromISO?: string, toISO?: string) {
  if (!fromISO || !toISO) throw new Error("Traccar requires both `from` and `to` for this query");
}

export const traccar = {
  /** Warm admin-managed credentials before any sync getter is used. */
  ensureReady: async () => { await ensureProviderConfig("traccar"); resetTraccarSession(); },
  configSource: () => providerConfigSource("traccar"),
  isConfigured: () => !!creds(),
  baseUrl: () => creds()?.base ?? null,
  authMode,
  resetSession: resetTraccarSession,

  /** Unauthenticated reachability probe (text/plain "OK"). */
  health: () => call<string>("/health", { text: true, anonymous: true, timeoutMs: 8_000 }),
  /** Authenticated server metadata — doubles as a credential check. */
  ping: () => call<{ id: number; name: string; version?: string }>("/server"),
  /** Current session user; confirms the account behind the credentials. */
  sessionUser: () => call<{ id: number; name: string; email: string; administrator?: boolean }>("/session"),

  listDevices: (q: DeviceQuery = {}) => call<TraccarDevice[]>(`/devices${qs(q as Record<string, unknown>)}`),
  /** Admin/manager fleet-wide listing, paged to keep responses bounded. */
  listAllDevices: async (pageSize = 500, maxPages = 20): Promise<TraccarResult<TraccarDevice[]>> => {
    const out: TraccarDevice[] = [];
    for (let page = 0; page < maxPages; page++) {
      const r = await call<TraccarDevice[]>(
        `/devices${qs({ all: true, limit: pageSize, offset: page * pageSize })}`,
      );
      if (!r.ok) {
        // Older servers (<6.x) ignore/reject all+paging — fall back to a plain list.
        if (page === 0 && r.reason === "provider_error" && (r.status === 400 || r.status === 403)) {
          return call<TraccarDevice[]>("/devices");
        }
        return r;
      }
      const batch = Array.isArray(r.body) ? r.body : [];
      out.push(...batch);
      if (batch.length < pageSize) break;
    }
    // De-duplicate in case the server ignores limit/offset and repeats the list.
    const seen = new Set<number>();
    const unique = out.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
    return { ok: true, body: unique, status: 200 };
  },
  getDevice: (id: number) => call<TraccarDevice>(`/devices/${id}`),
  devicesByUniqueId: (uniqueIds: string[]) => call<TraccarDevice[]>(`/devices${qs({ uniqueId: uniqueIds })}`),
  updateAccumulators: (id: number, body: { totalDistance?: number; hours?: number }) =>
    call(`/devices/${id}/accumulators`, { method: "PUT", body: JSON.stringify({ deviceId: id, ...body }) }),

  latestPositions: () => call<TraccarPosition[]>("/positions"),
  positionsByIds: (ids: number[]) => call<TraccarPosition[]>(`/positions${qs({ id: ids })}`),
  positionsFor: (deviceId: number, fromISO: string, toISO: string) => {
    assertRange(fromISO, toISO);
    return call<TraccarPosition[]>(`/positions${qs({ deviceId, from: fromISO, to: toISO })}`);
  },

  /** Command types the device's protocol currently supports. */
  commandTypes: (deviceId?: number, textChannel = false) =>
    call<TraccarCommandType[]>(`/commands/types${qs({ deviceId, textChannel: textChannel || undefined })}`),
  /** Saved commands linked to the device and its groups. */
  savedCommandsFor: (deviceId: number) => call<unknown[]>(`/commands/send${qs({ deviceId })}`),
  sendCommand: (deviceId: number, type: string, attributes: Record<string, unknown> = {}) =>
    call<{ id?: number; deviceId?: number; type?: string }>(`/commands/send`, {
      method: "POST",
      body: JSON.stringify({ deviceId, type, attributes }),
    }),

  events: (deviceIds: number[], fromISO: string, toISO: string, types?: string[]) => {
    assertRange(fromISO, toISO);
    return call<TraccarEvent[]>(
      `/reports/events${qs({ deviceId: deviceIds, from: fromISO, to: toISO, type: types })}`,
    );
  },
  getEvent: (id: number) => call<TraccarEvent>(`/events/${id}`),
  routeReport: (deviceIds: number[], fromISO: string, toISO: string) => {
    assertRange(fromISO, toISO);
    return call<TraccarPosition[]>(`/reports/route${qs({ deviceId: deviceIds, from: fromISO, to: toISO })}`);
  },
  tripsReport: (deviceIds: number[], fromISO: string, toISO: string) => {
    assertRange(fromISO, toISO);
    return call<unknown[]>(`/reports/trips${qs({ deviceId: deviceIds, from: fromISO, to: toISO })}`);
  },
  stopsReport: (deviceIds: number[], fromISO: string, toISO: string) => {
    assertRange(fromISO, toISO);
    return call<unknown[]>(`/reports/stops${qs({ deviceId: deviceIds, from: fromISO, to: toISO })}`);
  },
  summaryReport: (deviceIds: number[], fromISO: string, toISO: string, daily = false) => {
    assertRange(fromISO, toISO);
    return call<unknown[]>(
      `/reports/summary${qs({ deviceId: deviceIds, from: fromISO, to: toISO, daily: daily || undefined })}`,
    );
  },
  statistics: (fromISO: string, toISO: string) => {
    assertRange(fromISO, toISO);
    return call<unknown[]>(`/statistics${qs({ from: fromISO, to: toISO })}`);
  },
};
