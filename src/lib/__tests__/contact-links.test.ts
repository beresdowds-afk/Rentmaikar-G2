import { describe, it, expect } from "vitest";
import {
  normalizeE164Digits,
  toE164,
  isValidE164,
  buildWhatsAppLink,
  buildSmsLink,
} from "@/lib/contact-links";

describe("normalizeE164Digits", () => {
  it("strips formatting from a valid US number", () => {
    expect(normalizeE164Digits("+1 (415) 555-2671")).toBe("14155552671");
  });
  it("strips formatting from a valid Nigerian number", () => {
    expect(normalizeE164Digits("+234 803 123 4567")).toBe("2348031234567");
  });
  it("accepts digits without a leading +", () => {
    expect(normalizeE164Digits("14155552671")).toBe("14155552671");
  });
  it("rejects empty / null / whitespace", () => {
    expect(normalizeE164Digits("")).toBeNull();
    expect(normalizeE164Digits(null)).toBeNull();
    expect(normalizeE164Digits(undefined)).toBeNull();
    expect(normalizeE164Digits("   ")).toBeNull();
  });
  it("rejects numbers that are too short or too long", () => {
    expect(normalizeE164Digits("1234567")).toBeNull(); // 7 digits
    expect(normalizeE164Digits("1234567890123456")).toBeNull(); // 16 digits
  });
  it("rejects numbers starting with 0 (invalid country code)", () => {
    expect(normalizeE164Digits("08031234567")).toBeNull();
  });
});

describe("toE164 / isValidE164", () => {
  it("prefixes + on valid input", () => {
    expect(toE164("14155552671")).toBe("+14155552671");
  });
  it("returns null on invalid input", () => {
    expect(toE164("bad")).toBeNull();
    expect(isValidE164("bad")).toBe(false);
    expect(isValidE164("+14155552671")).toBe(true);
  });
});

describe("buildWhatsAppLink", () => {
  it("builds wa.me link with no + and digits only", () => {
    expect(buildWhatsAppLink("+1 (415) 555-2671")).toBe("https://wa.me/14155552671");
  });
  it("URL-encodes prefilled text", () => {
    const link = buildWhatsAppLink("+14155552671", "Hi Rentmaikar, I'd like to rent a car!");
    expect(link).toBe(
      "https://wa.me/14155552671?text=Hi%20Rentmaikar%2C%20I'd%20like%20to%20rent%20a%20car!",
    );
  });
  it("ignores empty prefill", () => {
    expect(buildWhatsAppLink("+14155552671", "   ")).toBe("https://wa.me/14155552671");
  });
  it("truncates overly long prefill", () => {
    const long = "x".repeat(2000);
    const link = buildWhatsAppLink("+14155552671", long)!;
    // 1000 chars of "x" encoded is still 1000 chars
    expect(link.length).toBe("https://wa.me/14155552671?text=".length + 1000);
  });
  it("returns null on invalid number", () => {
    expect(buildWhatsAppLink("bad", "hi")).toBeNull();
    expect(buildWhatsAppLink("", "hi")).toBeNull();
  });
});

describe("buildSmsLink", () => {
  it("keeps + prefix for cross-device support", () => {
    expect(buildSmsLink("+1 (415) 555-2671")).toBe("sms:+14155552671");
    expect(buildSmsLink("2348031234567")).toBe("sms:+2348031234567");
  });
  it("returns null on invalid number", () => {
    expect(buildSmsLink("bad")).toBeNull();
    expect(buildSmsLink(null)).toBeNull();
  });
});
