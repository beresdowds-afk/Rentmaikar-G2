import { describe, it, expect } from "vitest";
import { amountsMatch } from "../../supabase/functions/_shared/amount-check";

describe("edge amountsMatch (webhook / verify amount+currency gate)", () => {
  it("accepts equal amount and currency (case-insensitive)", () => expect(amountsMatch(5000, "NGN", 5000, "ngn")).toBe(true));
  it("rejects a lower amount", () => expect(amountsMatch(5000, "NGN", 4999.5, "NGN")).toBe(false));
  it("rejects a higher amount", () => expect(amountsMatch(5000, "NGN", 5000.5, "NGN")).toBe(false));
  it("rejects currency mismatch", () => expect(amountsMatch(5000, "NGN", 5000, "USD")).toBe(false));
  it("rejects missing/NaN values (fail closed)", () => {
    expect(amountsMatch(5000, "NGN", undefined, "NGN")).toBe(false);
    expect(amountsMatch(null, "NGN", 5000, "NGN")).toBe(false);
    expect(amountsMatch(5000, "NGN", 5000, undefined)).toBe(false);
  });
  it("tolerates float noise from kobo conversion", () => expect(amountsMatch(10.1, "NGN", 1010 / 100, "NGN")).toBe(true));
});

import { classifyRefund } from "../../supabase/functions/_shared/amount-check";
describe("classifyRefund (ledger safety on provider refund events)", () => {
  it("full refund -> full", () => expect(classifyRefund(5000, 5000)).toBe("full"));
  it("missing refund amount -> full (legacy)", () => expect(classifyRefund(5000, null)).toBe("full"));
  it("partial refund is not auto-applied", () => expect(classifyRefund(5000, 1000)).toBe("partial"));
  it("refund above payment is anomalous", () => expect(classifyRefund(5000, 6000)).toBe("excessive"));
  it("non-numeric/zero is anomalous", () => { expect(classifyRefund(5000, 0)).toBe("excessive"); expect(classifyRefund(NaN, 5)).toBe("excessive"); });
});
