/**
 * Unified OPay client.
 *
 * Follows the OPay API basics (https://documentation.opayweb.com):
 *  - one HOST resolution (sandbox vs live) shared by every function
 *  - HMAC-SHA512 request signature over the exact JSON body that is sent
 *  - documented response codes: `00000` success, `00005` duplicate order,
 *    `10000` / `11004` / `11005` transient system errors (safe to retry),
 *    `A_1001` expired request, `00004` bad parameters
 *  - documented transaction statuses: SUCCESS / FAIL / CLOSE / CANCEL / PENDING
 *  - request timeouts + jittered retries so a slow OPay never hangs an isolate
 *
 * Retries always resend the SAME `reference`, so OPay de-duplicates server side
 * (`00005`) instead of creating a second order.
 */

import {
  ensureProviderConfig,
  providerOverride,
  invalidateProviderConfig,
} from "./provider-config.ts";

export type OpayEnv = "sandbox" | "live";

export interface OpayConfig {
  merchantId: string;
  publicKey: string;
  secretKey: string;
  env: OpayEnv;
  baseUrl: string;
}

/** Statuses OPay can report for a transaction. */
export type OpayStatus = "SUCCESS" | "FAIL" | "CLOSE" | "CANCEL" | "PENDING" | "INITIAL";

/** Internal payment status used across the platform. */
export type PaymentStatus = "completed" | "failed" | "pending" | "refunded";

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/** Response codes that are transient per the OPay docs. */
export const RETRYABLE_CODES = new Set(["10000", "11004", "11005"]);

const CODE_MESSAGES: Record<string, string> = {
  "00000": "Successful",
  "00004": "Invalid request parameters",
  "00005": "Duplicate order reference",
  "10000": "OPay is busy, please try again",
  "11004": "OPay system error, please try again later",
  "11005": "OPay returned no data, please try again later",
  A_1001: "Request expired — check the server clock",
};

/**
 * Warm the admin-managed override cache. Call this once per request before any
 * of the sync getters below so an admin-saved credential / mode takes effect
 * without a redeploy.
 */
export async function ensureOpayConfig(): Promise<void> {
  await ensureProviderConfig("opay");
}

export function invalidateOpayConfig(): void {
  invalidateProviderConfig("opay");
}

export function resolveOpayEnv(): OpayEnv {
  const raw = (providerOverride("opay", "environment") ??
    Deno.env.get("OPAY_ENVIRONMENT") ?? Deno.env.get("OPAY_ENV") ?? "sandbox")
    .trim()
    .toLowerCase();
  return raw === "live" || raw === "production" || raw === "prod" ? "live" : "sandbox";
}

export function opayBaseUrl(env: OpayEnv = resolveOpayEnv()): string {
  return env === "live"
    ? "https://liveapi.opaycheckout.com"
    : "https://sandboxapi.opaycheckout.com";
}

/** Returns the config, or null when any required secret is missing. */
export function getOpayConfig(): OpayConfig | null {
  const merchantId = providerOverride("opay", "merchant_id") ?? Deno.env.get("OPAY_MERCHANT_ID");
  const publicKey = providerOverride("opay", "public_key") ?? Deno.env.get("OPAY_PUBLIC_KEY");
  const secretKey = providerOverride("opay", "secret_key") ?? Deno.env.get("OPAY_SECRET_KEY");
  if (!merchantId || !publicKey || !secretKey) return null;
  const env = resolveOpayEnv();
  return { merchantId, publicKey, secretKey, env, baseUrl: opayBaseUrl(env) };
}

export function isOpayConfigured(): boolean {
  return getOpayConfig() !== null;
}

/** Where the resolved Opay credentials came from — shown in the admin panel. */
export function opayConfigSource(): "admin" | "env" | "none" {
  if (providerOverride("opay", "merchant_id") || providerOverride("opay", "secret_key")) return "admin";
  return Deno.env.get("OPAY_MERCHANT_ID") ? "env" : "none";
}

/** HMAC-SHA512 hex signature of a raw body string, per OPay cashier auth. */
export async function opaySignature(body: string, secretKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time hex compare (webhook signature verification). */
export function timingSafeHexEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify an inbound OPay webhook. OPay has shipped the digest under a few
 * header names over time; accept the documented ones and nothing else.
 */
export async function verifyOpayWebhook(
  rawBody: string,
  headers: Headers,
  secretKey: string,
): Promise<boolean> {
  const candidate =
    headers.get("Signature") ??
    headers.get("signature") ??
    headers.get("X-Opay-Signature") ??
    headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!candidate) return false;
  const expected = await opaySignature(rawBody, secretKey);
  return timingSafeHexEqual(candidate.trim().toLowerCase(), expected);
}

export interface OpayResult<T = Record<string, unknown>> {
  ok: boolean;
  code: string;
  message: string;
  data: T | null;
  httpStatus: number;
  /** true when the failure is transient and the caller may retry later. */
  retryable: boolean;
  raw: unknown;
}

function friendly(code: string, message?: string): string {
  return message && message !== "SUCCESSFUL" ? message : CODE_MESSAGES[code] ?? `OPay error ${code}`;
}

/**
 * POST a signed JSON payload to an OPay cashier endpoint.
 * Retries network errors, 5xx and documented transient codes with jittered backoff.
 */
export async function opayRequest<T = Record<string, unknown>>(
  path: string,
  payload: Record<string, unknown>,
  cfg: OpayConfig,
): Promise<OpayResult<T>> {
  const body = JSON.stringify(payload);
  const signature = await opaySignature(body, cfg.secretKey);
  const url = `${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let last: OpayResult<T> = {
    ok: false, code: "network_error", message: "OPay unreachable",
    data: null, httpStatus: 0, retryable: true, raw: null,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.publicKey}`,
          MerchantId: cfg.merchantId,
          Signature: signature,
          Timestamp: String(Date.now()),
        },
        body,
        signal: ctl.signal,
      });
      const text = await resp.text();
      let parsed: Record<string, unknown> = {};
      try { parsed = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
      const code = String(parsed?.code ?? (resp.ok ? "00000" : `http_${resp.status}`));
      const message = friendly(code, parsed?.message as string | undefined);
      const retryable = RETRYABLE_CODES.has(code) || resp.status >= 500 || resp.status === 429;

      last = {
        ok: resp.ok && code === "00000",
        code,
        message,
        data: (parsed?.data ?? null) as T | null,
        httpStatus: resp.status,
        retryable,
        raw: parsed,
      };
      if (last.ok || !retryable) return last;
    } catch (err) {
      last = {
        ok: false,
        code: (err as Error)?.name === "AbortError" ? "timeout" : "network_error",
        message: (err as Error)?.name === "AbortError" ? "OPay request timed out" : "OPay unreachable",
        data: null, httpStatus: 0, retryable: true, raw: String(err),
      };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1) + Math.random() * 200));
    }
  }
  return last;
}

export interface CashierOrderData {
  reference?: string;
  orderNo?: string;
  cashierUrl?: string;
  status?: string;
  [k: string]: unknown;
}

export function createCashierOrder(payload: Record<string, unknown>, cfg: OpayConfig) {
  return opayRequest<CashierOrderData>("/api/v1/international/cashier/create", payload, cfg);
}

export function queryCashierStatus(reference: string, cfg: OpayConfig) {
  return opayRequest<CashierOrderData>(
    "/api/v1/international/cashier/status",
    { reference, country: "NG" },
    cfg,
  );
}

/** Map an OPay transaction status to the platform payment status. */
export function mapOpayStatus(raw: string | null | undefined): PaymentStatus {
  const s = String(raw ?? "").trim().toUpperCase();
  switch (s) {
    case "SUCCESS":
    case "SUCCESSFUL":
      return "completed";
    case "FAIL":
    case "FAILED":
    case "CLOSE":
    case "CLOSED":
    case "CANCEL":
    case "CANCELLED":
    case "CANCELED":
      return "failed";
    case "REFUND":
    case "REFUNDED":
      return "refunded";
    default:
      return "pending";
  }
}

/** Human-readable failure reason for a non-success OPay status. */
export function opayFailureReason(rawStatus: string | null | undefined, detail?: string | null) {
  const s = String(rawStatus ?? "").toUpperCase();
  if (detail) return detail;
  if (s === "CLOSE" || s === "CLOSED") return "Payment window expired";
  if (s.startsWith("CANCEL")) return "Payment cancelled by the customer";
  if (s === "FAIL" || s === "FAILED") return "Payment failed at OPay";
  return s || "Unknown OPay failure";
}

/** Minor units (kobo) — OPay amounts are always integers in the base unit. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}
