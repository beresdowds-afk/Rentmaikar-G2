/**
 * Rentmaikar Platform Email Interceptor
 *
 * PURPOSE
 * -------
 * This module is the routing-policy layer for automated platform email.
 *
 * It does NOT send email itself.
 *
 * Eligible platform email:
 *
 *   Platform producer
 *        ↓
 *   platform-email-interceptor
 *        ↓
 *   backend-email-bridge
 *        ↓
 *   staging.rentmaikar.com
 *        ↓
 *   Cloud Run
 *        ↓
 *   /api/functions/send-outbound-email
 *        ↓
 *   Cloud Run email service
 *        ↓
 *   Resend
 *
 * SECURITY / ROUTING RULE
 * ----------------------
 * Only explicitly approved platform-email producers are intercepted.
 *
 * This is intentionally an allowlist.
 *
 * It is NOT:
 *   - a global fetch interceptor
 *   - a monkey-patch
 *   - a "everything except Auth" rule
 *   - an Auth email interceptor
 *   - a payment authorization interceptor
 *   - an inbound email interceptor
 *   - an SMS/WhatsApp interceptor
 *
 * Auth email remains outside this routing layer.
 */

import {
  sendPlatformEmail,
  type BackendEmailBridgeOptions,
} from "./backend-email-bridge.ts";

/**
 * Explicit allowlist of automated platform-email producers.
 *
 * IMPORTANT:
 * Keep this list intentionally narrow.
 *
 * If a new automated platform email producer is created, it must be
 * deliberately added here rather than being intercepted automatically.
 */
export const PLATFORM_EMAIL_PRODUCERS = new Set<string>([
  "send-order-notification",
  "process-daily-debits",
  "send-reconciliation-alert",
  "send-agreement-email",
  "send-task-notification",
  "process-owner-payouts",
  "send-shipping-notification",
  "withdrawal-notify",
  "notify-referees",
  "process-predue-reminders",
  "process-agreement-renewals",
  "process-payment-unlock",
  "send-incident-notification",
  "send-approval-notification",
  "send-price-notification",
  "process-inspection-reminders",
  "process-expiry-notifications",
  "process-email-queue",
]);

/**
 * Explicitly protected/excluded email producers.
 *
 * These must NEVER be routed through the platform-email interceptor.
 *
 * Auth delivery remains on its own authoritative Auth/Supabase pipeline.
 */
export const PROTECTED_EMAIL_PRODUCERS = new Set<string>([
  "send-password-reset",
  "send-verification-email",
  "auth-email-hook",
]);

/**
 * Other email-related producers that are deliberately outside the
 * platform-email interception boundary.
 */
export const EXCLUDED_EMAIL_PRODUCERS = new Set<string>([
  "email-webhook",
]);

export interface PlatformEmailInterceptorContext {
  /**
   * Explicit producer identity.
   *
   * This should be supplied whenever the caller knows its own identity,
   * especially for shared modules such as withdrawal-notify.ts.
   */
  producer?: string;

  /**
   * Optional queue classification.
   *
   * process-email-queue handles both:
   *   - auth_emails
   *   - transactional_emails
   *
   * Only transactional_emails are platform email.
   */
  queueName?: string;

  /**
   * Optional correlation ID propagated through the backend.
   */
  correlationId?: string;

  /**
   * Optional idempotency key.
   */
  idempotencyKey?: string;

  /**
   * Optional timeout for the backend bridge.
   */
  timeoutMs?: number;

  /**
   * Optional explicit platform source label.
   */
  platformSource?: string;
}

export interface PlatformEmailInterceptorResult {
  intercepted: boolean;
  producer: string;
  reason:
    | "platform-producer"
    | "protected-producer"
    | "excluded-producer"
    | "non-platform-producer"
    | "auth-queue"
    | "missing-producer";
  response?: Response;
}

/**
 * Extract the Supabase Edge Function name from the current stack.
 *
 * Expected pattern:
 *
 *   supabase/functions/<function-name>/index.ts
 *
 * This is only a fallback.
 *
 * Explicit producer context is preferred.
 */
function detectProducerFromStack(): string {
  const stack = new Error().stack ?? "";

  const patterns = [
    /supabase[\\/]+functions[\\/]+([A-Za-z0-9_-]+)[\\/]+index\.ts/i,
    /functions[\\/]+([A-Za-z0-9_-]+)[\\/]+index\.ts/i,
  ];

  for (const pattern of patterns) {
    const match = stack.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return (
    Deno.env.get("SB_FUNCTION_NAME") ||
    Deno.env.get("RENTMAIKAR_EMAIL_PRODUCER") ||
    "unknown-function"
  );
}

/**
 * Normalise producer names so accidental path fragments do not enter
 * the allowlist comparison.
 */
function normalizeProducer(producer?: string | null): string {
  if (!producer) {
    return "";
  }

  const value = producer.trim();

  if (!value) {
    return "";
  }

  const withoutPath = value
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop() || value;

  return withoutPath
    .replace(/\.ts$/i, "")
    .replace(/^index$/i, "")
    .trim();
}

/**
 * Determines whether the producer is explicitly approved for platform
 * email routing.
 */
export function isPlatformEmailProducer(
  producer?: string | null,
): boolean {
  const normalized = normalizeProducer(producer);

  return (
    normalized.length > 0 &&
    PLATFORM_EMAIL_PRODUCERS.has(normalized)
  );
}

/**
 * Determines whether the producer is explicitly protected.
 */
export function isProtectedEmailProducer(
  producer?: string | null,
): boolean {
  const normalized = normalizeProducer(producer);

  return (
    normalized.length > 0 &&
    PROTECTED_EMAIL_PRODUCERS.has(normalized)
  );
}

/**
 * Determines whether the producer is explicitly excluded.
 */
export function isExcludedEmailProducer(
  producer?: string | null,
): boolean {
  const normalized = normalizeProducer(producer);

  return (
    normalized.length > 0 &&
    EXCLUDED_EMAIL_PRODUCERS.has(normalized)
  );
}

/**
 * process-email-queue is special.
 *
 * The same function processes:
 *
 *   auth_emails
 *   transactional_emails
 *
 * Only transactional_emails are platform email.
 */
function isEligibleQueue(
  producer: string,
  queueName?: string | null,
): boolean {
  if (producer !== "process-email-queue") {
    return true;
  }

  return queueName === "transactional_emails";
}

/**
 * Build a safe platform source identifier.
 */
function resolvePlatformSource(
  producer: string,
  explicitSource?: string,
): string {
  if (explicitSource?.trim()) {
    return explicitSource.trim();
  }

  return `supabase-platform:${producer}`;
}

/**
 * Convert the backend bridge result into a Response.
 *
 * Existing resendSendEmail() callers expect a Response object and commonly
 * inspect:
 *
 *   response.ok
 *   response.status
 *   response.json()
 *
 * Keeping that contract means the interceptor can be introduced without
 * forcing all 18 producers to immediately rewrite their response handling.
 */
function backendResultToResponse(
  result: Awaited<ReturnType<typeof sendPlatformEmail>>,
): Response {
  const status =
    Number.isInteger(result.status) && result.status > 0
      ? result.status
      : result.ok
        ? 200
        : 502;

  const responseBody = {
    ok: result.ok,
    success: result.success,
    messageId: result.messageId,
    correlationId: result.correlationId,
    data: result.data,
    error: result.error,
    source: "rentmaikar-platform-email-interceptor",
  };

  return new Response(
    JSON.stringify(responseBody),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Rentmaikar-Email-Source":
          "platform-email-interceptor",
        "X-Rentmaikar-Correlation-ID":
          result.correlationId,
      },
    },
  );
}

/**
 * Intercept an automated platform email.
 *
 * Returns:
 *
 *   Response
 *     → backend routing occurred
 *
 *   null
 *     → this producer is NOT handled by the platform interceptor
 *
 * A null result is deliberate.
 *
 * It allows protected/non-platform callers to remain on their existing
 * routing path instead of accidentally being captured.
 */
export async function interceptPlatformEmail(
  body: Record<string, unknown>,
  context: PlatformEmailInterceptorContext = {},
): Promise<PlatformEmailInterceptorResult> {
  const producer = normalizeProducer(
    context.producer || detectProducerFromStack(),
  );

  /**
   * Unknown producer:
   *
   * Fail closed.
   *
   * We do NOT assume that an unknown caller is platform email.
   */
  if (!producer) {
    return {
      intercepted: false,
      producer: "unknown-function",
      reason: "missing-producer",
    };
  }

  /**
   * Protected Auth producers always win over the platform allowlist.
   */
  if (isProtectedEmailProducer(producer)) {
    return {
      intercepted: false,
      producer,
      reason: "protected-producer",
    };
  }

  /**
   * Explicitly excluded email producers.
   */
  if (isExcludedEmailProducer(producer)) {
    return {
      intercepted: false,
      producer,
      reason: "excluded-producer",
    };
  }

  /**
   * process-email-queue has two different email classes.
   *
   * Auth queue MUST NOT be intercepted.
   */
  if (
    producer === "process-email-queue" &&
    !isEligibleQueue(producer, context.queueName)
  ) {
    return {
      intercepted: false,
      producer,
      reason: "auth-queue",
    };
  }

  /**
   * Only the explicit platform allowlist can enter the backend bridge.
   */
  if (!isPlatformEmailProducer(producer)) {
    return {
      intercepted: false,
      producer,
      reason: "non-platform-producer",
    };
  }

  const correlationId =
    context.correlationId ||
    (typeof body.correlationId === "string"
      ? body.correlationId
      : typeof body.correlation_id === "string"
        ? body.correlation_id
        : undefined);

  const idempotencyKey =
    context.idempotencyKey ||
    (typeof body.idempotencyKey === "string"
      ? body.idempotencyKey
      : typeof body.idempotency_key === "string"
        ? body.idempotency_key
        : undefined);

  const platformSource = resolvePlatformSource(
    producer,
    context.platformSource,
  );

  const bridgeOptions: BackendEmailBridgeOptions = {
    correlationId,
    idempotencyKey,
    timeoutMs: context.timeoutMs,
    platformSource,
  };

  /**
   * Do not alter the original payload.
   *
   * The authoritative Cloud Run email service should receive the same
   * application email payload produced by the platform producer.
   *
   * We only add routing metadata that is useful for observability.
   */
  const bridgePayload: Record<string, unknown> = {
    ...body,

    platformSource,

    producer,

    correlationId,

    /**
     * This is useful for backend logs/auditing without changing the
     * actual email content.
     */
    routing: {
      source: "platform-email-interceptor",
      producer,
      queueName:
        context.queueName ||
        (typeof body.queueName === "string"
          ? body.queueName
          : undefined),
    },
  };

  console.log(
    "[Platform Email Interceptor] Routing platform email to Cloud Run",
    {
      producer,
      platformSource,
      queueName: context.queueName || null,
      correlationId: correlationId || null,
      hasIdempotencyKey: Boolean(idempotencyKey),
    },
  );

  try {
    const result = await sendPlatformEmail(
      bridgePayload,
      bridgeOptions,
    );

    const response = backendResultToResponse(result);

    console.log(
      "[Platform Email Interceptor] Backend routing completed",
      {
        producer,
        ok: result.ok,
        success: result.success,
        status: result.status,
        correlationId: result.correlationId,
        messageId: result.messageId || null,
      },
    );

    return {
      intercepted: true,
      producer,
      reason: "platform-producer",
      response,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[Platform Email Interceptor] Backend routing failed",
      {
        producer,
        correlationId: correlationId || null,
        error: message,
      },
    );

    /**
     * IMPORTANT:
     *
     * We do NOT silently fall back to direct Resend here.
     *
     * The purpose of this interceptor is to establish the backend as the
     * authoritative operational email route.
     */
    const failedResponse = new Response(
      JSON.stringify({
        ok: false,
        success: false,
        error:
          "Platform email backend routing failed",
        detail: message,
        producer,
        source:
          "rentmaikar-platform-email-interceptor",
        correlationId: correlationId || null,
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "X-Rentmaikar-Email-Source":
            "platform-email-interceptor",
        },
      },
    );

    return {
      intercepted: true,
      producer,
      reason: "platform-producer",
      response: failedResponse,
    };
  }
}

/**
 * Convenience helper for callers that explicitly identify themselves.
 *
 * Example:
 *
 *   const intercepted =
 *     await interceptPlatformEmail(body, {
 *       producer: "withdrawal-notify",
 *     });
 *
 *   if (intercepted.intercepted) {
 *     return intercepted.response!;
 *   }
 */
export async function interceptPlatformEmailFromProducer(
  producer: string,
  body: Record<string, unknown>,
  context: Omit<
    PlatformEmailInterceptorContext,
    "producer"
  > = {},
): Promise<PlatformEmailInterceptorResult> {
  return interceptPlatformEmail(body, {
    ...context,
    producer,
  });
}

/**
 * process-email-queue convenience helper.
 *
 * This prevents accidental interception of auth_emails.
 */
export async function interceptTransactionalQueueEmail(
  body: Record<string, unknown>,
  context: Omit<
    PlatformEmailInterceptorContext,
    "producer" | "queueName"
  > = {},
): Promise<PlatformEmailInterceptorResult> {
  return interceptPlatformEmail(body, {
    ...context,
    producer: "process-email-queue",
    queueName: "transactional_emails",
  });
}
