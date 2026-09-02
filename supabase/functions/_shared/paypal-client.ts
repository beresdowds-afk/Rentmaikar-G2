// Shared PayPal REST client for every PayPal edge function.
//
// Why this exists — before it, each function re-implemented the OAuth dance,
// read a *different* env var for the environment, had no timeout, no retry and
// no PayPal-Request-Id. That meant: an extra ~400ms token round-trip on every
// checkout, a live/sandbox mismatch risk on the webhook verifier, and a real
// double-charge window whenever a POST was retried after a network blip.
//
// Guarantees provided here:
//   * one environment resolution (PAYPAL_MODE, PAYPAL_ENV as legacy alias)
//   * per-isolate access-token cache honouring PayPal's expires_in (9h tokens)
//   * AbortController timeouts so a hung PayPal call can't pin an isolate
//   * bounded retry with jittered backoff on 429/5xx and network faults
//   * PayPal-Request-Id on every mutating call => PayPal-side idempotency

import {
  ensureProviderConfig,
  providerOverride,
  invalidateProviderConfig,
} from "./provider-config.ts";

export type PayPalMode = "live" | "sandbox";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  mode: PayPalMode;
  base: string;
}

const LIVE_BASE = "https://api-m.paypal.com";
const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

/**
 * Resolve the PayPal environment. `PAYPAL_MODE` is canonical; `PAYPAL_ENV` is
 * accepted as a legacy alias so an older deployment that only ever set that
 * one keeps pointing at the same host as the rest of the stack.
 */
/** Warm the admin-managed override cache (sandbox/live switch + credentials). */
export async function ensurePayPalConfig(): Promise<void> {
  await ensureProviderConfig("paypal");
}

export function invalidatePayPalConfig(): void {
  invalidateProviderConfig("paypal");
}

export function resolvePayPalMode(): PayPalMode {
  const raw = (providerOverride("paypal", "mode") ??
    Deno.env.get("PAYPAL_MODE") ?? Deno.env.get("PAYPAL_ENV") ?? "sandbox")
    .trim()
    .toLowerCase();
  return raw === "live" || raw === "production" ? "live" : "sandbox";
}

export function payPalBase(mode: PayPalMode = resolvePayPalMode()): string {
  return mode === "live" ? LIVE_BASE : SANDBOX_BASE;
}

/** Read credentials; returns null when PayPal is not configured. */
export function getPayPalConfig(): PayPalConfig | null {
  const clientId = providerOverride("paypal", "client_id") ?? Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = providerOverride("paypal", "client_secret") ?? Deno.env.get("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const mode = resolvePayPalMode();
  return { clientId, clientSecret, mode, base: payPalBase(mode) };
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = null,
    readonly debugId: string | null = null,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

// ---------------------------------------------------------------------------
// Access-token cache (per isolate). PayPal issues ~9h tokens; re-requesting one
// per call is pure latency. We refresh 5 minutes before expiry and de-duplicate
// concurrent refreshes so a burst of checkouts triggers a single token call.
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<string>>();
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

function cacheKey(cfg: PayPalConfig): string {
  // Key on mode + clientId so rotating credentials or flipping sandbox/live
  // never reuses a stale token.
  return `${cfg.mode}:${cfg.clientId}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retryable = transport failure, 429 rate limit, or 5xx from PayPal. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function getAccessToken(
  cfg: PayPalConfig,
  opts: { forceRefresh?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  const key = cacheKey(cfg);
  if (opts.forceRefresh) {
    tokenCache.delete(key);
    inflight.delete(key);
  }

  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const existing = inflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetchWithTimeout(`${cfg.base}/v1/oauth2/token`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${cfg.clientId}:${cfg.clientSecret}`),
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: "grant_type=client_credentials",
        }, timeoutMs);

        if (!res.ok) {
          const text = await res.text();
          if (isRetryableStatus(res.status) && attempt < 2) {
            lastError = new PayPalError(`token ${res.status}`, res.status, text);
            await sleep(250 * 2 ** attempt + Math.random() * 100);
            continue;
          }
          // 401/403 here means bad credentials — surface it clearly, no retry.
          throw new PayPalError(
            `PayPal auth failed (${res.status})`,
            res.status,
            text,
            res.headers.get("paypal-debug-id"),
          );
        }

        const json = await res.json();
        const token = json.access_token as string | undefined;
        if (!token) throw new PayPalError("PayPal returned no access_token", 502, json);
        const ttlMs = Number(json.expires_in ?? 32400) * 1000;
        tokenCache.set(key, {
          token,
          expiresAt: Date.now() + Math.max(ttlMs - EXPIRY_SKEW_MS, 30_000),
        });
        return token;
      } catch (e) {
        lastError = e;
        if (e instanceof PayPalError && !isRetryableStatus(e.status)) throw e;
        if (attempt === 2) break;
        await sleep(250 * 2 ** attempt + Math.random() * 100);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new PayPalError("PayPal token request failed", 502, lastError);
  })().finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

export interface PayPalRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /**
   * Stable value sent as `PayPal-Request-Id`. PayPal deduplicates mutating
   * calls carrying the same id for ~72h, so a retried create/capture/payout
   * returns the original resource instead of charging twice.
   */
  requestId?: string;
  /** Ask PayPal to echo the full resource rather than a minimal envelope. */
  representation?: boolean;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

/**
 * Authenticated PayPal REST call with token caching, timeout, bounded retry and
 * automatic single re-auth if a cached token was revoked server-side.
 */
export async function payPalRequest<T = unknown>(
  cfg: PayPalConfig,
  path: string,
  opts: PayPalRequestOptions = {},
): Promise<T> {
  const method = opts.method ?? "GET";
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxRetries = opts.retries ?? 2;
  const url = `${cfg.base}${path}`;

  let refreshed = false;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const token = await getAccessToken(cfg, { forceRefresh: refreshed && attempt === 0 });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(opts.headers ?? {}),
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
    if (opts.representation) headers["Prefer"] = "return=representation";

    try {
      const res = await fetchWithTimeout(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      }, timeoutMs);

      const text = await res.text();
      const parsed = text ? safeJson(text) : null;

      if (res.ok) return parsed as T;

      // A revoked/expired cached token: drop it and retry once with a fresh one.
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        await getAccessToken(cfg, { forceRefresh: true });
        continue;
      }

      if (isRetryableStatus(res.status) && attempt < maxRetries) {
        lastError = new PayPalError(`PayPal ${res.status}`, res.status, parsed);
        await sleep(300 * 2 ** attempt + Math.random() * 150);
        continue;
      }

      throw new PayPalError(
        describeError(parsed) ?? `PayPal request failed (${res.status})`,
        res.status,
        parsed,
        res.headers.get("paypal-debug-id"),
      );
    } catch (e) {
      if (e instanceof PayPalError) {
        if (!isRetryableStatus(e.status) || attempt >= maxRetries) throw e;
        lastError = e;
      } else {
        // Network error / abort — retryable.
        lastError = e;
        if (attempt >= maxRetries) break;
      }
      await sleep(300 * 2 ** attempt + Math.random() * 150);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new PayPalError("PayPal request failed", 502, lastError);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Turn a PayPal error envelope into a single readable sentence. */
export function describeError(body: unknown): string | null {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 300) : null;
  const b = body as Record<string, unknown>;
  const details = Array.isArray(b.details) ? b.details : [];
  const first = details[0] as Record<string, unknown> | undefined;
  const parts = [
    typeof b.message === "string" ? b.message : null,
    first && typeof first.description === "string" ? first.description : null,
    first && typeof first.issue === "string" ? `(${first.issue})` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** Verify a webhook signature using PayPal's verification endpoint. */
export async function verifyWebhookSignature(
  cfg: PayPalConfig,
  webhookId: string,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  if (!webhookId) return false;
  try {
    const result = await payPalRequest<{ verification_status?: string }>(
      cfg,
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        retries: 1,
        body: {
          auth_algo: headers.get("paypal-auth-algo"),
          cert_url: headers.get("paypal-cert-url"),
          transmission_id: headers.get("paypal-transmission-id"),
          transmission_sig: headers.get("paypal-transmission-sig"),
          transmission_time: headers.get("paypal-transmission-time"),
          webhook_id: webhookId,
          webhook_event: JSON.parse(rawBody),
        },
      },
    );
    return result?.verification_status === "SUCCESS";
  } catch (e) {
    console.error("[paypal] signature verification error:", e);
    return false;
  }
}
