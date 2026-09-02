/**
 * PSP support matrix. Extendable when new regions come online.
 * Keys are ISO country codes so future regions (GH, ZA, KE, TG, EG…) plug in
 * without touching the Country enum used elsewhere in the UI.
 */
export type CheckoutPSP = "paystack" | "opay" | "paypal";
export type PayoutPSP = "paystack" | "paypal";

interface RegionPSPConfig {
  countryCode: string;
  currency: string;
  checkout: CheckoutPSP[];
  payouts: PayoutPSP[];
}

export const REGION_PSPS: Record<string, RegionPSPConfig> = {
  US: { countryCode: "US", currency: "USD", checkout: ["paypal"], payouts: ["paypal"] },
  NG: { countryCode: "NG", currency: "NGN", checkout: ["paystack", "opay"], payouts: ["paystack"] },
  GH: { countryCode: "GH", currency: "GHS", checkout: ["paystack"], payouts: ["paystack"] },
  ZA: { countryCode: "ZA", currency: "ZAR", checkout: ["paystack"], payouts: ["paystack"] },
  KE: { countryCode: "KE", currency: "KES", checkout: ["paystack"], payouts: ["paystack"] },
  TG: { countryCode: "TG", currency: "XOF", checkout: ["paystack"], payouts: ["paystack"] },
  EG: { countryCode: "EG", currency: "EGP", checkout: ["paystack"], payouts: ["paystack"] },
};

const COUNTRY_ALIAS: Record<string, string> = {
  USA: "US",
  Nigeria: "NG",
  Ghana: "GH",
  "South Africa": "ZA",
  Kenya: "KE",
  Togo: "TG",
  Egypt: "EG",
};

export function resolveCountryCode(country: string | undefined | null): string {
  if (!country) return "US";
  const upper = country.toUpperCase();
  if (REGION_PSPS[upper]) return upper;
  return COUNTRY_ALIAS[country] ?? "US";
}

export function getCheckoutPSPs(country: string | undefined | null): CheckoutPSP[] {
  return REGION_PSPS[resolveCountryCode(country)]?.checkout ?? [];
}

export function getPayoutPSPs(country: string | undefined | null): PayoutPSP[] {
  return REGION_PSPS[resolveCountryCode(country)]?.payouts ?? [];
}

export function getRegionCurrency(country: string | undefined | null): string {
  return REGION_PSPS[resolveCountryCode(country)]?.currency ?? "USD";
}
