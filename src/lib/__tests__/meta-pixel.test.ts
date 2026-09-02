import { describe, it, expect, beforeEach, vi } from "vitest";

describe("meta-pixel", () => {
  beforeEach(() => {
    (window as any).fbq = undefined;
    localStorage.clear();
    vi.resetModules();
  });

  it("no-ops when consent is missing", async () => {
    const mod = await import("@/lib/meta-pixel");
    mod.trackEvent("Lead");
    expect((window as any).fbq).toBeUndefined();
  });

  it("no-ops when pixel id is unset even with consent", async () => {
    localStorage.setItem("rentmaikar_message_consent", "accepted");
    const mod = await import("@/lib/meta-pixel");
    mod.trackPageView();
    // fbq only initialises when VITE_META_PIXEL_ID is present at build time
    if (!(import.meta as any).env?.VITE_META_PIXEL_ID) {
      expect((window as any).fbq).toBeUndefined();
    }
  });
});
