import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../../backend/src/services/dbPool", () => ({ getDbPool: () => db }));

import { paymentService } from "../../../backend/src/services/paymentService";
import { resolveCheckoutAuthority } from "../../../backend/src/services/paymentAuthority";
import { reconcileProviderOutcome } from "../../../backend/src/services/ownerPayoutWorkflow";
import { handleEdgeFunction } from "../../server/functionsHandler";

const ownerId = "11111111-1111-1111-1111-111111111111";
const accountId = "22222222-2222-2222-2222-222222222222";
const authorizationId = "33333333-3333-3333-3333-333333333333";
const payoutId = "44444444-4444-4444-4444-444444444444";
const request = {
  owner_id: ownerId,
  payout_account_id: accountId,
  authorization_id: authorizationId,
  idempotency_key: `owner-withdrawal:${authorizationId}`,
  amount: 10,
  currency: "NGN",
  provider: "paystack" as const,
};

beforeEach(() => {
  db.query.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("owner payout authority", () => {
  it("rejects a missing authorization without touching the database", async () => {
    await expect(paymentService.processOwnerPayout({ ...request, authorization_id: "" }))
      .rejects.toThrow("authorization");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects an unverified phone before creating a withdrawal", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ verified: false }] });
    await expect(paymentService.processOwnerPayout(request))
      .rejects.toThrow("Verify your phone");
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("does not contact the provider when the database rejects the withdrawal", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ verified: true }] });
    db.query.mockResolvedValueOnce({
      rows: [{ result: { ok: false, code: "insufficient_balance", error: "Insufficient balance" } }],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(paymentService.processOwnerPayout(request)).rejects.toThrow("Insufficient balance");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit a second transfer after a provider timeout", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "test-secret");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network timeout"));
    vi.stubGlobal("fetch", fetchMock);
    let claimed = false;
    let reconciliation = false;
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT EXISTS")) return { rows: [{ verified: true }] };
      if (sql.includes("create_owner_self_withdrawal")) return { rows: [{ result: {
        ok: true, payout_id: payoutId, transfer_reference: "payout-reference",
        status: "authorized", duplicate: claimed,
      } }] };
      if (sql.includes("SELECT p.*")) return { rows: [{
        id: payoutId, provider: "paystack", status: claimed ? "processing" : "authorized",
        amount: 10, currency: "NGN", recipient_code: "recipient",
        transfer_reference: "payout-reference", reconciliation_required: reconciliation,
      }] };
      if (sql.includes("claim_owner_payout_provider_attempt")) {
        claimed = true;
        return { rows: [{ result: { claimed: true } }] };
      }
      if (sql.includes("mark_owner_payout_reconciliation_required")) {
        reconciliation = true;
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    expect(await paymentService.processOwnerPayout(request)).toMatchObject({
      submitted: false, awaiting_reconciliation: true,
    });
    expect(await paymentService.processOwnerPayout(request)).toMatchObject({
      duplicate: true, awaiting_reconciliation: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("flags mismatched provider evidence without finalizing the payout", async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      id: payoutId, provider: "paystack", amount: 10, currency: "NGN",
    }] }).mockResolvedValueOnce({ rows: [] });
    const result = await reconcileProviderOutcome({
      provider: "paystack", references: ["payout-reference"], outcome: "settled",
      reportedAmount: 9, reportedCurrency: "NGN", evidence: { source: "paystack_verify" },
    });
    expect(result).toMatchObject({ matched: true, applied: false, reason: "amount/currency mismatch" });
    expect(db.query.mock.calls[1][0]).toContain("mark_owner_payout_reconciliation_required");
    expect(db.query.mock.calls.some(([sql]) => sql.includes("finalize_owner_payout"))).toBe(false);
  });
});

describe("legacy payment dispatcher", () => {
  it.each([
    "create-paypal-order", "capture-paypal-order", "paypal-webhook",
    "create-paystack-transaction", "verify-paystack-transaction", "paystack-webhook",
    "create-opay-order", "verify-opay-order", "opay-webhook",
    "process-owner-payouts", "initiate-paypal-payout", "initiate-paystack-transfer",
    "owner-withdrawal-data", "initiate-owner-withdrawal", "activate-subscription",
  ])("does not process or acknowledge %s", async (name) => {
    const result = await handleEdgeFunction(name, { body: { amount: 1 } });
    expect(result.status).toBe(503);
    expect(result.data.ok).toBe(false);
  });
});

describe("checkout authority", () => {
  it("does not accept a caller-supplied currency when no authoritative currency exists", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ preferred_country: "Ghana" }] });
    await expect(resolveCheckoutAuthority(db as never, {
      caller: { userId: ownerId },
      provider: "paystack",
      body: { currency: "GHS" },
    })).rejects.toThrow("Currency could not be resolved");
  });

  it("uses the rental's local currency for Paystack", async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      id: "rental", driver_id: ownerId, owner_id: "owner", vehicle_id: "vehicle",
      region: "Ghana", currency: "GHS",
    }] });
    await expect(resolveCheckoutAuthority(db as never, {
      caller: { userId: ownerId },
      provider: "paystack",
      body: { rental_id: "rental", currency: "GHS" },
    })).resolves.toMatchObject({ currency: "GHS", driverId: ownerId, ownerId: "owner" });
  });

  it("does not allow Paystack metadata to replace authoritative counterparties", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: true, data: { authorization_url: "https://example.test/checkout", access_code: "code" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    db.query.mockResolvedValueOnce({ rows: [{ id: "payment" }] }).mockResolvedValueOnce({ rows: [] });
    await paymentService.createPaystackTransaction({
      amount: 10, currency: "GHS", email: "driver@example.test", driver_id: "driver",
      owner_id: "owner", vehicle_id: "vehicle", rental_id: "rental",
      metadata: { driver_id: "attacker", owner_id: "attacker", rental_id: "other" },
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.currency).toBe("GHS");
    expect(body.metadata).toMatchObject({
      driver_id: "driver", owner_id: "owner", vehicle_id: "vehicle", rental_id: "rental",
    });
  });

  describe("Paystack webhook authentication", () => {
    it("rejects an invalid signature before recording an event", async () => {
      vi.stubEnv("PAYSTACK_SECRET_KEY", "test-secret");
      const raw = JSON.stringify({ event: "charge.success", data: { reference: "ref" } });
      await expect(paymentService.handlePaystackWebhook({ "x-paystack-signature": "bad" }, raw))
        .rejects.toThrow("signature");
      expect(db.query).not.toHaveBeenCalled();
    });

    it("acknowledges a verified duplicate without invoking settlement", async () => {
      vi.stubEnv("PAYSTACK_SECRET_KEY", "test-secret");
      const raw = JSON.stringify({ event: "charge.success", data: { reference: "ref" } });
      const signature = createHmac("sha512", "test-secret").update(raw).digest("hex");
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(paymentService.handlePaystackWebhook({ "x-paystack-signature": signature }, raw))
        .resolves.toEqual({ received: true, duplicate: true });
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
});
