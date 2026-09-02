import {
  parsePhoneNumberFromString,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";
import type { RegionOption } from "@/contexts/RegionContext";

/**
 * Region-derived presentation helpers.
 *
 * Every value is sourced from the selected region *record* (as returned by the
 * `get_allowed_regions()` RPC) — never from a hardcoded USA/Nigeria branch.
 * Each helper degrades gracefully when a builder-generated region has partial
 * metadata (missing symbol, missing dialing code, malformed ISO code).
 */

const CURRENCY_FALLBACK = "USD";

/** ISO-4217 code for a region, upper-cased, falling back to USD. */
export function regionCurrencyCode(region?: RegionOption | null): string {
  const code = (region?.currency ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : CURRENCY_FALLBACK;
}

/** ISO-3166 alpha-2 code, or null when the region record has none/invalid. */
export function regionCountryCode(region?: RegionOption | null): CountryCode | null {
  const cc = (region?.countryCode ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cc) ? (cc as CountryCode) : null;
}

/**
 * `+<dialing code>` for the region. Prefers the region record's own prefix,
 * then derives it from the ISO code, then returns an empty string rather than
 * guessing "+1".
 */
export function regionDialingCode(region?: RegionOption | null): string {
  const raw = (region?.phonePrefix ?? "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (digits) return `+${digits}`;
  const cc = regionCountryCode(region);
  if (cc) {
    try {
      return `+${getCountryCallingCode(cc)}`;
    } catch {
      /* unknown ISO code */
    }
  }
  return "";
}

/** Symbol from the region record, falling back to the Intl-derived symbol. */
export function regionCurrencySymbol(region?: RegionOption | null): string {
  const symbol = (region?.currencySymbol ?? "").trim();
  if (symbol) return symbol;
  const code = regionCurrencyCode(region);
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

export interface FormatMoneyOptions {
  /** Force a fixed number of fraction digits (default: 2, or 0 when whole). */
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  locale?: string;
}

/**
 * Format an amount in the selected region's currency. Invalid/NaN amounts
 * render as a zero amount rather than "NaN".
 */
export function formatRegionMoney(
  amount: number | string | null | undefined,
  region?: RegionOption | null,
  opts: FormatMoneyOptions = {},
): string {
  const numeric =
    typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? ""));
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const code = regionCurrencyCode(region);
  const locale = opts.locale ?? "en-US";
  const min = opts.minimumFractionDigits ?? 2;
  const max = opts.maximumFractionDigits ?? Math.max(min, 2);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(safe);
  } catch {
    const symbol = regionCurrencySymbol(region);
    return `${symbol}${safe.toFixed(min)}`;
  }
}

/**
 * Format a phone number for display using the region as the default country.
 * Returns the input untouched when it cannot be parsed, so user data is never
 * silently mangled.
 */
export function formatRegionPhone(
  raw: string | null | undefined,
  region?: RegionOption | null,
  style: "international" | "national" = "international",
): string {
  const input = (raw ?? "").trim();
  if (!input) return "";
  const cc = regionCountryCode(region) ?? undefined;
  const candidate = input.startsWith("+")
    ? input
    : input.replace(/[^\d]/g, "").length > 0
      ? input
      : "";
  if (!candidate) return input;
  try {
    const parsed = parsePhoneNumberFromString(candidate, cc);
    if (!parsed || !parsed.isValid()) return input;
    return style === "national"
      ? parsed.formatNational()
      : parsed.formatInternational();
  } catch {
    return input;
  }
}

/**
 * Build an E.164 candidate for a locally-typed number using the region's
 * dialing code. Returns null when nothing usable can be produced.
 */
export function toRegionE164(
  raw: string | null | undefined,
  region?: RegionOption | null,
): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  const cc = regionCountryCode(region) ?? undefined;
  const withPlus = input.startsWith("+")
    ? input
    : (() => {
        const dial = regionDialingCode(region);
        const digits = input.replace(/[^\d]/g, "").replace(/^0+/, "");
        if (!digits) return "";
        return dial ? `${dial}${digits}` : `+${digits}`;
      })();
  if (!withPlus) return null;
  try {
    const parsed = parsePhoneNumberFromString(withPlus, cc);
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}
