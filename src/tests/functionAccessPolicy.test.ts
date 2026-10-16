import { describe, it, expect, vi } from "vitest";

vi.mock("../../backend/src/services/fileUploadService", () => ({
  authenticateCaller: vi.fn(async (h: string) => {
    if (h === "tok-admin") return { userId: "a", role: "admin", isAdmin: true };
    if (h === "tok-owner") return { userId: "o", role: "owner", isAdmin: false };
    const e: any = new Error("Unauthorized");
    e.statusCode = 401;
    throw e;
  }),
}));
vi.mock("../../backend/src/services/dbPool", () => ({ getDbPool: () => ({ query: vi.fn() }) }));

import {
  AccessDenied,
  FUNCTION_ACCESS,
  enforceFunctionAccess,
} from "../../backend/src/services/functionAccessPolicy";

const adminOnly = Object.entries(FUNCTION_ACCESS).filter(([, l]) => l === "admin").map(([n]) => n);
const authed = Object.entries(FUNCTION_ACCESS).filter(([, l]) => l === "authenticated").map(([n]) => n);
const cronFns = Object.entries(FUNCTION_ACCESS).filter(([, l]) => l === "cron_or_admin").map(([n]) => n);

describe("function access policy", () => {
  it("covers the privileged functions that previously had no gate", () => {
    for (const n of ["traccar-admin", "iot-admin", "billing-reconciliation", "sarekon-admin", "emqx-secret-rotation", "submit-vehicle-for-review", "create-paypal-order"]) {
      expect(FUNCTION_ACCESS[n]).toBeDefined();
    }
  });

  it.each([...adminOnly, ...authed, ...cronFns])("%s rejects unauthenticated callers (401)", async (fn) => {
    await expect(enforceFunctionAccess(fn, {})).rejects.toMatchObject({ statusCode: 401 });
    await expect(enforceFunctionAccess(fn, { authorization: "tok-bad" })).rejects.toBeInstanceOf(AccessDenied);
  });

  it.each([...adminOnly, ...cronFns])("%s rejects a non-admin owner (403)", async (fn) => {
    await expect(enforceFunctionAccess(fn, { authorization: "tok-owner" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(adminOnly)("%s allows a verified admin", async (fn) => {
    const d = await enforceFunctionAccess(fn, { authorization: "tok-admin" });
    expect(d?.caller?.isAdmin).toBe(true);
  });

  it.each(authed)("%s allows any verified session and returns the token identity", async (fn) => {
    const d = await enforceFunctionAccess(fn, { authorization: "tok-owner" });
    expect(d?.caller?.userId).toBe("o");
  });

  it("scheduled jobs accept only a correct cron secret", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    const d = await enforceFunctionAccess("iot-scheduled-sync", { "x-cron-secret": "s3cret-value" });
    expect(d?.via).toBe("cron");
    await expect(enforceFunctionAccess("iot-scheduled-sync", { "x-cron-secret": "wrong" })).rejects.toMatchObject({ statusCode: 401 });
    delete process.env.CRON_SECRET;
    await expect(enforceFunctionAccess("iot-scheduled-sync", { "x-cron-secret": "s3cret-value" })).rejects.toBeInstanceOf(AccessDenied);
  });

  it("does not gate functions with their own authentication", async () => {
    expect(await enforceFunctionAccess("paypal-webhook", {})).toBeNull();
  });
});
