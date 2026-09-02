// Region-aware default PSP selection. USA -> PayPal, Nigeria -> Opay.
// Additional providers may be added; the first item in payment_gateways
// wins when defined on the region row.

import type { Country } from "@/contexts/RegionContext";

export type PSP = "paypal" | "opay" | "stripe" | "paystack" | "flutterwave";

const COUNTRY_DEFAULTS: Record<string, PSP> = {
  US: "paypal",
  USA: "paypal",
  NG: "opay",
  Nigeria: "opay",
  GH: "paystack",
};

const COUNTRY_OPTIONS: Record<string, PSP[]> = {
  US: ["paypal", "stripe", "paystack"],
  USA: ["paypal", "stripe", "paystack"],
  NG: ["opay", "paystack", "flutterwave"],
  Nigeria: ["opay", "paystack", "flutterwave"],
};

export interface RegionPSPInfo {
  default_payment_gateway?: string | null;
  payment_gateways?: string[] | null;
  country_code?: string | null;
}

export function getDefaultPSP(country: Country | string, region?: RegionPSPInfo | null): PSP {
  const dbDefault = region?.default_payment_gateway;
  if (dbDefault) return dbDefault as PSP;
  const arr = region?.payment_gateways;
  if (arr && arr.length > 0) return arr[0] as PSP;
  return COUNTRY_DEFAULTS[String(country)] || "paypal";
}

export function getAvailablePSPs(country: Country | string, region?: RegionPSPInfo | null): PSP[] {
  const arr = region?.payment_gateways;
  if (arr && arr.length > 0) return arr as PSP[];
  return COUNTRY_OPTIONS[String(country)] || ["paypal"];
}

export function pspLabel(p: PSP): string {
  return {
    paypal: "PayPal",
    opay: "Opay",
    stripe: "Stripe",
    paystack: "Paystack",
    flutterwave: "Flutterwave",
  }[p];
}
