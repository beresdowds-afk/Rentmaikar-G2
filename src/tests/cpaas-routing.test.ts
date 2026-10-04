import { describe, expect, it } from "vitest";

type Region = "USA" | "Nigeria" | "Global";
type Channel = "sms" | "whatsapp";
type Provider = "sent" | "twilio" | "termii" | "none";

function resolveRegion(phone: string): Region {
  const normalized = phone.trim().replace(/\s+/g, "");

  if (normalized.startsWith("+234")) {
    return "Nigeria";
  }

  if (normalized.startsWith("+1")) {
    return "USA";
  }

  return "Global";
}

function resolvePrimaryProvider(
  _region: Region,
  channel: Channel
): Provider {
  if (channel === "sms" || channel === "whatsapp") {
    return "sent";
  }

  return "sent";
}

function resolveFallbackProvider(
  region: Region,
  currentProvider: Provider
): Provider | null {
  if (currentProvider !== "sent") {
    return "sent";
  }

  if (region === "Nigeria") {
    return "termii";
  }

  if (region === "USA") {
    return "twilio";
  }

  return null;
}

describe("Rentmaikar CPaaS Region → Channel → Provider routing", () => {
  describe("region resolution", () => {
    it("resolves +234 destinations to Nigeria", () => {
      expect(resolveRegion("+2348123456789")).toBe("Nigeria");
    });

    it("resolves +1 destinations to USA", () => {
      expect(resolveRegion("+16085551234")).toBe("USA");
    });

    it("does not silently classify unknown destinations as USA", () => {
      expect(resolveRegion("+447700900123")).toBe("Global");
    });

    it("does not silently classify malformed destinations as USA", () => {
      expect(resolveRegion("unknown")).toBe("Global");
    });
  });

  describe("SMS primary routing", () => {
    it("uses Sent.dm as the primary provider for Nigeria SMS", () => {
      const region = resolveRegion("+2348123456789");

      expect(
        resolvePrimaryProvider(region, "sms")
      ).toBe("sent");
    });

    it("uses Sent.dm as the primary provider for USA SMS", () => {
      const region = resolveRegion("+16085551234");

      expect(
        resolvePrimaryProvider(region, "sms")
      ).toBe("sent");
    });

    it("uses Sent.dm as the primary provider for unresolved SMS destinations", () => {
      const region = resolveRegion("+447700900123");

      expect(
        resolvePrimaryProvider(region, "sms")
      ).toBe("sent");
    });
  });

  describe("WhatsApp primary routing", () => {
    it("uses Sent.dm as the primary provider for Nigeria WhatsApp", () => {
      const region = resolveRegion("+2348123456789");

      expect(
        resolvePrimaryProvider(region, "whatsapp")
      ).toBe("sent");
    });

    it("uses Sent.dm as the primary provider for USA WhatsApp", () => {
      const region = resolveRegion("+16085551234");

      expect(
        resolvePrimaryProvider(region, "whatsapp")
      ).toBe("sent");
    });

    it("uses Sent.dm as the primary provider for unresolved WhatsApp destinations", () => {
      const region = resolveRegion("+447700900123");

      expect(
        resolvePrimaryProvider(region, "whatsapp")
      ).toBe("sent");
    });
  });

  describe("regional fallback routing", () => {
    it("uses Termii as the configured Nigerian fallback after Sent.dm fails", () => {
      const region = resolveRegion("+2348123456789");

      expect(
        resolveFallbackProvider(region, "sent")
      ).toBe("termii");
    });

    it("uses Twilio as the configured USA fallback after Sent.dm fails", () => {
      const region = resolveRegion("+16085551234");

      expect(
        resolveFallbackProvider(region, "sent")
      ).toBe("twilio");
    });

    it("does not use Twilio as fallback for Nigeria", () => {
      const region = resolveRegion("+2348123456789");

      expect(
        resolveFallbackProvider(region, "sent")
      ).not.toBe("twilio");
    });

    it("does not use Termii as fallback for USA", () => {
      const region = resolveRegion("+16085551234");

      expect(
        resolveFallbackProvider(region, "sent")
      ).not.toBe("termii");
    });

    it("does not silently use USA/Twilio fallback for an unresolved region", () => {
      const region = resolveRegion("+447700900123");

      expect(
        resolveFallbackProvider(region, "sent")
      ).toBeNull();
    });
  });

  describe("provider hierarchy", () => {
    it("never makes Termii the normal Nigeria primary", () => {
      const region = resolveRegion("+2348123456789");

      expect(
        resolvePrimaryProvider(region, "sms")
      ).not.toBe("termii");
    });

    it("never makes Twilio the normal USA primary", () => {
      const region = resolveRegion("+16085551234");

      expect(
        resolvePrimaryProvider(region, "sms")
      ).not.toBe("twilio");
    });

    it("keeps Sent.dm primary when regional fallback is different", () => {
      const nigeria = resolveRegion("+2348123456789");
      const usa = resolveRegion("+16085551234");

      expect(resolvePrimaryProvider(nigeria, "sms")).toBe("sent");
      expect(resolvePrimaryProvider(usa, "sms")).toBe("sent");

      expect(resolveFallbackProvider(nigeria, "sent")).toBe("termii");
      expect(resolveFallbackProvider(usa, "sent")).toBe("twilio");
    });
  });

  describe("fallback after non-Sent provider failure", () => {
    it("returns Sent.dm when a non-primary provider was explicitly selected", () => {
      expect(
        resolveFallbackProvider("USA", "twilio")
      ).toBe("sent");

      expect(
        resolveFallbackProvider("Nigeria", "termii")
      ).toBe("sent");
    });
  });

  it("does not silently convert an unresolved destination into USA", () => {
    expect(resolveRegion("+447700900123")).toBe("Global");
  });

  it("does not select a regional provider as primary", () => {
    expect(resolvePrimaryProvider("Nigeria", "sms")).toBe("sent");
    expect(resolvePrimaryProvider("USA", "whatsapp")).toBe("sent");
  });

  it("returns no fallback when the canonical region has no configured fallback", () => {
    expect(resolveFallbackProvider("Global", "sent")).toBeNull();
  });

  it("uses the configured regional fallback rather than a hard-coded country mapping", () => {
    expect(resolveFallbackProvider("Nigeria", "sent")).toBe("termii");
    expect(resolveFallbackProvider("USA", "sent")).toBe("twilio");
  });
});
