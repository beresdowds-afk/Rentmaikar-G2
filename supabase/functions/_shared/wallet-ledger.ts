// Wallet ledger helpers for edge functions.
//
// Every money movement in RentMaikar should leave an append-only trace in
// public.wallet_ledger_entries. Posting always goes through the
// post_wallet_entry RPC, which:
//   * locks the wallet row so concurrent postings serialize,
//   * short-circuits on a duplicate idempotency_key (returns duplicate: true),
//   * updates available/pending balances atomically with the entry insert.
//
// deno-lint-ignore-file no-explicit-any

export type WalletAccountType = "driver" | "owner" | "platform" | "proxy";
export type LedgerDirection = "credit" | "debit";
export type LedgerStatus = "pending" | "posted";

export type LedgerEntryType =
  | "rental_payment"
  | "security_deposit"
  | "deposit_refund"
  | "platform_fee"
  | "owner_share"
  | "subscription_training"
  | "subscription_insurance"
  | "subscription_roadside"
  | "payout"
  | "payout_reversal"
  | "refund"
  | "late_fee"
  | "adjustment";

export interface PostLedgerInput {
  userId: string;
  accountType: WalletAccountType;
  currency: "USD" | "NGN" | string;
  direction: LedgerDirection;
  amount: number;
  entryType: LedgerEntryType;
  /** Stable key — same key can never post twice. */
  idempotencyKey?: string | null;
  referenceTable?: string | null;
  referenceId?: string | null;
  provider?: string | null;
  providerReference?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  status?: LedgerStatus;
}

export interface PostLedgerResult {
  ok: boolean;
  duplicate: boolean;
  entryId?: string;
  availableBalance?: number;
  error?: string;
}

const SUPPORTED_CURRENCIES = new Set(["USD", "NGN"]);

/**
 * Post a single ledger entry. Never throws — ledger failures must not
 * roll back an already-captured provider payment; they are surfaced to
 * the caller for logging/alerting instead.
 */
export async function postLedgerEntry(
  supabase: any,
  input: PostLedgerInput,
): Promise<PostLedgerResult> {
  const currency = (input.currency || "").toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    return { ok: false, duplicate: false, error: `unsupported ledger currency: ${input.currency}` };
  }
  if (!input.userId || !(input.amount > 0)) {
    return { ok: false, duplicate: false, error: "missing userId or non-positive amount" };
  }

  try {
    const { data, error } = await supabase.rpc("post_wallet_entry", {
      _user_id: input.userId,
      _account_type: input.accountType,
      _currency: currency,
      _direction: input.direction,
      _amount: Number(input.amount.toFixed(2)),
      _entry_type: input.entryType,
      _idempotency_key: input.idempotencyKey ?? null,
      _reference_table: input.referenceTable ?? null,
      _reference_id: input.referenceId ?? null,
      _provider: input.provider ?? null,
      _provider_reference: input.providerReference ?? null,
      _description: input.description ?? null,
      _metadata: input.metadata ?? {},
      _status: input.status ?? "posted",
    });
    if (error) return { ok: false, duplicate: false, error: error.message };
    return {
      ok: true,
      duplicate: Boolean(data?.duplicate),
      entryId: data?.entry_id,
      availableBalance: data?.available_balance != null ? Number(data.available_balance) : undefined,
    };
  } catch (e) {
    return { ok: false, duplicate: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Post several entries in sequence, collecting per-entry outcomes. */
export async function postLedgerEntries(
  supabase: any,
  entries: PostLedgerInput[],
): Promise<PostLedgerResult[]> {
  const results: PostLedgerResult[] = [];
  for (const entry of entries) {
    results.push(await postLedgerEntry(supabase, entry));
  }
  return results;
}

/**
 * Record a completed rental payment as a driver debit plus the matching
 * owner-share credit and platform fee (40% platform / 60% owner by default,
 * where the platform slice is split 20% admin / 20% owner elsewhere).
 */
export async function postRentalPaymentLedger(
  supabase: any,
  args: {
    paymentId: string;
    driverId: string;
    ownerId?: string | null;
    amount: number;
    currency: string;
    provider: string;
    providerReference?: string | null;
    ownerSharePct?: number;
  },
): Promise<PostLedgerResult[]> {
  const ownerPct = args.ownerSharePct ?? 0.6;
  const ownerShare = Math.round(args.amount * ownerPct * 100) / 100;
  const platformFee = Math.round((args.amount - ownerShare) * 100) / 100;

  const entries: PostLedgerInput[] = [
    {
      userId: args.driverId,
      accountType: "driver",
      currency: args.currency,
      direction: "debit",
      amount: args.amount,
      entryType: "rental_payment",
      idempotencyKey: `payment:${args.paymentId}:driver`,
      referenceTable: "payments",
      referenceId: args.paymentId,
      provider: args.provider,
      providerReference: args.providerReference ?? null,
      description: "Rental payment",
    },
  ];

  if (args.ownerId && ownerShare > 0) {
    entries.push({
      userId: args.ownerId,
      accountType: "owner",
      currency: args.currency,
      direction: "credit",
      amount: ownerShare,
      entryType: "owner_share",
      idempotencyKey: `payment:${args.paymentId}:owner`,
      referenceTable: "payments",
      referenceId: args.paymentId,
      provider: args.provider,
      providerReference: args.providerReference ?? null,
      description: "Owner share of rental payment",
      metadata: { platform_fee: platformFee, owner_share_pct: ownerPct },
    });
  }

  return await postLedgerEntries(supabase, entries);
}

/**
 * Unified settlement entry point.
 *
 * Delegates the whole financial fan-out for a completed payment to the
 * `settle_payment_financials` RPC: tax line items, commission split, wallet
 * ledger postings (driver debit / owner share / platform fee), owner
 * earnings, subscription activation, invoice creation and audit logging.
 *
 * The RPC is idempotent (guarded by `payments.settled_at` plus per-entry
 * idempotency keys), so webhook retries are safe. Failures are returned,
 * never thrown — the money has already moved at the provider.
 */
export async function settlePaymentFinancials(
  supabase: any,
  paymentId: string,
  provider: string,
  providerReference?: string | null,
): Promise<{ ok: boolean; result?: any; error?: string }> {
  const { data, error } = await supabase.rpc("settle_payment_financials", {
    _payment_id: paymentId,
    _provider: provider,
    _provider_reference: providerReference ?? null,
  });
  if (error) {
    console.error("[settle_payment_financials] failed:", paymentId, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, result: data };
}
