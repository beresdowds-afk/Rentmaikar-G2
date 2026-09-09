import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectCountryFromIP,
  normalizeCountryCodeToRegion,
  detectCountryFromTimezone,
} from "@/lib/ip-geolocation";

describe("IP Geolocation & Regional Awareness", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("normalizeCountryCodeToRegion", () => {
    it("maps NG to Nigeria", () => {
      expect(normalizeCountryCodeToRegion("NG")).toEqual({
        country: "Nigeria",
        countryCode: "NG",
      });
      expect(normalizeCountryCodeToRegion("ng")).toEqual({
        country: "Nigeria",
        countryCode: "NG",
      });
    });

    it("maps US and USA to USA", () => {
      expect(normalizeCountryCodeToRegion("US")).toEqual({
        country: "USA",
        countryCode: "US",
      });
      expect(normalizeCountryCodeToRegion("USA")).toEqual({
        country: "USA",
        countryCode: "US",
      });
    });

    it("defaults other countries gracefully to USA while preserving countryCode", () => {
      const res = normalizeCountryCodeToRegion("GB");
      expect(res.country).toBe("USA");
      expect(res.countryCode).toBe("GB");
    });
  });

  describe("detectCountryFromIP cascade", () => {
    it("successfully detects Nigeria from ipwho.is", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes("ipwho.is")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              country_code: "NG",
              ip: "102.89.23.4",
            }),
          } as Response;
        }
        return { ok: false, status: 500 } as Response;
      });

      const result = await detectCountryFromIP();
      expect(result.detected).toBe(true);
      expect(result.country).toBe("Nigeria");
      expect(result.countryCode).toBe("NG");
      expect(result.provider).toBe("ipwho.is");
    });

    it("cascades to Cloudflare trace if primary provider fails", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes("ipwho.is")) {
          return { ok: false, status: 403 } as Response;
        }
        if (url.includes("cloudflare.com/cdn-cgi/trace")) {
          return {
            ok: true,
            status: 200,
            text: async () => `fl=123\nh=cloudflare.com\nip=197.210.55.1\nloc=NG\n`,
          } as Response;
        }
        return { ok: false, status: 500 } as Response;
      });

      const result = await detectCountryFromIP();
      expect(result.detected).toBe(true);
      expect(result.country).toBe("Nigeria");
      expect(result.countryCode).toBe("NG");
      expect(result.provider).toBe("cloudflare");
    });

    it("falls back to timezone heuristics if all IP providers fail", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network offline"));

      const result = await detectCountryFromIP();
      expect(result.detected).toBe(false);
      expect(result.provider).toBe("timezone_fallback");
      expect(["USA", "Nigeria"]).toContain(result.country);
    });
  });
});
