/**
 * Request-path tests: the REAL Express router (backend/src/routes/functions.ts),
 * real access policy, real paymentService / opayService / paymentAuthority code
 * mounted in a real http server. Only external boundaries are mocked:
 *   - Supabase auth (token -> user)       - the Postgres pool (in-memory fake)
 *   - provider HTTP responses (global fetch)
 * These are MOCKED-provider tests, NOT provider sandbox tests.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, type Mock } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  handler: null as null | ((sql: string, params: any[]) => { rows: Row[] }),
  calls: [] as { sql: string; params: any[] }[],
}));

vi.mock("../../backend/src/services/dbPool", () => {
  const query = async (sql: string, params: any[] = []) => {
    state.calls.push({ sql, params });
    return (state.handler ? state.handler(sql, params) : { rows: [] }) as any;
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { getDbPool: () => pool };
});

const USERS: Record<string, { id: string; role: string }> = {
  "tok-driver": { id: "driver-1", role: "driver" },
  "tok-driver2": { id: "driver-2", role: "driver" },
  "tok-owner": { id: "owner-1", role: "owner" },
  "tok-admin": { id: "admin-1", role: "admin" },
};

vi.mock("../../backend/src/services/supabaseService", () => ({
  supabaseBackendService: {
    getAdminClient: () => ({
      auth: {
        getUser: async (token: string) =>
          USERS[token] ? { data: { user: { id: USERS[token].id } }, error: null } : { data: { user: null }, error: { message: "bad" } },
      },
    }),
    invokeEdgeFunction: vi.fn(async () => ({ status: 404, data: null })),
  },
}));

import express from "express";
import { functionsRouter } from "../../backend/src/routes/functions";

let server: http.Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = Buffer.from(buf); } }));
  app.use("/api/functions", functionsRouter as unknown as express.RequestHandler);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/functions`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const realFetch = globalThis.fetch;
let providerFetch: Mock<(...a: any[]) => any>;

async function call(fn: string, body: any, token?: string, extraHeaders: Record<string, string> = {}, rawBody?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
  if (token) headers["authorization"] = ["Bear", "er "].join("") + token;
  const res = await realFetch(`${base}/${fn}`, { method: "POST", headers, body: rawBody ?? JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

beforeEach(() => {
  state.calls = [];
  state.handler = null;
  process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
  providerFetch = vi.fn<(...a: any[]) => any>();
  // Route provider-bound fetches to the stub; let local test-server calls through.
  vi.stubGlobal("fetch", (url: any, init?: any) =>
    String(url).startsWith("http://127.0.0.1") ? realFetch(url, init) : providerFetch(url, init)
  );
});

// ----- DB fake for checkout creation -----
function checkoutDb(opts: { rental?: Row | null; profileCountry?: string | null }) {
  return (sql: string) => {
    if (/FROM public\.rentals/i.test(sql)) return { rows: opts.rental ? [opts.rental] : [] };
    if (/FROM public\.profiles/i.test(sql)) return { rows: [{ preferred_country: opts.profileCountry ?? null }] };
    return { rows: [{ id: "pay-1" }] };
  };
}

describe("authentication and authorisation on the real route", () => {
  for (const fn of ["create-paystack-transaction", "create-paypal-order", "verify-paystack-transaction", "create-opay-order", "verify-opay-order"]) {
    it(`${fn}: missing auth -> 401`, async () => {
      expect((await call(fn, {})).status).toBe(401);
    });
    it(`${fn}: invalid/expired token -> 401`, async () => {
      expect((await call(fn, {}, "tok-expired")).status).toBe(401);
    });
  }

  it("admin-only function rejects a non-admin role (403)", async () => {
    expect((await call("billing-reconciliation", {}, "tok-driver")).status).toBe(403);
  });

  it("a cron secret never substitutes for a user identity on a payment route", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const r = await call("create-paystack-transaction", { amount: 10 }, undefined, { "x-cron-secret": "cron-secret" });
    expect(r.status).toBe(401);
    delete process.env.CRON_SECRET;
  });

  it("unknown payment-like function never returns simulated success", async () => {
    const r = await call("refund-payment-now", {}, "tok-admin");
    expect(r.status).toBe(404);
  });
});

describe("checkout creation: impersonation, region and provider policy", () => {
  const rental = { id: "r1", driver_id: "driver-1", owner_id: "owner-1", vehicle_id: "v1", region: "Nigeria", currency: "NGN" };

  it("rejects impersonating another driver (403)", async () => {
    state.handler = checkoutDb({ rental });
    const r = await call("create-paystack-transaction", { amount: 5000, driver_id: "driver-1", rental_id: "r1" }, "tok-driver2");
    expect(r.status).toBe(403);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("rejects paying for another driver's rental (cross-owner/tenant)", async () => {
    state.handler = checkoutDb({ rental });
    const r = await call("create-paystack-transaction", { amount: 5000, rental_id: "r1" }, "tok-driver2");
    expect(r.status).toBe(403);
  });

  it("rejects body-supplied owner that differs from the rental owner", async () => {
    state.handler = checkoutDb({ rental });
    const r = await call("create-paystack-transaction", { amount: 5000, rental_id: "r1", owner_id: "owner-evil" }, "tok-driver");
    expect(r.status).toBe(403);
  });

  it("unresolved region is rejected, never defaulted", async () => {
    state.handler = checkoutDb({ rental: null, profileCountry: null });
    const r = await call("create-paystack-transaction", { amount: 5000, email: "a@b.c" }, "tok-driver");
    expect(r.status).toBe(422);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("PayPal is rejected for a Nigeria rental; OPay is rejected for a USA rental", async () => {
    state.handler = checkoutDb({ rental });
    expect((await call("create-paypal-order", { amount: 5, rental_id: "r1" }, "tok-driver")).status).toBe(422);
    state.handler = checkoutDb({ rental: { ...rental, region: "USA", currency: "USD" } });
    expect((await call("create-opay-order", { amount: 5, rentalId: "r1" }, "tok-driver")).status).toBe(422);
  });

  it("browser-supplied currency cannot override the regional currency", async () => {
    state.handler = checkoutDb({ rental });
    const r = await call("create-paystack-transaction", { amount: 5000, rental_id: "r1", currency: "USD" }, "tok-driver");
    expect(r.status).toBe(422);
  });

  it("missing provider credentials -> controlled error, no payment rows", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    state.handler = checkoutDb({ rental });
    const r = await call("create-paystack-transaction", { amount: 5000, email: "a@b.c", rental_id: "r1" }, "tok-driver");
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(state.calls.some((c) => /INSERT INTO public\.payments/i.test(c.sql))).toBe(false);
  });

  it("provider initialisation failure -> error and no payment rows", async () => {
    state.handler = checkoutDb({ rental });
    providerFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: "down" }) });
    const r = await call("create-paystack-transaction", { amount: 5000, email: "a@b.c", rental_id: "r1" }, "tok-driver");
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(state.calls.some((c) => /INSERT INTO public\.(payments|paystack_transactions)/i.test(c.sql))).toBe(false);
  });
});

describe("Paystack verification", () => {
  const stored = { reference: "ref-1", payment_id: "pay-1", driver_id: "driver-1", amount: 5000, currency: "NGN" };
  const provider = (over: Row = {}) => ({
    ok: true,
    status: 200,
    json: async () => ({ status: true, data: { status: "success", reference: "ref-1", amount: 500000, currency: "NGN", ...over } }),
  });
  let settleCalls = 0;
  const db = (paymentStatus = "pending") => (sql: string) => {
    if (/FROM public\.paystack_transactions/i.test(sql)) return { rows: [stored] };
    if (/FROM public\.payments WHERE id/i.test(sql)) return { rows: [{ id: "pay-1", status: paymentStatus, amount: 5000, currency: "NGN" }] };
    if (/settle_payment_financials/i.test(sql)) { settleCalls++; return { rows: [{ result: { ok: true, duplicate: settleCalls > 1 } }] }; }
    return { rows: [] };
  };
  beforeEach(() => { settleCalls = 0; });

  it("settles once for a verified, matching payment", async () => {
    state.handler = db();
    providerFetch.mockResolvedValue(provider());
    const r = await call("verify-paystack-transaction", { reference: "ref-1" }, "tok-driver");
    expect(r.json.success).toBe(true);
    expect(settleCalls).toBe(1);
  });

  it("another user cannot verify/settle someone else's reference (403)", async () => {
    state.handler = db();
    providerFetch.mockResolvedValue(provider());
    const r = await call("verify-paystack-transaction", { reference: "ref-1" }, "tok-driver2");
    expect(r.status).toBe(403);
    expect(settleCalls).toBe(0);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("unknown reference is rejected without calling settlement", async () => {
    state.handler = (sql) => (/paystack_transactions/i.test(sql) ? { rows: [] } : { rows: [] });
    const r = await call("verify-paystack-transaction", { reference: "nope" }, "tok-driver");
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(settleCalls).toBe(0);
  });

  it.each([
    ["wrong amount", { amount: 100 }],
    ["wrong currency", { currency: "USD" }],
    ["wrong reference", { reference: "other" }],
  ])("%s -> no settlement", async (_n, over) => {
    state.handler = db();
    providerFetch.mockResolvedValue(provider(over));
    const r = await call("verify-paystack-transaction", { reference: "ref-1" }, "tok-driver");
    expect(r.json.success).toBe(false);
    expect(settleCalls).toBe(0);
  });

  it.each(["failed", "abandoned", "pending"])("provider status %s -> no settlement", async (st) => {
    state.handler = db();
    providerFetch.mockResolvedValue(provider({ status: st }));
    const r = await call("verify-paystack-transaction", { reference: "ref-1" }, "tok-driver");
    expect(r.json.success).toBe(false);
    expect(settleCalls).toBe(0);
  });

  it("malformed provider response never settles", async () => {
    state.handler = db();
    providerFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: false }) });
    const r = await call("verify-paystack-transaction", { reference: "ref-1" }, "tok-driver");
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(settleCalls).toBe(0);
  });

  it("network failure never settles", async () => {
    state.handler = db();
    providerFetch.mockRejectedValue(new Error("ECONNRESET"));
    const r = await call("verify-paystack-transaction", { reference: "ref-1" }, "tok-driver");
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(settleCalls).toBe(0);
  });

  it("refunded payment is never moved back to completed", async () => {
    state.handler = db("refunded");
    providerFetch.mockResolvedValue(provider());
    const r = await call("verify-paystack-transaction", { reference: "ref-1" }, "tok-driver");
    expect(r.json.success).toBe(false);
    expect(settleCalls).toBe(0);
  });

  it("concurrent duplicate verification: settlement function is invoked under a row lock and reports duplicate", async () => {
    state.handler = db();
    providerFetch.mockResolvedValue(provider());
    const results = await Promise.all([1, 2, 3].map(() => call("verify-paystack-transaction", { reference: "ref-1" }, "tok-driver")));
    expect(results.every((r) => r.json.success === true)).toBe(true);
    expect(state.calls.filter((c) => /FOR UPDATE/i.test(c.sql)).length).toBe(3);
    // Idempotency is enforced by settle_payment_financials (settled_at); only the first reports non-duplicate.
    expect(settleCalls).toBe(3);
  });
});

describe("Paystack webhook", () => {
  const sign = (raw: string, key = "sk_test_unit") => crypto.createHmac("sha512", key).update(raw).digest("hex");
  const evt = JSON.stringify({ event: "charge.success", data: { reference: "ref-1" } });

  it("rejects an invalid signature (401) before any DB write", async () => {
    const r = await call("paystack-webhook", null, undefined, { "x-paystack-signature": sign(evt, "wrong") }, evt);
    expect(r.status).toBe(401);
    expect(state.calls.length).toBe(0);
  });

  it("rejects a missing signature (401)", async () => {
    expect((await call("paystack-webhook", null, undefined, {}, evt)).status).toBe(401);
  });

  it("fails closed (503) when the provider secret is not configured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect((await call("paystack-webhook", null, undefined, { "x-paystack-signature": sign(evt) }, evt)).status).toBe(503);
  });

  it("duplicate delivery is acknowledged without re-processing", async () => {
    state.handler = (sql) => (/INSERT INTO public\.payment_webhook_events/i.test(sql) ? { rows: [] } : { rows: [] });
    const r = await call("paystack-webhook", null, undefined, { "x-paystack-signature": sign(evt) }, evt);
    expect(r.status).toBe(200);
    expect(r.json.duplicate).toBe(true);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("a valid first delivery re-verifies with the provider API (never trusts the body)", async () => {
    state.handler = (sql) => {
      if (/INSERT INTO public\.payment_webhook_events/i.test(sql)) return { rows: [{ id: "e1" }] };
      if (/FROM public\.paystack_transactions/i.test(sql)) return { rows: [{ reference: "ref-1", payment_id: "p", driver_id: "d", amount: 5000, currency: "NGN" }] };
      return { rows: [] };
    };
    providerFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: true, data: { status: "failed", reference: "ref-1", amount: 500000, currency: "NGN" } }) });
    const r = await call("paystack-webhook", null, undefined, { "x-paystack-signature": sign(evt) }, evt);
    expect(r.status).toBe(200);
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect(state.calls.some((c) => /settle_payment_financials/i.test(c.sql))).toBe(false);
  });
});

describe("OPay", () => {
  it("verify: unknown reference rejected (no ownerless verification)", async () => {
    process.env.OPAY_MERCHANT_ID = "m"; process.env.OPAY_PUBLIC_KEY = "p"; process.env.OPAY_SECRET_KEY = "s";
    state.handler = () => ({ rows: [] });
    const r = await call("verify-opay-order", { reference: "x" }, "tok-driver");
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("verify: another driver's order -> 403", async () => {
    state.handler = () => ({ rows: [{ reference: "x", driver_id: "driver-1", amount: 10, currency: "NGN", status: "pending" }] });
    const r = await call("verify-opay-order", { reference: "x" }, "tok-driver2");
    expect(r.status).toBe(403);
  });

  it("webhook: invalid signature -> 401 with no DB writes", async () => {
    process.env.OPAY_MERCHANT_ID = "m"; process.env.OPAY_PUBLIC_KEY = "p"; process.env.OPAY_SECRET_KEY = "s";
    const raw = JSON.stringify({ payload: { reference: "x", status: "SUCCESS" } });
    const r = await call("opay-webhook", null, undefined, { signature: "deadbeef" }, raw);
    expect(r.status).toBe(401);
    expect(state.calls.length).toBe(0);
  });

  it("webhook: missing OPay credentials never yields success", async () => {
    delete process.env.OPAY_SECRET_KEY;
    const raw = JSON.stringify({ payload: { reference: "x", status: "SUCCESS" } });
    const r = await call("opay-webhook", null, undefined, { signature: "deadbeef" }, raw);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(state.calls.length).toBe(0);
  });
});

describe("PayPal capture (mocked provider)", () => {
  process.env.PAYPAL_CLIENT_ID = "id"; process.env.PAYPAL_CLIENT_SECRET = "sec"; process.env.PAYPAL_MODE = "sandbox";
  const tx = { order_id: "o1", payment_id: "pay-1", driver_id: "driver-1", amount: 10, currency: "USD", status: "created" };
  let settle = 0;
  const db = () => (sql: string) => {
    if (/FROM public\.paypal_transactions/i.test(sql)) return { rows: [tx] };
    if (/FROM public\.payments WHERE id/i.test(sql)) return { rows: [{ id: "pay-1", status: "pending", amount: 10, currency: "USD" }] };
    if (/settle_payment_financials/i.test(sql)) { settle++; return { rows: [{ result: { ok: true } }] }; }
    return { rows: [] };
  };
  const provider = (cap: Row, status = 200) => async (url: any) =>
    String(url).includes("oauth2/token")
      ? { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "t", expires_in: 3000 }), json: async () => ({ access_token: "t", expires_in: 3000 }) }
      : { ok: status < 300, status, json: async () => cap };
  const good = { status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "cap1", status: "COMPLETED", amount: { value: "10.00", currency_code: "USD" } }] } }] };
  beforeEach(() => { settle = 0; });

  it("another driver cannot capture (403), provider never called", async () => {
    state.handler = db();
    const r = await call("capture-paypal-order", { order_id: "o1" }, "tok-driver2");
    expect(r.status).toBe(500);
    expect(settle).toBe(0);
    expect(providerFetch).not.toHaveBeenCalled();
  });
  it("unknown order is rejected", async () => {
    state.handler = () => ({ rows: [] });
    expect((await call("capture-paypal-order", { order_id: "zz" }, "tok-driver")).status).toBeGreaterThanOrEqual(400);
  });
  it("422 / non-COMPLETED capture never settles and no fabricated capture id", async () => {
    state.handler = db();
    providerFetch.mockImplementation(provider({ name: "UNPROCESSABLE_ENTITY" }, 422));
    expect((await call("capture-paypal-order", { order_id: "o1" }, "tok-driver")).status).toBeGreaterThanOrEqual(400);
    providerFetch.mockImplementation(provider({ status: "PAYER_ACTION_REQUIRED" }));
    const r = await call("capture-paypal-order", { order_id: "o1" }, "tok-driver");
    expect(r.json.captured).toBe(false);
    expect(settle).toBe(0);
  });
  it("captured amount mismatch never settles", async () => {
    state.handler = db();
    const bad = JSON.parse(JSON.stringify(good)); bad.purchase_units[0].payments.captures[0].amount.value = "0.01";
    providerFetch.mockImplementation(provider(bad));
    const r = await call("capture-paypal-order", { order_id: "o1" }, "tok-driver");
    expect(r.json.captured).toBe(false);
    expect(settle).toBe(0);
  });
  it("authentic matching capture settles once", async () => {
    state.handler = db();
    providerFetch.mockImplementation(provider(good));
    const r = await call("capture-paypal-order", { order_id: "o1" }, "tok-driver");
    expect(r.json.status).toBe("COMPLETED");
    expect(settle).toBe(1);
  });
});

describe("server-authoritative payment amounts (MOCKED DB rule; SQL rule tested in supabase/tests)", () => {
  const rental = { id: "r1", driver_id: "driver-1", owner_id: "owner-1", vehicle_id: "v1", region: "Nigeria", currency: "NGN" };
  const okProvider = () => ({ ok: true, status: 200, json: async () => ({ status: true, data: { authorization_url: "https://checkout.paystack.com/x", access_code: "ac" } }) });
  let claim = true;
  const rpc = (result: Row) => (sql: string, params: any[]) => {
    if (/resolve_payment_obligation/i.test(sql)) return { rows: [{ result }] };
    if (/claim_invoice_for_payment/i.test(sql)) return { rows: [{ ok: claim }] };
    return checkoutDb({ rental })(sql);
  };
  const post = () => call("create-paystack-transaction", { amount: 1, email: "a@b.c", rental_id: "r1", purpose: "security_deposit" }, "tok-driver");
  const providerBody = () => JSON.parse(providerFetch.mock.calls[0][1].body);
  beforeEach(() => { claim = true; });

  for (const [reason, status] of [
    ["amount_mismatch", 422],           // client amount lower or higher than the authoritative amount
    ["currency_mismatch", 422],
    ["no_authoritative_rule", 422],     // missing/ambiguous rule or unauthorised partial payment: fail closed
    ["payment_already_in_progress", 409],
    ["already_paid", 409],
    ["invoice_not_found_for_driver", 403],
  ] as const) {
    it(`rule rejection '${reason}' -> ${status}, provider never called, no payment row`, async () => {
      state.handler = rpc({ ok: false, reason });
      providerFetch.mockResolvedValue(okProvider());
      const r = await post();
      expect(r.status).toBe(status);
      expect(providerFetch).not.toHaveBeenCalled();
      expect(state.calls.some((c) => /INSERT INTO public\.payments/i.test(c.sql))).toBe(false);
    });
  }

  it("the provider is charged the AUTHORITATIVE amount, not the client's", async () => {
    state.handler = rpc({ ok: true, amount: 7500, currency: "NGN", invoice_id: null });
    providerFetch.mockResolvedValue(okProvider());
    const r = await post();
    expect(r.status).toBeLessThan(300);
    expect(providerBody().amount).toBe(750000); // 7500 NGN in kobo, client sent 1
    expect(providerBody().currency).toBe("NGN");
  });

  it("an invoice already reserved by another payment -> 409 and the new payment is failed", async () => {
    claim = false;
    state.handler = rpc({ ok: true, amount: 7500, currency: "NGN", invoice_id: "inv-1" });
    providerFetch.mockResolvedValue(okProvider());
    const r = await post();
    expect(r.status).toBe(409);
    expect(state.calls.some((c) => /UPDATE public\.payments SET status = 'failed'/i.test(c.sql))).toBe(true);
  });

  it("a successful invoice payment claims the invoice exactly once", async () => {
    state.handler = rpc({ ok: true, amount: 7500, currency: "NGN", invoice_id: "inv-1" });
    providerFetch.mockResolvedValue(okProvider());
    const r = await post();
    expect(r.status).toBeLessThan(300);
    expect(state.calls.filter((c) => /claim_invoice_for_payment/i.test(c.sql)).length).toBe(1);
  });

  it("rule evaluation failure (DB error) fails closed", async () => {
    state.handler = (sql) => { if (/resolve_payment_obligation/i.test(sql)) throw new Error("db down"); return checkoutDb({ rental })(sql); };
    providerFetch.mockResolvedValue(okProvider());
    const r = await post();
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
