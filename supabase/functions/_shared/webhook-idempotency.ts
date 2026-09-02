// Shared idempotency + retry helpers for payment provider webhooks.
// Guarantees that duplicate provider callbacks never re-process a payment,
// never create duplicate receipts, and never re-mark invoices paid.
//
// The DB-level guarantees remain the primary defense:
//   * receipts.idempotency_key + receipts.payment_id  → UNIQUE
//   * invoices.status transitions gated inside auto_generate_receipt_from_payment
//   * payment_webhook_events (provider, external_event_id) → UNIQUE
//
// This helper adds the webhook-layer contract: log every attempt, short-circuit
// obvious duplicates, and give callers a small retry primitive for transient
// downstream failures (network, Supabase rate-limit) so we never leave a
// completed payment without a receipt just because one round-trip flaked.
//
// deno-lint-ignore-file no-explicit-any

import type { WebhookLogger } from "./webhook-logger.ts";

export interface IdempotencyRecordInput {
  provider: "paystack" | "paypal" | "opay";
  eventType?: string | null;
  externalEventId?: string | null;
  reference?: string | null;
  signatureValid?: boolean | null;
  paymentId?: string | null;
  invoiceId?: string | null;
  receiptId?: string | null;
  payload: unknown;
  /** Trace key shared by this delivery and every side effect it triggers. */
  correlationId?: string | null;
  logger?: WebhookLogger;
}

export interface IdempotencyResult {
  duplicate: boolean;
  eventRowId: string | null;
}

/**
 * Insert the webhook event row and detect duplicates via the
 * (provider, external_event_id) unique index. Duplicates are returned with
 * duplicate=true so the caller can short-circuit processing.
 */
export async function recordWebhookEvent(
  supabase: any,
  input: IdempotencyRecordInput,
): Promise<IdempotencyResult> {
  const log = input.logger;
  const correlationId = input.correlationId ?? log?.ctx.correlationId ?? null;
  const row: Record<string, unknown> = {
    provider: input.provider,
    event_type: input.eventType ?? null,
    external_event_id: input.externalEventId ?? null,
    reference: input.reference ?? null,
    status: input.signatureValid === false ? "unverified" : (input.signatureValid ? "verified" : "received"),
    signature_valid: input.signatureValid ?? null,
    payment_id: input.paymentId ?? null,
    invoice_id: input.invoiceId ?? null,
    receipt_id: input.receiptId ?? null,
    payload: input.payload,
    correlation_id: correlationId,
  };

  const { data, error } = await supabase
    .from("payment_webhook_events")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (!error && data?.id) {
    log?.info("idempotency.recorded", { event_row_id: data.id, duplicate: false });
    return { duplicate: false, eventRowId: data.id };
  }

  // Unique-violation on (provider, external_event_id) → duplicate delivery.
  const code = (error as any)?.code;
  const message = String((error as any)?.message ?? "");
  const isDuplicate =
    !!input.externalEventId &&
    (code === "23505" || /duplicate key value|unique constraint/i.test(message));

  if (isDuplicate) {
    const { data: existing } = await supabase
      .from("payment_webhook_events")
      .select("id, correlation_id")
      .eq("provider", input.provider)
      .eq("external_event_id", input.externalEventId)
      .maybeSingle();
    // Log both trace keys so a replay can be tied back to the original delivery.
    log?.warn("idempotency.replay", {
      event_row_id: existing?.id ?? null,
      original_correlation_id: existing?.correlation_id ?? null,
      duplicate: true,
    });
    return { duplicate: true, eventRowId: existing?.id ?? null };
  }

  // Unknown insert error — do not block webhook processing, but flag it.
  log?.error("idempotency.insert_failed", { error: message || String(error) });
  console.error(`[webhook-idempotency] insert failed provider=${input.provider}`, error);
  return { duplicate: false, eventRowId: null };
}

/**
 * A payment must only be marked completed once. Setting status=completed on an
 * already-completed row is a no-op at the DB trigger layer, but we also skip
 * the update round-trip when possible.
 */
export async function markPaymentCompletedIdempotent(
  supabase: any,
  paymentId: string,
): Promise<{ alreadyCompleted: boolean }> {
  const { data: current } = await supabase
    .from("payments")
    .select("status")
    .eq("id", paymentId)
    .maybeSingle();
  if (current?.status === "completed") return { alreadyCompleted: true };

  await supabase
    .from("payments")
    .update({ status: "completed", processed_at: new Date().toISOString(), failure_reason: null })
    .eq("id", paymentId)
    .neq("status", "completed"); // conditional guard
  return { alreadyCompleted: false };
}

/**
 * Small retry primitive for downstream calls (email, push, sub-invoke).
 * Never throws — final failure is logged and swallowed so the webhook still
 * returns 200 and the provider does not retry the whole event.
 */
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T | null> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        const wait = base * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  console.error(`[withRetry] gave up after ${attempts} attempts: ${label}`, lastErr);
  return null;
}

// ---------------------------------------------------------------------------
// Payment / payout state machine
// Pending → Authorized → Captured → Settled → Available → Completed
//                                   └→ Failed / Refunded / Disputed
// Every PSP webhook drives the machine through `transition_payment_state` so
// invalid jumps are rejected in one place (the DB) rather than per provider.
// ---------------------------------------------------------------------------

export type PaymentEntity = "payment" | "payout";

export type PaymentState =
  | "pending"
  | "authorized"
  | "captured"
  | "settled"
  | "available"
  | "completed"
  | "failed"
  | "refunded"
  | "disputed";

/**
 * Move a payment/payout to `toState`. Retries transient failures, never throws.
 * Returns true when the DB accepted the transition.
 *
 * Every hop is logged with the delivery's correlation ID so a single trace key
 * shows the full pending → captured → settled path a callback produced.
 */
export async function transitionState(
  supabase: any,
  entity: PaymentEntity,
  entityId: string,
  toState: PaymentState,
  reason?: string,
  metadata: Record<string, unknown> = {},
  logger?: WebhookLogger,
): Promise<boolean> {
  const correlationId = logger?.ctx.correlationId ?? (metadata.correlation_id as string) ?? null;
  const result = await withRetry(`state.${entity}.${toState}`, async () => {
    const { error } = await supabase.rpc("transition_payment_state", {
      _entity: entity,
      _entity_id: entityId,
      _to_state: toState,
      _reason: reason ?? null,
      _metadata: { ...metadata, correlation_id: correlationId },
    });
    // An illegal transition is a permanent answer, not a transient fault:
    // surface it as a non-retryable false rather than burning retries.
    if (error) {
      if (/invalid transition|not allowed/i.test(error.message ?? "")) {
        logger?.warn("state.rejected", { entity, entity_id: entityId, to_state: toState, error: error.message });
        console.warn(`[state] rejected ${entity} ${entityId} → ${toState}: ${error.message}`);
        return false;
      }
      throw error;
    }
    return true;
  });
  logger?.[result === true ? "info" : "warn"]("state.transition", {
    entity,
    entity_id: entityId,
    to_state: toState,
    accepted: result === true,
    reason: reason ?? null,
  });
  return result === true;
}

/**
 * Refund handling shared by every PSP: flip the payment state, stamp the
 * refund metadata, and reverse the wallet ledger entries that the original
 * capture posted. Ledger reversal is idempotent via the entry's own key.
 */
export async function applyRefund(
  supabase: any,
  opts: {
    paymentId: string;
    provider: string;
    providerReference?: string | null;
    amount?: number | null;
    reason?: string | null;
    logger?: WebhookLogger;
  },
): Promise<void> {
  const { paymentId, provider, providerReference, amount, reason, logger } = opts;

  await transitionState(
    supabase,
    "payment",
    paymentId,
    "refunded",
    reason ?? "provider refund",
    { provider, provider_reference: providerReference ?? null, amount: amount ?? null },
    logger,
  );

  await supabase
    .from("payments")
    .update({ status: "refunded", failure_reason: reason ?? null })
    .eq("id", paymentId);

  // Reverse every ledger entry raised for this payment.
  const { data: entries } = await supabase
    .from("wallet_ledger_entries")
    .select("id, status")
    .eq("reference_table", "payments")
    .eq("reference_id", paymentId);

  let reversed = 0;
  for (const entry of entries ?? []) {
    if (entry.status === "reversed") continue;
    await withRetry(`refund.reverse.${entry.id}`, async () => {
      const { error } = await supabase.rpc("reverse_wallet_entry", {
        _entry_id: entry.id,
        _reason: reason ?? `${provider} refund`,
      });
      if (error) throw error;
    });
    reversed += 1;
  }
  logger?.info("refund.applied", { payment_id: paymentId, entries_reversed: reversed });
}

/**
 * Chargeback / dispute opened at the PSP. Funds are frozen rather than
 * reversed — the ledger stays intact until the dispute resolves, and an
 * admin-facing dispute case is opened for escalation/override.
 */
export async function applyDispute(
  supabase: any,
  opts: {
    paymentId: string;
    provider: string;
    providerReference?: string | null;
    reason?: string | null;
    amount?: number | null;
    currency?: string | null;
    logger?: WebhookLogger;
  },
): Promise<void> {
  const { paymentId, provider, providerReference, reason, amount, currency, logger } = opts;

  await transitionState(
    supabase,
    "payment",
    paymentId,
    "disputed",
    reason ?? "chargeback opened",
    { provider, provider_reference: providerReference ?? null },
    logger,
  );

  await supabase
    .from("payments")
    .update({ status: "disputed", failure_reason: reason ?? "chargeback opened" })
    .eq("id", paymentId);

  // Open (or refresh) the admin dispute case. Idempotent on
  // (payment_id, provider_reference) so provider retries never duplicate it.
  await withRetry(`dispute.record.${paymentId}`, async () => {
    const { error } = await supabase.rpc("record_payment_dispute", {
      _payment_id: paymentId,
      _provider: provider,
      _provider_reference: providerReference ?? null,
      _reason: reason ?? null,
      _amount: amount ?? null,
      _currency: currency ?? null,
      _correlation_id: logger?.ctx.correlationId ?? null,
    });
    if (error) throw error;
  });
  logger?.warn("dispute.opened", { payment_id: paymentId, provider_reference: providerReference ?? null });
}
