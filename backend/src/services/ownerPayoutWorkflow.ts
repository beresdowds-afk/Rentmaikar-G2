/**
 * Owner payout workflow primitives shared by the PayPal and Paystack paths.
 *
 * Every function here is a thin wrapper around a single database function from
 * migration 20261016120000_owner_payout_workflow_and_atomic_withdrawal.sql, so
 * authorization consumption, payout creation, wallet reservation, claiming and
 * settlement are each atomic in the database and never split across separate
 * application-level statements.
 */

import { getDbPool } from "./dbPool";

export type PayoutProvider = "paypal" | "paystack";

export class PayoutError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode?: number) {
    super(message);
    this.name = "PayoutError";
    this.code = code;
    this.statusCode = statusCode ?? PAYOUT_ERROR_STATUS[code] ?? 400;
  }
}

const PAYOUT_ERROR_STATUS: Record<string, number> = {
  invalid_request: 400,
  invalid_amount: 400,
  invalid_provider: 400,
  invalid_idempotency_key: 400,
  invalid_account: 400,
  authorization_required: 428,
  authorization_not_found: 404,
  authorization_wrong_owner: 403,
  authorization_type_mismatch: 403,
  authorization_not_approved: 409,
  authorization_expired: 409,
  authorization_amount_mismatch: 409,
  authorization_currency_mismatch: 409,
  idempotency_conflict: 409,
  payout_in_progress: 409,
  insufficient_balance: 409,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,100}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Reads the stable idempotency key of a logical withdrawal from the request.
 * Accepts both header spellings used by the callers (browser bridge and the
 * scheduled worker) and the body field; headers win over the body.
 */
export function resolveIdempotencyKey(
  headers: Record<string, unknown> | undefined,
  body: Record<string, unknown> | undefined,
): string {
  const pick = (v: unknown) =>
    String(Array.isArray(v) ? v[0] ?? "" : v ?? "").trim();
  const h = headers || {};
  const raw =
    pick(h["idempotency-key"]) ||
    pick(h["Idempotency-Key"]) ||
    pick(h["x-idempotency-key"]) ||
    pick(h["X-Idempotency-Key"]) ||
    pick(body?.idempotencyKey) ||
    pick(body?.idempotency_key);

  if (!IDEMPOTENCY_KEY_RE.test(raw)) {
    throw new PayoutError(
      "invalid_idempotency_key",
      "A stable idempotency key of 8-100 letters, numbers, dots, underscores, colons or hyphens is required",
    );
  }
  return raw;
}

/** Amounts are exact to two decimals (numeric(14,2) in the database). */
export function assertTwoDecimalAmount(amount: unknown, min = 0.01): number {
  const value = Number(amount);
  if (
    !Number.isFinite(value) ||
    value < min ||
    Math.abs(Math.round(value * 100) - value * 100) > 1e-6
  ) {
    throw new PayoutError(
      "invalid_amount",
      `Payout amount must be at least ${min.toFixed(2)} with at most 2 decimal places`,
    );
  }
  return Math.round(value * 100) / 100;
}

export interface SelfWithdrawalRequest {
  ownerId: string;
  authorizationId: string;
  payoutAccountId: string;
  amount: number;
  currency: string;
  provider: PayoutProvider;
  idempotencyKey: string;
}

export interface PayoutRecordRef {
  payoutId: string;
  transferReference: string;
  status: string;
  duplicate: boolean;
  providerAttempts: number;
  reconciliationRequired: boolean;
}

/**
 * Atomically validates and consumes the withdrawal authorization, creates the
 * canonical self-withdrawal payout and reserves wallet funds. Replays with the
 * same idempotency key return the existing payout.
 */
export async function createSelfWithdrawal(
  req: SelfWithdrawalRequest,
): Promise<PayoutRecordRef> {
  if (!req.authorizationId) {
    throw new PayoutError(
      "authorization_required",
      "Withdrawal authorization is required",
    );
  }
  if (!isUuid(req.authorizationId)) {
    throw new PayoutError(
      "authorization_not_found",
      "Withdrawal authorization not found",
    );
  }
  if (!isUuid(req.ownerId) || !isUuid(req.payoutAccountId)) {
    throw new PayoutError(
      "invalid_request",
      "owner_id and payout_account_id must be valid identifiers",
    );
  }

  const pool = getDbPool();
  const result = await pool.query(
    `SELECT public.create_owner_self_withdrawal($1, $2, $3, $4, $5, $6, $7) AS result`,
    [
      req.ownerId,
      req.authorizationId,
      req.payoutAccountId,
      req.amount,
      req.currency,
      req.provider,
      req.idempotencyKey,
    ],
  );

  const out = result.rows[0]?.result;
  if (!out?.ok) {
    throw new PayoutError(
      out?.code || "invalid_request",
      out?.error || "Withdrawal could not be created",
    );
  }

  return {
    payoutId: out.payout_id,
    transferReference: out.transfer_reference,
    status: out.status,
    duplicate: Boolean(out.duplicate),
    providerAttempts: Number(out.provider_attempts ?? 0),
    reconciliationRequired: Boolean(out.reconciliation_required),
  };
}

/** At most one caller wins the right to contact the provider for a payout. */
export async function claimProviderAttempt(payoutId: string): Promise<boolean> {
  const result = await getDbPool().query(
    `SELECT public.claim_owner_payout_provider_attempt($1) AS result`,
    [payoutId],
  );
  return Boolean(result.rows[0]?.result?.claimed);
}

export interface ClaimedWeeklyPayout {
  payout_id: string;
  owner_id: string;
  provider: PayoutProvider;
  amount: number;
  currency: string;
  payout_account_id: string;
  transfer_reference: string;
}

/**
 * Atomically claims an admin-approved, due weekly payout. Self-withdrawals,
 * unapproved, future-dated, already-attempted or reconciliation-flagged rows
 * are never claimable.
 */
export async function claimWeeklyPayout(
  payoutId: string,
): Promise<ClaimedWeeklyPayout | null> {
  const result = await getDbPool().query(
    `SELECT public.claim_weekly_owner_payout($1) AS result`,
    [payoutId],
  );
  const out = result.rows[0]?.result;
  return out?.claimed ? (out as ClaimedWeeklyPayout) : null;
}

export async function recordSubmitted(
  payoutId: string,
  transferCode: string | null,
  providerStatus: string,
  payload: unknown,
): Promise<void> {
  const result = await getDbPool().query(
    `SELECT public.record_owner_payout_submitted($1, $2, $3, $4::jsonb) AS result`,
    [payoutId, transferCode, providerStatus, JSON.stringify(payload ?? {})],
  );
  if (!result.rows[0]?.result?.ok) {
    throw new Error(
      result.rows[0]?.result?.error || "Could not record provider submission",
    );
  }
}

/** Provider outcome unknown: keep funds reserved and flag for reconciliation. */
export async function markReconciliationRequired(
  payoutId: string,
  reason: string,
  payload?: unknown,
): Promise<void> {
  await getDbPool().query(
    `SELECT public.mark_owner_payout_reconciliation_required($1, $2, $3::jsonb)`,
    [payoutId, reason, payload === undefined ? null : JSON.stringify(payload)],
  );
}

export type FinalOutcome = "settled" | "failed" | "reversed";

/**
 * Applies a verified final outcome. Idempotent: replays are no-ops, settlement
 * posts no second debit and a failed/reversed transfer releases the reservation
 * exactly once.
 */
export async function finalizePayout(args: {
  payoutId: string;
  outcome: FinalOutcome;
  provider: PayoutProvider;
  evidence: Record<string, unknown>;
  expectedAmount?: number | null;
  expectedCurrency?: string | null;
}): Promise<{ ok: boolean; duplicate?: boolean; status?: string; error?: string }> {
  const result = await getDbPool().query(
    `SELECT public.finalize_owner_payout($1, $2, $3, $4::jsonb, $5, $6) AS result`,
    [
      args.payoutId,
      args.outcome,
      args.provider,
      JSON.stringify(args.evidence ?? {}),
      args.expectedAmount ?? null,
      args.expectedCurrency ?? null,
    ],
  );
  return result.rows[0]?.result ?? { ok: false, error: "no result" };
}

/**
 * A provider failure is definitive only when the provider verifiably refused
 * the request (a 4xx other than timeout/conflict/rate-limit) or the request was
 * never sent. Everything else - timeouts, network errors, 5xx, missing batch
 * ids - may have been accepted and must be reconciled, never retried blindly.
 */
export function classifyProviderFailure(
  err: unknown,
): "definitive" | "ambiguous" {
  const e = err as { status?: number; notSent?: boolean; ambiguous?: boolean };
  if (e?.ambiguous) return "ambiguous";
  if (e?.notSent) return "definitive";
  const status = Number(e?.status || 0);
  if (
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 409 &&
    status !== 429
  ) {
    return "definitive";
  }
  return "ambiguous";
}

/** PayPal payout item `transaction_status` -> canonical outcome. */
export function mapPayPalItemStatus(
  status: string,
): FinalOutcome | "pending" {
  switch (String(status || "").toUpperCase()) {
    case "SUCCESS":
    case "SUCCEEDED":
      return "settled";
    case "FAILED":
    case "DENIED":
    case "BLOCKED":
    case "CANCELED":
    case "CANCELLED":
      return "failed";
    case "RETURNED":
    case "REFUNDED":
      return "reversed";
    default:
      // PENDING, PROCESSING, ONHOLD, HELD, UNCLAIMED, unknown: not final.
      return "pending";
  }
}

/** Paystack transfer status/event -> canonical outcome. */
export function mapPaystackTransferStatus(
  status: string,
): FinalOutcome | "pending" {
  switch (String(status || "").toLowerCase()) {
    case "success":
    case "transfer.success":
      return "settled";
    case "failed":
    case "transfer.failed":
      return "failed";
    case "reversed":
    case "transfer.reversed":
      return "reversed";
    default:
      return "pending";
  }
}

export interface PayoutRow {
  id: string;
  owner_id: string;
  provider: PayoutProvider;
  amount: string | number;
  currency: string;
  status: string;
  transfer_reference: string | null;
  transfer_code: string | null;
  workflow_type: string;
  provider_attempts: number;
  reconciliation_required: boolean;
}

export async function findPayoutByReference(
  provider: PayoutProvider,
  references: Array<string | null | undefined>,
): Promise<PayoutRow | null> {
  const refs = references.filter(
    (r): r is string => typeof r === "string" && r.length > 0,
  );
  if (!refs.length) return null;
  const result = await getDbPool().query(
    `SELECT id, owner_id, provider, amount, currency, status, transfer_reference,
            transfer_code, workflow_type, provider_attempts, reconciliation_required
     FROM public.owner_payouts
     WHERE provider = $1
       AND (transfer_reference = ANY($2::text[]) OR transfer_code = ANY($2::text[]))
     LIMIT 1`,
    [provider, refs],
  );
  return (result.rows[0] as PayoutRow) ?? null;
}

/**
 * Applies a provider-reported outcome to the payout it belongs to after
 * validating provider, amount and currency. Mismatched or unmatched evidence
 * never settles or releases funds; the payout is flagged for reconciliation.
 */
export async function reconcileProviderOutcome(args: {
  provider: PayoutProvider;
  references: Array<string | null | undefined>;
  outcome: FinalOutcome | "pending";
  reportedAmount: number | null;
  reportedCurrency: string | null;
  evidence: Record<string, unknown>;
}): Promise<{ matched: boolean; applied: boolean; reason?: string; payoutId?: string }> {
  const payout = await findPayoutByReference(args.provider, args.references);
  if (!payout) return { matched: false, applied: false, reason: "payout not found" };

  if (args.outcome === "pending") {
    return { matched: true, applied: false, payoutId: payout.id, reason: "non-final status" };
  }

  const amountOk =
    args.reportedAmount !== null &&
    Math.abs(Number(payout.amount) - args.reportedAmount) < 0.005;
  const currencyOk =
    !!args.reportedCurrency &&
    args.reportedCurrency.toUpperCase() === String(payout.currency).toUpperCase();

  if (!amountOk || !currencyOk) {
    await markReconciliationRequired(
      payout.id,
      "Provider event amount/currency missing or does not match the payout",
      { evidence: args.evidence },
    );
    return { matched: true, applied: false, payoutId: payout.id, reason: "amount/currency mismatch" };
  }

  const res = await finalizePayout({
    payoutId: payout.id,
    outcome: args.outcome,
    provider: args.provider,
    evidence: args.evidence,
    expectedAmount: Number(payout.amount),
    expectedCurrency: payout.currency,
  });
  if (!res.ok) {
    // Evidence conflicts with the persisted state (e.g. failure reported for an
    // already completed payout). Never guess: keep funds as they are and flag.
    await markReconciliationRequired(
      payout.id,
      `Provider reported ${args.outcome} but payout could not be updated: ${res.error ?? "unknown"}`,
      { evidence: args.evidence },
    );
    return { matched: true, applied: false, payoutId: payout.id, reason: res.error };
  }
  return { matched: true, applied: true, payoutId: payout.id };
}
