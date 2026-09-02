import { describe, it, expect } from "vitest";
import { getDefaultPSP, getAvailablePSPs, pspLabel } from "@/lib/payment-providers";

describe("payment-providers", () => {
  it("USA defaults to PayPal", () => {
    expect(getDefaultPSP("USA")).toBe("paypal");
  });
  it("Nigeria defaults to Opay", () => {
    expect(getDefaultPSP("Nigeria")).toBe("opay");
  });
  it("region row overrides country fallback", () => {
    expect(getDefaultPSP("USA", { default_payment_gateway: "stripe" })).toBe("stripe");
  });
  it("first entry of payment_gateways array wins when default not set", () => {
    expect(getDefaultPSP("USA", { payment_gateways: ["paystack", "paypal"] })).toBe("paystack");
  });
  it("lists available PSPs per country", () => {
    expect(getAvailablePSPs("Nigeria")).toContain("opay");
    expect(getAvailablePSPs("USA")).toContain("paypal");
  });
  it("labels are human readable", () => {
    expect(pspLabel("opay")).toBe("Opay");
    expect(pspLabel("paypal")).toBe("PayPal");
  });
});
