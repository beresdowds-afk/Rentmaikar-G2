import { describe, it, expect } from "vitest";
import {
  regionCurrencyCode,
  regionCountryCode,
  regionDialingCode,
  regionCurrencySymbol,
  formatRegionMoney,
  formatRegionPhone,
  toRegionE164,
} from "@/lib/region-format";
import { mergeRegions, mapAllowedRegionRows, resolveRegion } from "@/lib/region-cache";
import type { RegionOption } from "@/contexts/RegionContext";

const usa: RegionOption = {
  value: "USA",
  label: "United States",
  flag: "🇺🇸",
  countryCode: "US",
  currency: "USD",
  currencySymbol: "$",
  phonePrefix: "+1",
  builtIn: true,
};

const nigeria: RegionOption = {
  value: "Nigeria",
  label: "Nigeria",
  flag: "🇳🇬",
  countryCode: "NG",
  currency: "NGN",
  currencySymbol: "₦",
  phonePrefix: "+234",
  builtIn: true,
};

const ghana: RegionOption = {
  value: "Ghana",
  label: "Ghana",
  flag: "🇬🇭",
  countryCode: "GH",
  currency: "GHS",
  currencySymbol: "₵",
  phonePrefix: "233",
  builtIn: false,
};

/** Builder region with deliberately incomplete metadata. */
const partial: RegionOption = {
  value: "Kenya",
  label: "Kenya",
  flag: "",
  countryCode: "KE",
  currency: "",
  currencySymbol: "",
  phonePrefix: "",
  builtIn: false,
};

const broken: RegionOption = {
  value: "Atlantis",
  label: "Atlantis",
  flag: "🌍",
  countryCode: "XX!",
  currency: "dollars",
  currencySymbol: "",
  phonePrefix: "n/a",
  builtIn: false,
};

describe("region currency", () => {
  it("uses the region record's ISO code", () => {
    expect(regionCurrencyCode(nigeria)).toBe("NGN");
    expect(regionCurrencyCode(ghana)).toBe("GHS");
  });

  it("falls back to USD for missing or malformed codes", () => {
    expect(regionCurrencyCode(partial)).toBe("USD");
    expect(regionCurrencyCode(broken)).toBe("USD");
    expect(regionCurrencyCode(null)).toBe("USD");
  });

  it("derives a symbol when the record has none", () => {
    expect(regionCurrencySymbol(nigeria)).toBe("₦");
    expect(regionCurrencySymbol(partial).length).toBeGreaterThan(0);
  });

  it("formats amounts in the region currency", () => {
    expect(formatRegionMoney(1234.5, usa)).toContain("1,234.50");
    expect(formatRegionMoney(1000, nigeria)).toContain("1,000.00");
  });

  it("never renders NaN", () => {
    expect(formatRegionMoney(undefined, usa)).toContain("0.00");
    expect(formatRegionMoney("not-a-number", usa)).toContain("0.00");
    expect(formatRegionMoney(null, ghana)).toContain("0.00");
  });
});

describe("region dialing code", () => {
  it("normalises prefixes with or without a plus", () => {
    expect(regionDialingCode(usa)).toBe("+1");
    expect(regionDialingCode(nigeria)).toBe("+234");
    expect(regionDialingCode(ghana)).toBe("+233");
  });

  it("derives the dialing code from the ISO code when the prefix is empty", () => {
    expect(regionDialingCode(partial)).toBe("+254");
  });

  it("returns an empty string instead of guessing +1", () => {
    expect(regionDialingCode(broken)).toBe("");
    expect(regionDialingCode(null)).toBe("");
  });

  it("validates ISO codes", () => {
    expect(regionCountryCode(usa)).toBe("US");
    expect(regionCountryCode(broken)).toBeNull();
  });
});

describe("region phone formatting", () => {
  it("formats E.164 input for display", () => {
    expect(formatRegionPhone("+2348012345678", nigeria)).toBe("+234 801 234 5678");
    expect(formatRegionPhone("+14155551234", usa, "national")).toBe("(415) 555-1234");
  });

  it("returns unparseable input untouched", () => {
    expect(formatRegionPhone("call me", usa)).toBe("call me");
    expect(formatRegionPhone("", usa)).toBe("");
  });

  it("builds E.164 from local input using the region dialing code", () => {
    expect(toRegionE164("08012345678", nigeria)).toBe("+2348012345678");
    expect(toRegionE164("4155551234", usa)).toBe("+14155551234");
  });

  it("rejects invalid numbers rather than fabricating one", () => {
    expect(toRegionE164("123", nigeria)).toBeNull();
    expect(toRegionE164("", usa)).toBeNull();
    expect(toRegionE164("08012345678", broken)).toBeNull();
  });
});

describe("allowed-region list", () => {
  it("always contains the built-in launch regions", () => {
    const merged = mergeRegions([]);
    expect(merged.map((r) => r.value)).toEqual(["USA", "Nigeria"]);
  });

  it("de-duplicates builder regions that clash with built-ins", () => {
    const merged = mergeRegions([
      { ...ghana },
      { ...usa, builtIn: false },
      { ...nigeria, value: "nigeria", builtIn: false },
    ]);
    expect(merged.filter((r) => r.value.toLowerCase() === "nigeria")).toHaveLength(1);
    expect(merged.map((r) => r.value)).toContain("Ghana");
  });

  it("maps RPC rows into region options", () => {
    const mapped = mapAllowedRegionRows([
      {
        value: " Ghana ",
        label: "Ghana",
        flag: "🇬🇭",
        country_code: "gh",
        currency: "ghs",
        currency_symbol: "₵",
        phone_prefix: "+233",
        built_in: false,
      },
    ]);
    expect(mapped[0]).toMatchObject({ value: "Ghana", countryCode: "GH", currency: "GHS" });
  });

  it("resolves a stored country against the allowed list", () => {
    const regions = mergeRegions([ghana]);
    expect(resolveRegion("ghana", regions)?.value).toBe("Ghana");
    expect(resolveRegion("US", regions)?.value).toBe("USA");
    expect(resolveRegion("Narnia", regions)).toBeNull();
  });
});
