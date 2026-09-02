import { describe, it, expect } from "vitest";
import { classifyRegistrationError } from "@/lib/registration-errors";

/**
 * The database raises these exact messages from
 * `enforce_driver_address_required` / `enforce_profile_address_rules`.
 */
describe("classifyRegistrationError — home address", () => {
  it("explains a missing driver address", () => {
    const e = classifyRegistrationError({
      message: "A home address is required for driver registrations",
      code: "23514",
    });
    expect(e.title).toMatch(/required for drivers/i);
    expect(e.fields).toEqual(["Home address"]);
    expect(e.isFixableByUser).toBe(true);
  });

  it("explains an address that is too short", () => {
    const e = classifyRegistrationError({
      message: "Home address must be at least 5 characters",
      code: "23514",
    });
    expect(e.title).toMatch(/too short/i);
    expect(e.fixSteps.join(" ")).toMatch(/house\/apartment number/i);
  });

  it("explains an address that is too long", () => {
    const e = classifyRegistrationError({
      message: "Home address must be 200 characters or fewer",
      code: "23514",
    });
    expect(e.title).toMatch(/too long/i);
    expect(e.fixSteps.join(" ")).toMatch(/200 characters/i);
  });

  it("explains a rejected placeholder address", () => {
    const e = classifyRegistrationError({
      message: "Enter your real residential address — placeholders are rejected.",
      code: "23514",
    });
    expect(e.title).toMatch(/real home address/i);
  });

  it("routes NOT NULL violations on street_address to the address message", () => {
    const e = classifyRegistrationError({
      message: 'null value in column "street_address" violates not-null constraint',
      code: "23502",
    });
    expect(e.fields).toEqual(["Home address"]);
  });
});
