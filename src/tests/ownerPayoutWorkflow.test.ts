import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("../../backend/src/services/dbPool", () => ({
  getDbPool: () => ({ query }),
}));
vi.mock("../../backend/src/services/fileUploadService", () => ({
  authenticateCaller: vi.fn(async (h: string) => {
    if (h === "******") return { userId: "11111111-1111-4111-8111-111111111111" };
    const e: any = new Error("Unauthorized");
    e.statusCode = 401;
    throw e;
  }),
}));

import {
  PayoutError,
  assertTwoDecimalAmount,
  claimProviderAttempt,
  classifyProviderFailure,
  createSelfWithdrawal,
  mapPayPalItemStatus,
  mapPaystackTransferStatus,
  reconcileProviderOutcome,
  resolveIdempotencyKey,
} from "../../backend/src/services/ownerPayoutWorkflow";
import {
  authenticateSelfWithdrawalCaller,
  verifyCronSecret,
} from "../../backend/src/services/payoutRequestAuth";

const OWNER = "11111111-1111-4111-8111-111111111111";
const AUTH = "22222222-2222-4222-8222-222222222222";
const ACCT = "33333333-3333-4333-8333-333333333333";
const base = {
  ownerId: OWNER,
  authorizationId: AUTH,
  payoutAccountId: ACCT,
  amount: 100,
  currency: "USD",
  provider: "paypal" as const,
  idempotencyKey: "owner-withdrawal:abc12345",
};

beforeEach(() => query.mockReset());

describe("self-withdrawal authorization (server side)", () => {
  it("rejects a missing authorization id before touching the database", async () => {
    await expect(createSelfWithdrawal({ ...base, authorizationId: "" })).rejects.toMatchObject({
      code: "authorization_required",
      statusCode: 428,
    });
    await expect(createSelfWithdrawal({ ...base, authorizationId: "not-a-uuid" })).rejects.toMatchObject({
      code: "authorization_not_found",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["authorization_wrong_owner", 403],
    ["authorization_type_mismatch", 403],
    ["authorization_amount_mismatch", 409],
    ["authorization_currency_mismatch", 409],
    ["authorization_expired", 409],
    ["authorization_not_approved", 409],
    ["insufficient_balance", 409],
    ["idempotency_conflict", 409],
    ["invalid_account", 400],
  ])("maps database rejection %s to HTTP %i", async (code, status) => {
    query.mockResolvedValueOnce({ rows: [{ result: { ok: false, code, error: code } }] });
    const err = (await createSelfWithdrawal(base).catch((e) => e)) as PayoutError;
    expect(err).toBeInstanceOf(PayoutError);
    expect(err.code).toBe(code);
    expect(err.statusCode).toBe(status);
  });

  it("creates through the single atomic SQL function and passes the idempotency key", async () => {
    query.mockResolvedValueOnce({
      rows: [{ result: { ok: true, duplicate: false, payout_id: "p1", transfer_reference: "pyt_x", status: "authorized" } }],
    });
    const out = await createSelfWithdrawal(base);
    expect(out).toMatchObject({ payoutId: "p1", duplicate: false, status: "authorized" });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("create_owner_self_withdrawal");
    expect(query.mock.calls[0][1]).toEqual([OWNER, AUTH, ACCT, 100, "USD", "paypal", base.idempotencyKey]);
  });

  it("returns the existing payout on replay (duplicate) without a second creation", async () => {
    query.mockResolvedValueOnce({
      rows: [{ result: { ok: true, duplicate: true, payout_id: "p1", transfer_reference: "pyt_x", status: "captured", provider_attempts: 1 } }],
    });
    const out = await createSelfWithdrawal(base);
    expect(out.duplicate).toBe(true);
    expect(out.providerAttempts).toBe(1);
  });

  it("provider attempt claim is exclusive", async () => {
    query.mockResolvedValueOnce({ rows: [{ result: { claimed: true } }] });
    query.mockResolvedValueOnce({ rows: [{ result: { claimed: false } }] });
    expect(await claimProviderAttempt("p1")).toBe(true);
    expect(await claimProviderAttempt("p1")).toBe(false);
  });
});

describe("caller authentication", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(authenticateSelfWithdrawalCaller({}, OWNER)).rejects.toMatchObject({ statusCode: 401 });
  });
  it("rejects a body owner different from the caller", async () => {
    await expect(
      authenticateSelfWithdrawalCaller({ authorization: "******" }, "44444444-4444-4444-8444-444444444444"),
    ).rejects.toMatchObject({ code: "forbidden", statusCode: 403 });
  });
  it("uses the authenticated caller as owner", async () => {
    await expect(authenticateSelfWithdrawalCaller({ authorization: "******" }, undefined)).resolves.toEqual({
      ownerId: OWNER,
    });
  });
});

describe("cron secret", () => {
  it("denies when unset, missing or wrong; allows when equal", () => {
    delete process.env.CRON_SECRET;
    expect(verifyCronSecret({ "x-cron-secret": "s3cret" })).toBe(false);
    process.env.CRON_SECRET = "s3cret";
    expect(verifyCronSecret({})).toBe(false);
    expect(verifyCronSecret({ "x-cron-secret": "nope" })).toBe(false);
    expect(verifyCronSecret({ "x-cron-secret": "s3cret" })).toBe(true);
    delete process.env.CRON_SECRET;
  });
});

describe("idempotency key and amount", () => {
  it("accepts either header spelling (worker X-Idempotency-Key and idempotency-key)", () => {
    expect(resolveIdempotencyKey({ "x-idempotency-key": "weekly-payout:abc" }, {})).toBe("weekly-payout:abc");
    expect(resolveIdempotencyKey({ "idempotency-key": "owner-withdrawal:abc" }, {})).toBe("owner-withdrawal:abc");
    expect(resolveIdempotencyKey({}, { idempotencyKey: "body-key-12345" })).toBe("body-key-12345");
  });
  it("rejects missing, short or unsafe keys", () => {
    expect(() => resolveIdempotencyKey({}, {})).toThrow(PayoutError);
    expect(() => resolveIdempotencyKey({ "idempotency-key": "short" }, {})).toThrow(PayoutError);
    expect(() => resolveIdempotencyKey({ "idempotency-key": "bad key with spaces" }, {})).toThrow(PayoutError);
  });
  it("enforces two-decimal precision", () => {
    expect(assertTwoDecimalAmount(10.25)).toBe(10.25);
    expect(() => assertTwoDecimalAmount(10.255)).toThrow(PayoutError);
    expect(() => assertTwoDecimalAmount(-1)).toThrow(PayoutError);
    expect(() => assertTwoDecimalAmount("abc")).toThrow(PayoutError);
  });
});

describe("provider outcome classification (ambiguous vs definitive)", () => {
  it("treats timeouts, network errors and 5xx as ambiguous", () => {
    expect(classifyProviderFailure(new Error("timeout"))).toBe("ambiguous");
    expect(classifyProviderFailure({ status: 500 })).toBe("ambiguous");
    expect(classifyProviderFailure({ status: 408 })).toBe("ambiguous");
    expect(classifyProviderFailure({ status: 429 })).toBe("ambiguous");
    expect(classifyProviderFailure({ ambiguous: true, status: 400 })).toBe("ambiguous");
  });
  it("treats 4xx rejections and not-sent as definitive", () => {
    expect(classifyProviderFailure({ status: 400 })).toBe("definitive");
    expect(classifyProviderFailure({ status: 422 })).toBe("definitive");
    expect(classifyProviderFailure({ notSent: true })).toBe("definitive");
  });
  it("maps provider statuses without treating pending states as final", () => {
    expect(mapPayPalItemStatus("SUCCESS")).toBe("settled");
    expect(mapPayPalItemStatus("PENDING")).toBe("pending");
    expect(mapPayPalItemStatus("UNCLAIMED")).toBe("pending");
    expect(mapPayPalItemStatus("RETURNED")).toBe("reversed");
    expect(mapPayPalItemStatus("FAILED")).toBe("failed");
    expect(mapPaystackTransferStatus("success")).toBe("settled");
    expect(mapPaystackTransferStatus("pending")).toBe("pending");
    expect(mapPaystackTransferStatus("otp")).toBe("pending");
    expect(mapPaystackTransferStatus("transfer.reversed")).toBe("reversed");
  });
});

describe("reconcileProviderOutcome ledger safety", () => {
  const payoutRow = {
    id: "p1", owner_id: OWNER, provider: "paystack", amount: "100.00", currency: "NGN",
    status: "captured", transfer_reference: "pyt_x", transfer_code: "TRF_1",
    workflow_type: "self_withdrawal", provider_attempts: 1, reconciliation_required: false,
  };
  const args = {
    provider: "paystack" as const,
    references: ["pyt_x"],
    outcome: "settled" as const,
    reportedAmount: 100,
    reportedCurrency: "NGN",
    evidence: { event: "transfer.success" },
  };

  it("does not settle an unknown payout", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await reconcileProviderOutcome(args)).toMatchObject({ matched: false, applied: false });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does nothing for non-final provider status", async () => {
    query.mockResolvedValueOnce({ rows: [payoutRow] });
    const r = await reconcileProviderOutcome({ ...args, outcome: "pending" });
    expect(r.applied).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("flags reconciliation instead of settling on amount mismatch", async () => {
    query.mockResolvedValueOnce({ rows: [payoutRow] });
    query.mockResolvedValueOnce({ rows: [{ result: { ok: true } }] });
    const r = await reconcileProviderOutcome({ ...args, reportedAmount: 1 });
    expect(r).toMatchObject({ matched: true, applied: false });
    expect(query.mock.calls[1][0]).toContain("mark_owner_payout_reconciliation_required");
    expect(query.mock.calls.some((c) => String(c[0]).includes("finalize_owner_payout"))).toBe(false);
  });

  it("flags reconciliation on currency mismatch", async () => {
    query.mockResolvedValueOnce({ rows: [payoutRow] });
    query.mockResolvedValueOnce({ rows: [{ result: { ok: true } }] });
    const r = await reconcileProviderOutcome({ ...args, reportedCurrency: "USD" });
    expect(r.applied).toBe(false);
    expect(query.mock.calls.some((c) => String(c[0]).includes("finalize_owner_payout"))).toBe(false);
  });

  it("finalizes through the single idempotent SQL function when evidence matches", async () => {
    query.mockResolvedValueOnce({ rows: [payoutRow] });
    query.mockResolvedValueOnce({ rows: [{ result: { ok: true, duplicate: false } }] });
    const r = await reconcileProviderOutcome(args);
    expect(r).toMatchObject({ matched: true, applied: true, payoutId: "p1" });
    expect(query.mock.calls[1][0]).toContain("finalize_owner_payout");
  });

  it("flags reconciliation when the state transition is rejected (e.g. failure after completion)", async () => {
    query.mockResolvedValueOnce({ rows: [payoutRow] });
    query.mockResolvedValueOnce({ rows: [{ result: { ok: false, error: "invalid transition" } }] });
    query.mockResolvedValueOnce({ rows: [{ result: { ok: true } }] });
    const r = await reconcileProviderOutcome({ ...args, outcome: "failed" });
    expect(r.applied).toBe(false);
    expect(query.mock.calls[2][0]).toContain("mark_owner_payout_reconciliation_required");
  });
});
