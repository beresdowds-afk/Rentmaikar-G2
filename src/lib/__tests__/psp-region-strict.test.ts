import { describe, it, expect } from "vitest";
import { getDefaultPSP, getAvailablePSPs } from "@/lib/payment-providers";
import { renderTemplate, REGION_FIXTURES } from "@/lib/region-templates";

describe("PSP region strictness", () => {
  it("US returns PayPal exclusively as default", () => {
    expect(getDefaultPSP("USA")).toBe("paypal");
    expect(getDefaultPSP("US")).toBe("paypal");
    expect(getDefaultPSP("USA")).not.toBe("opay");
  });

  it("Opay is the default ONLY for Nigeria", () => {
    expect(getDefaultPSP("Nigeria")).toBe("opay");
    expect(getDefaultPSP("NG")).toBe("opay");
    for (const c of ["USA", "US", "GH", "Ghana", "UK", "Kenya"]) {
      expect(getDefaultPSP(c)).not.toBe("opay");
    }
  });

  it("Opay is NOT offered as an option outside Nigeria", () => {
    for (const c of ["USA", "US", "GH", "Ghana", "UK"]) {
      expect(getAvailablePSPs(c)).not.toContain("opay");
    }
    expect(getAvailablePSPs("Nigeria")).toContain("opay");
  });

  it("rendered templates use the region's PSP (US=paypal, NG=opay)", () => {
    const us = renderTemplate("welcome_email", REGION_FIXTURES.USA);
    const ng = renderTemplate("welcome_email", REGION_FIXTURES.Nigeria);
    expect(us.body.toLowerCase()).toContain("paypal");
    expect(us.body.toLowerCase()).not.toContain("opay");
    expect(ng.body.toLowerCase()).toContain("opay");
    expect(ng.body.toLowerCase()).not.toContain("paypal");
  });

  it("payment_reminder and shutdown mention region PSP + currency", () => {
    const us = renderTemplate("payment_reminder", REGION_FIXTURES.USA, { amount: 50 });
    expect(us.body).toContain("$");
    expect(us.body.toLowerCase()).toContain("paypal");

    const ng = renderTemplate("vehicle_shutdown_warning", REGION_FIXTURES.Nigeria, { amount: 5000 });
    expect(ng.body).toContain("₦");
    expect(ng.body.toLowerCase()).toContain("opay");
    expect(ng.body.toLowerCase()).not.toContain("paypal");
  });
});

// Emulates the guard implemented in create-opay-payment/index.ts so we can
// assert its behavior without booting the Deno runtime.
function opayGuard(body: { currency?: string; region_code?: string; country?: string }) {
  const region = (body.region_code ?? body.country ?? "").toUpperCase();
  if (body.currency && body.currency !== "NGN") {
    return { ok: false, status: 400, error: "Opay is only available for Nigeria (NGN)" };
  }
  if (region && !["NG", "NIGERIA"].includes(region)) {
    return { ok: false, status: 403, error: "Opay checkout blocked outside Nigeria" };
  }
  return { ok: true };
}

describe("Opay edge function guard", () => {
  it("accepts NG requests", () => {
    expect(opayGuard({ currency: "NGN", region_code: "NG" }).ok).toBe(true);
  });
  it("rejects non-NGN currency", () => {
    const r = opayGuard({ currency: "USD", region_code: "NG" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
  it("rejects non-NG region even with NGN currency", () => {
    const r = opayGuard({ currency: "NGN", region_code: "US" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });
  it("rejects Ghana", () => {
    expect(opayGuard({ region_code: "GH" }).ok).toBe(false);
  });
});
