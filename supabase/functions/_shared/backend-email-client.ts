/**
 * Shared Backend Email Delegation & Standard Webhooks Verification Client
 *
 * All outbound email from Supabase Edge Functions MUST route through the
 * authoritative `rentmaikar-backend` gateway (`/api/functions/*`), which owns
 * Resend API credentials, sender policy, outbox idempotency, suppression checks,
 * and audit logging.
 */

export function resolveBackendBaseUrl(): string {
  const configured =
    Deno.env.get("RENTMAIKAR_BACKEND_URL") ||
    Deno.env.get("PUBLIC_BACKEND_URL") ||
    "https://staging.rentmaikar.com";
  return configured.trim().replace(/\/+$/, "");
}

export function resolveInternalBridgeSecret(): string {
  return (
    Deno.env.get("RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET") ||
    Deno.env.get("RENTMAIKAR_INTERNAL_SERVICE_SECRET") ||
    ""
  ).trim();
}

export interface BackendDelegationResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  rawText: string;
}

export async function delegateToBackendEmail(
  functionName: string,
  payload: unknown,
  options?: {
    method?: string;
    authorization?: string | null;
    idempotencyKey?: string | null;
    correlationId?: string | null;
    allowUnauthenticatedPublic?: boolean;
    timeoutMs?: number;
  },
): Promise<BackendDelegationResult> {
  const internalSecret = resolveInternalBridgeSecret();
  const authHeader = options?.authorization?.trim() || "";

  if (!internalSecret && !authHeader && !options?.allowUnauthenticatedPublic) {
    return {
      ok: false,
      status: 500,
      data: {
        ok: false,
        error: "RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET is not configured",
      },
      rawText: '{"ok":false,"error":"RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET is not configured"}',
    };
  }

  const method = (options?.method || "POST").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (internalSecret) {
    headers["x-rentmaikar-internal-secret"] = internalSecret;
  }
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }
  if (options?.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  if (options?.correlationId) {
    headers["X-Correlation-ID"] = options.correlationId;
  }

  const targetUrl = `${resolveBackendBaseUrl()}/api/functions/${functionName}`;

  try {
    const res = await fetch(targetUrl, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? JSON.stringify(payload ?? {}) : undefined,
      signal: AbortSignal.timeout(options?.timeoutMs ?? 15000),
    });

    const rawText = await res.text().catch(() => "");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      parsed = { raw: rawText };
    }

    const ok = res.ok && parsed.ok !== false && parsed.success !== false;
    return {
      ok,
      status: res.status,
      data: parsed,
      rawText,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 502,
      data: { ok: false, error: message },
      rawText: JSON.stringify({ ok: false, error: message }),
    };
  }
}

function decodeStandardWebhookSecret(secret: string): Uint8Array {
  const trimmed = secret.trim();
  const stripped = trimmed.startsWith("v1,whsec_")
    ? trimmed.slice("v1,whsec_".length)
    : trimmed.startsWith("whsec_")
      ? trimmed.slice("whsec_".length)
      : null;

  if (stripped !== null) {
    const normalized = stripped.replaceAll("-", "+").replaceAll("_", "/");
    const bin = atob(normalized);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  return new TextEncoder().encode(trimmed);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyStandardWebhookSignatureDeno(
  headers: Headers,
  rawBody: string,
  candidateSecrets: Array<string | undefined | null>,
  label = "Webhook",
): Promise<{ ok: boolean; reason?: string }> {
  const secrets = candidateSecrets
    .map((s) => (s || "").trim())
    .filter((s) => s.length > 0);

  if (secrets.length === 0) {
    return { ok: false, reason: `${label} webhook signing secret is not configured` };
  }

  const webhookId = (headers.get("webhook-id") || headers.get("svix-id") || "").trim();
  const webhookTimestamp = (headers.get("webhook-timestamp") || headers.get("svix-timestamp") || "").trim();
  const webhookSignature = (headers.get("webhook-signature") || headers.get("svix-signature") || "").trim();

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, reason: `Missing ${label} webhook signature headers` };
  }

  const tsNum = Number(webhookTimestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsNum) || Math.abs(nowSeconds - tsNum) > 300) {
    return { ok: false, reason: `Stale or invalid ${label} webhook timestamp` };
  }

  const signedContent = new TextEncoder().encode(`${webhookId}.${webhookTimestamp}.${rawBody}`);
  const signatures = webhookSignature
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .map((entry) => entry.slice(3));

  if (signatures.length === 0) {
    return { ok: false, reason: `No v1 signature present in ${label} webhook header` };
  }

  for (const secret of secrets) {
    try {
      const keyBytes = decodeStandardWebhookSecret(secret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes.buffer as ArrayBuffer,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const macBuffer = await crypto.subtle.sign("HMAC", cryptoKey, signedContent);
      const macBytes = new Uint8Array(macBuffer);
      let bin = "";
      for (let i = 0; i < macBytes.length; i++) {
        bin += String.fromCharCode(macBytes[i]);
      }
      const expectedB64 = btoa(bin);
      if (signatures.some((sig) => constantTimeEqual(sig, expectedB64))) {
        return { ok: true };
      }
    } catch {
      // Try remaining configured candidate secrets
    }
  }

  return { ok: false, reason: `${label} webhook signature mismatch` };
}
