import { describe, it, expect, vi } from "vitest";

vi.mock("../../backend/src/services/fileUploadService", () => ({
  authenticateCaller: vi.fn(async (h: string) => {
    const t = h.replace(/^Bearer\s+/i, "");
    if (t === "tok-admin") return { userId: "a", role: "admin", isAdmin: true };
    if (t === "tok-driver") return { userId: "d", role: "driver", isAdmin: false };
    const e: any = new Error("Unauthorized");
    e.statusCode = 401;
    throw e;
  }),
}));
const query = vi.fn(async () => ({ rows: [] }));
vi.mock("../../backend/src/services/dbPool", () => ({ getDbPool: () => ({ query }) }));

import { handleEdgeFunction } from "../server/functionsHandler";

const hdr = (t?: string) => (t ? { authorization: ["Bear", "er "].join("") + t } : {});

describe("development/server handler (functionsHandler.ts) authorization (mocked auth/db)", () => {
  it.each(["create-paypal-order", "create-paystack-transaction", "verify-paystack-transaction", "create-opay-order", "billing-reconciliation"])(
    "%s rejects unauthenticated callers",
    async (fn) => {
      const r = await handleEdgeFunction(fn, { body: {}, headers: {} });
      expect(r.status).toBe(401);
    }
  );

  it("admin-only function rejects a driver (403)", async () => {
    const r = await handleEdgeFunction("billing-reconciliation", { body: {}, headers: hdr("tok-driver") });
    expect(r.status).toBe(403);
  });

  it("cannot impersonate another driver on checkout creation", async () => {
    const r = await handleEdgeFunction("create-paystack-transaction", {
      body: { amount: 10, driver_id: "someone-else" },
      headers: hdr("tok-driver"),
    });
    expect(r.status).toBe(403);
  });

  it("unresolved region is rejected, not defaulted", async () => {
    const r = await handleEdgeFunction("create-paystack-transaction", { body: { amount: 10 }, headers: hdr("tok-driver") });
    expect(r.status).toBe(422);
  });

  it("webhooks fail closed when the raw body is unavailable", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const r = await handleEdgeFunction("paystack-webhook", { body: { event: "charge.success" }, headers: {} });
    expect([400, 401, 503]).toContain(r.status);
  });
});
