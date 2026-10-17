import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Array<{ sql: string; params: unknown[] }> = [];
let router: (sql: string, params: unknown[]) => unknown;
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  return { rows: [router(sql, params)] };
});
vi.mock("../../backend/src/services/dbPool", () => ({ getDbPool: () => ({ query }) }));
vi.mock("../../backend/src/services/fileUploadService", () => ({ authenticateCaller: vi.fn() }));

import { paymentService } from "../../backend/src/services/paymentService";

const OWNER = "11111111-1111-4111-8111-111111111111";
const AUTH = "22222222-2222-4222-8222-222222222222";
const ACCT = "33333333-3333-4333-8333-333333333333";
const PAYOUT = "44444444-4444-4444-8444-444444444444";

const request = {
  owner_id: OWNER,
  amount: 50,
  currency: "USD",
  payout_account_id: ACCT,
  authorization_id: AUTH,
  idempotency_key: "owner-withdrawal:abcdef12",
};

const payoutRow = {
  id: PAYOUT, provider: "paypal", amount: "50.00", currency: "USD",
  status: "authorized", transfer_reference: "pyt_ref", paypal_email: "o@example.com",
  provider_attempts: 1, reconciliation_required: false,
};

function sqlWas(fragment: string) {
  return calls.some((c) => c.sql.includes(fragment));
}

let providerCalls: ReturnType<typeof vi.fn>;

beforeEach(() => {
  calls.length = 0;
  query.mockClear();
  providerCalls = vi.fn();
  (paymentService as any).executePayPalPayout = providerCalls;
  router = (sql) => {
    if (sql.includes("create_owner_self_withdrawal")) {
      return { result: { ok: true, duplicate: false, payout_id: PAYOUT, transfer_reference: "pyt_ref", status: "authorized" } };
    }
    if (sql.includes("claim_owner_payout_provider_attempt")) return { result: { claimed: true } };
    if (sql.includes("record_owner_payout_submitted")) return { result: { ok: true, status: "captured" } };
    if (sql.includes("finalize_owner_payout")) return { result: { ok: true, duplicate: false } };
    if (sql.includes("mark_owner_payout_reconciliation_required")) return { result: { ok: true } };
    return { ...payoutRow };
  };
});

describe("PayPal self-withdrawal service flow", () => {
  it("rejects without calling the database or PayPal when authorization is missing", async () => {
    await expect(
      paymentService.processPayPalOwnerPayout({ ...request, authorization_id: "" }),
    ).rejects.toMatchObject({ code: "authorization_required" });
    expect(query).not.toHaveBeenCalled();
    expect(providerCalls).not.toHaveBeenCalled();
  });

  it("success: reserves first, submits once, records submission (captured) and never completes", async () => {
    providerCalls.mockResolvedValue({ batchId: "B1", batchStatus: "PENDING", raw: {} });
    await paymentService.processPayPalOwnerPayout(request);
    expect(providerCalls).toHaveBeenCalledTimes(1);
    const order = calls.map((c) => c.sql);
    const create = order.findIndex((s) => s.includes("create_owner_self_withdrawal"));
    const claim = order.findIndex((s) => s.includes("claim_owner_payout_provider_attempt"));
    const submitted = order.findIndex((s) => s.includes("record_owner_payout_submitted"));
    expect(create).toBeGreaterThanOrEqual(0);
    expect(claim).toBeGreaterThan(create);
    expect(submitted).toBeGreaterThan(claim);
    expect(sqlWas("finalize_owner_payout")).toBe(false);
  });

  it("duplicate request (replay) never reaches PayPal", async () => {
    router = (sql) => {
      if (sql.includes("create_owner_self_withdrawal")) {
        return { result: { ok: true, duplicate: true, payout_id: PAYOUT, transfer_reference: "pyt_ref", status: "captured", provider_attempts: 1 } };
      }
      if (sql.includes("claim_owner_payout_provider_attempt")) return { result: { claimed: false } };
      return { ...payoutRow, status: "captured" };
    };
    await paymentService.processPayPalOwnerPayout(request);
    expect(providerCalls).not.toHaveBeenCalled();
  });

  it("concurrent claim loser never reaches PayPal", async () => {
    router = (sql) => {
      if (sql.includes("create_owner_self_withdrawal")) {
        return { result: { ok: true, duplicate: false, payout_id: PAYOUT, transfer_reference: "pyt_ref", status: "authorized" } };
      }
      if (sql.includes("claim_owner_payout_provider_attempt")) return { result: { claimed: false } };
      return { ...payoutRow };
    };
    await paymentService.processPayPalOwnerPayout(request);
    expect(providerCalls).not.toHaveBeenCalled();
  });

  it("definitive provider rejection releases the reservation exactly once via finalize(failed)", async () => {
    providerCalls.mockRejectedValue(Object.assign(new Error("invalid receiver"), { status: 422 }));
    await expect(paymentService.processPayPalOwnerPayout(request)).rejects.toMatchObject({ code: "provider_rejected" });
    const fin = calls.filter((c) => c.sql.includes("finalize_owner_payout"));
    expect(fin).toHaveLength(1);
    expect(fin[0].params[1]).toBe("failed");
    expect(providerCalls).toHaveBeenCalledTimes(1);
  });

  it("timeout after possible acceptance keeps funds reserved, flags reconciliation and does not retry", async () => {
    providerCalls.mockRejectedValue(new Error("network timeout"));
    await paymentService.processPayPalOwnerPayout(request);
    expect(sqlWas("mark_owner_payout_reconciliation_required")).toBe(true);
    expect(sqlWas("finalize_owner_payout")).toBe(false);
    expect(providerCalls).toHaveBeenCalledTimes(1);
  });

  it("PayPal 5xx is ambiguous: reconciliation, no release", async () => {
    providerCalls.mockRejectedValue(Object.assign(new Error("server error"), { status: 503 }));
    await paymentService.processPayPalOwnerPayout(request);
    expect(sqlWas("mark_owner_payout_reconciliation_required")).toBe(true);
    expect(sqlWas("finalize_owner_payout")).toBe(false);
  });

  it("database failure after provider acceptance never triggers a second transfer", async () => {
    providerCalls.mockResolvedValue({ batchId: "B1", batchStatus: "PENDING", raw: {} });
    const base = router;
    router = (sql, p) => {
      if (sql.includes("record_owner_payout_submitted")) throw new Error("db down");
      return base(sql, p);
    };
    await expect(paymentService.processPayPalOwnerPayout(request)).rejects.toMatchObject({ code: "persistence_failed" });
    expect(providerCalls).toHaveBeenCalledTimes(1);
    expect(sqlWas("mark_owner_payout_reconciliation_required")).toBe(true);
    expect(sqlWas("finalize_owner_payout")).toBe(false);
  });
});

describe("weekly worker execution", () => {
  it("skips a payout that is not an eligible approved weekly payout and never calls a provider", async () => {
    router = (sql) => (sql.includes("claim_weekly_owner_payout") ? { result: { claimed: false } } : { ...payoutRow });
    const out: any = await paymentService.executeWeeklyOwnerPayout(PAYOUT);
    expect(out.skipped).toBe(true);
    expect(providerCalls).not.toHaveBeenCalled();
  });

  it("rejects a malformed payout id without touching the database", async () => {
    await expect(paymentService.executeWeeklyOwnerPayout("nope")).rejects.toMatchObject({ code: "invalid_request" });
    expect(query).not.toHaveBeenCalled();
  });
});
