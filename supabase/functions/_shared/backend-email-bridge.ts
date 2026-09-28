/**
 * Rentmaikar Server-Side Backend Email Bridge
 *
 * PURPOSE
 * -------
 * This is the server-side counterpart to the browser's backendBridge.
 *
 * Automated Supabase Edge Functions MUST NOT call Resend directly for
 * ordinary platform/application email.
 *
 * They call this helper instead:
 *
 *   Supabase Edge Function
 *        ↓
 *   backend-email-bridge
 *        ↓
 *   staging.rentmaikar.com
 *        ↓
 *   /api/functions/send-outbound-email
 *        ↓
 *   Cloud Run emailService
 *        ↓
 *   Resend
 *
 * SECURITY
 * --------
 * The bridge secret is server-side only.
 * NEVER expose it through VITE_* or frontend configuration.
 */

const DEFAULT_BACKEND_URL = "https://staging.rentmaikar.com";

export interface BackendEmailBridgeOptions {
  /**
   * Optional correlation ID for tracing the complete operation.
   */
  correlationId?: string;

  /**
   * Optional idempotency key.
   */
  idempotencyKey?: string;

  /**
   * Abort timeout in milliseconds.
   */
  timeoutMs?: number;

  /**
   * Optional source identifier for evidence/telemetry.
   */
  platformSource?: string;
}

export interface BackendEmailBridgeResult {
  ok: boolean;
  success: boolean;
  status: number;
  messageId?: string;
  data?: unknown;
  error?: string;
  correlationId: string;
}

/**
 * Generate a correlation ID when the upstream function did not provide one.
 */
function generateCorrelationId(source = "platform-email"): string {
  return `${source}-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

/**
 * Resolve the authoritative Cloud Run backend URL.
 *
 * Production platform-email automation should point to the staging backend
 * hostname currently serving the Rentmaikar backend gateway.
 *
 * This is intentionally NOT a frontend/public environment variable.
 */
function getBackendUrl(): string {
  const configured =
    Deno.env.get("RENTMAIKAR_BACKEND_URL") ||
    Deno.env.get("BACKEND_URL") ||
    DEFAULT_BACKEND_URL;

  return configured.replace(/\/+$/, "");
}

/**
 * Read the server-to-server bridge secret.
 *
 * This MUST be configured as a Supabase Edge Function secret.
 */
function getBridgeSecret(): string {
  const secret = Deno.env.get(
    "RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET",
  );

  if (!secret) {
    throw new Error(
      "RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET is not configured",
    );
  }

  return secret;
}

/**
 * Constant-time comparison for the shared secret.
 *
 * We deliberately avoid ordinary `===` comparison for the secret.
 */
function secureCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < aBytes.length; i += 1) {
    difference |= aBytes[i] ^ bBytes[i];
  }

  return difference === 0;
}

/**
 * Server-side authoritative platform-email dispatch.
 *
 * This function ONLY calls the Cloud Run backend.
 *
 * It never:
 *   - calls Supabase Edge Functions
 *   - calls Resend directly
 *   - exposes provider credentials
 */
export async function sendPlatformEmail(
  payload: Record<string, unknown>,
  options: BackendEmailBridgeOptions = {},
): Promise<BackendEmailBridgeResult> {
  const correlationId =
    options.correlationId ||
    generateCorrelationId(
      options.platformSource || "platform-email",
    );

  const timeoutMs = options.timeoutMs ?? 30000;
  const backendUrl = getBackendUrl();
  const bridgeSecret = getBridgeSecret();

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const endpoint =
      `${backendUrl}/api/functions/send-outbound-email`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",

      /*
       * Server-to-server authentication.
       *
       * This header is NEVER sent by browser frontend code.
       */
      "X-Rentmaikar-Internal-Secret": bridgeSecret,

      /*
       * Operational tracing.
       */
      "X-Correlation-ID": correlationId,
    };

    if (options.idempotencyKey) {
      headers["X-Idempotency-Key"] = options.idempotencyKey;
    }

    const body = {
      ...payload,

      /*
       * Identify the origin of the automated platform message.
       */
      platformSource:
        options.platformSource ||
        payload.platformSource ||
        "supabase-platform-automation",

      correlationId,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const responseText = await response.text();

    let responseData: any = null;

    if (responseText) {
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = {
          raw: responseText.slice(0, 2000),
        };
      }
    }

    if (!response.ok) {
      console.error(
        "[Backend Email Bridge] Cloud Run rejected email dispatch",
        {
          status: response.status,
          correlationId,
          error:
            responseData?.error ||
            responseData?.message ||
            `HTTP ${response.status}`,
        },
      );

      return {
        ok: false,
        success: false,
        status: response.status,
        error:
          responseData?.error ||
          responseData?.message ||
          `Backend email dispatch failed with HTTP ${response.status}`,
        data: responseData,
        correlationId,
      };
    }

    const successful =
      responseData?.ok === true &&
      responseData?.success === true;

    if (!successful) {
      console.error(
        "[Backend Email Bridge] Cloud Run returned a non-success email result",
        {
          status: response.status,
          correlationId,
          response: responseData,
        },
      );

      return {
        ok: false,
        success: false,
        status: response.status,
        error:
          responseData?.error ||
          "Backend email router did not positively acknowledge the email",
        data: responseData,
        correlationId,
      };
    }

    return {
      ok: true,
      success: true,
      status: response.status,
      messageId: responseData?.messageId,
      data: responseData,
      correlationId,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error(
        "[Backend Email Bridge] Cloud Run email dispatch timed out",
        {
          correlationId,
          timeoutMs,
        },
      );

      return {
        ok: false,
        success: false,
        status: 504,
        error: `Backend email dispatch timed out after ${timeoutMs}ms`,
        correlationId,
      };
    }

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[Backend Email Bridge] Cloud Run email dispatch failed",
      {
        correlationId,
        error: message,
      },
    );

    return {
      ok: false,
      success: false,
      status: 502,
      error: message,
      correlationId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convenience helper for the common single platform-email operation.
 */
export async function sendSinglePlatformEmail(
  payload: Record<string, unknown>,
  options: BackendEmailBridgeOptions = {},
): Promise<BackendEmailBridgeResult> {
  return sendPlatformEmail(payload, options);
  }
