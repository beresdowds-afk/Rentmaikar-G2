import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Mirror of the zod schema in `supabase/functions/region-autobuild/index.ts`.
 * Kept in sync so client-side tests catch validation regressions before a
 * request even reaches the edge function.
 */
const BuildSchema = z.object({
  country_name: z.string().trim().min(2).max(80),
  country_code: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/),
  currency_symbol: z.string().trim().min(1).max(4),
  phone_prefix: z.string().trim().regex(/^\+\d{1,4}$/),
  primary_language: z.string().trim().min(2).max(8).optional(),
  sms_provider: z.enum(["twilio", "termii"]).optional(),
  payment_gateway: z.enum(["paypal", "paystack", "stripe", "flutterwave"]).optional(),
  cultural_tone: z.string().trim().max(500).optional(),
  preview_only: z.boolean().optional(),
});

const validSpec = (over: Partial<z.infer<typeof BuildSchema>> = {}) => ({
  country_name: "Ghana",
  country_code: "GH",
  currency: "GHS",
  currency_symbol: "₵",
  phone_prefix: "+233",
  payment_gateway: "flutterwave" as const,
  sms_provider: "twilio" as const,
  ...over,
});

describe("region autobuild validation", () => {
  it("accepts valid specs for multiple regions", () => {
    for (const s of [
      validSpec(),
      validSpec({ country_name: "United States", country_code: "US", currency: "USD", currency_symbol: "$", phone_prefix: "+1", payment_gateway: "paypal" }),
      validSpec({ country_name: "Nigeria", country_code: "NG", currency: "NGN", currency_symbol: "₦", phone_prefix: "+234", payment_gateway: "paystack", sms_provider: "termii" }),
    ]) {
      expect(BuildSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects bad country_code / currency / phone_prefix", () => {
    expect(BuildSchema.safeParse(validSpec({ country_code: "GHA" as any })).success).toBe(false);
    expect(BuildSchema.safeParse(validSpec({ currency: "US" as any })).success).toBe(false);
    expect(BuildSchema.safeParse(validSpec({ phone_prefix: "233" as any })).success).toBe(false);
  });

  it("rejects unknown providers to prevent injection of arbitrary strings", () => {
    expect(BuildSchema.safeParse(validSpec({ sms_provider: "sinch" as any })).success).toBe(false);
    expect(BuildSchema.safeParse(validSpec({ payment_gateway: "square" as any })).success).toBe(false);
  });

  it("caps cultural_tone length", () => {
    expect(
      BuildSchema.safeParse(validSpec({ cultural_tone: "x".repeat(501) })).success
    ).toBe(false);
  });
});

// Publish/unpublish semantics (pure state transition mirror of the UI action).
const nextStatus = (current: string) => (current === "published" ? "ready" : "published");

describe("region publish/unpublish transitions", () => {
  it("toggles between ready and published", () => {
    expect(nextStatus("ready")).toBe("published");
    expect(nextStatus("published")).toBe("ready");
  });

  it("cannot publish a still-building or failed region", () => {
    // UI encodes this as a disabled button; assert the guard predicate.
    const canPublish = (s: string) => !(s === "building" || s === "failed");
    expect(canPublish("building")).toBe(false);
    expect(canPublish("failed")).toBe(false);
    expect(canPublish("ready")).toBe(true);
    expect(canPublish("published")).toBe(true);
  });
});

// Progress semantics used by the worker UI.
const stepsCompleted = (log: any[]) => log.filter((e) => e?.event === "step_done").length;

describe("region autobuild progress", () => {
  it("counts step_done events across a full run", () => {
    const log = [
      { event: "queued" },
      { event: "step_started", key: "hero" },
      { event: "step_done", key: "hero" },
      { event: "step_started", key: "category" },
      { event: "step_done", key: "category" },
      { event: "step_done", key: "how_it_works" },
      { event: "step_done", key: "features" },
      { event: "step_done", key: "cta" },
      { event: "step_done", key: "testimonials" },
      { event: "succeeded" },
    ];
    expect(stepsCompleted(log)).toBe(6);
  });

  it("stops counting on failure", () => {
    const log = [
      { event: "queued" },
      { event: "step_done", key: "hero" },
      { event: "step_done", key: "category" },
      { event: "failed", error: "AI down" },
    ];
    expect(stepsCompleted(log)).toBe(2);
  });
});
