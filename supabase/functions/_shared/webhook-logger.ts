// Structured logging + correlation IDs for every PSP webhook handler.
//
// One provider callback can fan out into a dozen side effects (idempotency
// insert, several state-machine hops, ledger posts, receipt email, push).
// Without a shared trace key those lines are impossible to stitch back
// together in the function logs — especially for provider retries, which look
// identical to the original delivery.
//
// Every log line is emitted as a single JSON object so it can be filtered on
// `correlation_id`, `provider`, `event_type`, or `step` directly in the log
// explorer.
//
// deno-lint-ignore-file no-explicit-any

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface WebhookLogContext {
  provider: string;
  correlationId: string;
  eventType?: string | null;
  externalEventId?: string | null;
  reference?: string | null;
  paymentId?: string | null;
}

/**
 * Derive a correlation ID for this delivery.
 *
 * Preference order matters: an inbound trace header (set by our own retry
 * tooling or a proxy) wins so a replay stays attached to the original trace;
 * otherwise the provider's own event id keeps every retry of the *same* event
 * under one key; a random id is the last resort.
 */
export function deriveCorrelationId(
  req: Request,
  provider: string,
  externalEventId?: string | null,
): string {
  const header =
    req.headers.get("x-correlation-id") ??
    req.headers.get("x-request-id") ??
    req.headers.get("traceparent");
  if (header && header.trim()) return header.trim().slice(0, 120);
  if (externalEventId) return `${provider}:${externalEventId}`.slice(0, 120);
  return `${provider}:${crypto.randomUUID()}`;
}

export interface WebhookLogger {
  ctx: WebhookLogContext;
  /** Merge extra context (e.g. the payment id once resolved) into every later line. */
  bind(extra: Partial<WebhookLogContext>): void;
  log(level: LogLevel, step: string, data?: Record<string, unknown>): void;
  debug(step: string, data?: Record<string, unknown>): void;
  info(step: string, data?: Record<string, unknown>): void;
  warn(step: string, data?: Record<string, unknown>): void;
  error(step: string, data?: Record<string, unknown>): void;
  /** Time a step and log its outcome + duration. Rethrows nothing it didn't catch. */
  step<T>(step: string, fn: () => Promise<T>, data?: Record<string, unknown>): Promise<T>;
  /** Milliseconds since the logger was created. */
  elapsedMs(): number;
}

export function createWebhookLogger(ctx: WebhookLogContext): WebhookLogger {
  const startedAt = Date.now();
  const bound: WebhookLogContext = { ...ctx };

  const emit = (level: LogLevel, step: string, data?: Record<string, unknown>) => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope: "psp-webhook",
      step,
      correlation_id: bound.correlationId,
      provider: bound.provider,
      event_type: bound.eventType ?? null,
      external_event_id: bound.externalEventId ?? null,
      reference: bound.reference ?? null,
      payment_id: bound.paymentId ?? null,
      elapsed_ms: Date.now() - startedAt,
      ...(data ?? {}),
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };

  return {
    ctx: bound,
    bind(extra) {
      Object.assign(bound, extra);
    },
    log: emit,
    debug: (s, d) => emit("debug", s, d),
    info: (s, d) => emit("info", s, d),
    warn: (s, d) => emit("warn", s, d),
    error: (s, d) => emit("error", s, d),
    async step<T>(step: string, fn: () => Promise<T>, data?: Record<string, unknown>): Promise<T> {
      const t0 = Date.now();
      emit("info", `${step}.start`, data);
      try {
        const result = await fn();
        emit("info", `${step}.ok`, { ...(data ?? {}), duration_ms: Date.now() - t0 });
        return result;
      } catch (e) {
        emit("error", `${step}.fail`, {
          ...(data ?? {}),
          duration_ms: Date.now() - t0,
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    },
    elapsedMs: () => Date.now() - startedAt,
  };
}

/** Standard response headers so callers can correlate their own retries. */
export function correlationHeaders(logger: WebhookLogger): Record<string, string> {
  return { "x-correlation-id": logger.ctx.correlationId };
}
