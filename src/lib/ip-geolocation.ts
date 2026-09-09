import { Country } from "@/contexts/RegionContext";

export interface GeoLocationResult {
  country: Country;
  countryCode: string;
  detected: boolean;
  provider?: string;
  ip?: string;
}

/**
 * Normalizes ISO alpha-2 country codes into canonical Country names
 */
export const normalizeCountryCodeToRegion = (rawCode: string): { country: Country; countryCode: string } => {
  const code = (rawCode || "").trim().toUpperCase();
  if (code === "NG") {
    return { country: "Nigeria", countryCode: "NG" };
  }
  if (code === "US" || code === "USA") {
    return { country: "USA", countryCode: "US" };
  }
  // If in another region, map known builder regions or default to USA as safe default
  return { country: "USA", countryCode: code || "US" };
};

// Provider 1: ipwho.is (Free, HTTPS, CORS-friendly, no API key required)
const fetchFromIpWhoIs = async (): Promise<{ countryCode: string; ip?: string }> => {
  const res = await fetch("https://ipwho.is/", { method: "GET" });
  if (!res.ok) throw new Error(`ipwho.is responded with status ${res.status}`);
  const data = await res.json();
  if (!data.success && data.message) throw new Error(data.message);
  if (!data.country_code) throw new Error("No country_code returned by ipwho.is");
  return { countryCode: data.country_code, ip: data.ip };
};

// Provider 2: Cloudflare trace (Fast edge lookup, ultra-reliable HTTPS, no auth needed)
const fetchFromCloudflareTrace = async (): Promise<{ countryCode: string; ip?: string }> => {
  const res = await fetch("https://cloudflare.com/cdn-cgi/trace", { method: "GET" });
  if (!res.ok) throw new Error(`Cloudflare trace responded with status ${res.status}`);
  const text = await res.text();
  const locMatch = text.match(/loc=([A-Z]{2})/i);
  const ipMatch = text.match(/ip=([^\r\n]+)/i);
  if (!locMatch || !locMatch[1]) throw new Error("No loc= match in Cloudflare trace");
  return { countryCode: locMatch[1].toUpperCase(), ip: ipMatch ? ipMatch[1].trim() : undefined };
};

// Provider 3: ipinfo.io (Free open JSON tier)
const fetchFromIpInfo = async (): Promise<{ countryCode: string; ip?: string }> => {
  const res = await fetch("https://ipinfo.io/json", { method: "GET" });
  if (!res.ok) throw new Error(`ipinfo.io responded with status ${res.status}`);
  const data = await res.json();
  if (!data.country) throw new Error("No country returned by ipinfo.io");
  return { countryCode: data.country, ip: data.ip };
};

// Provider 4: ip-api.com
const fetchFromIpApi = async (): Promise<{ countryCode: string; ip?: string }> => {
  const res = await fetch("https://ip-api.com/json/?fields=status,countryCode,query", { method: "GET" });
  if (!res.ok) throw new Error(`ip-api.com responded with status ${res.status}`);
  const data = await res.json();
  if (data.status === "fail") throw new Error("ip-api returned fail");
  return { countryCode: data.countryCode || "", ip: data.query };
};

/**
 * Detect country via IP address cascading through multiple reliable HTTPS endpoints.
 * Operates non-intrusively without prompting user for GPS hardware permissions.
 */
export const detectCountryFromIP = async (): Promise<GeoLocationResult> => {
  const providers = [
    { name: "ipwho.is", fn: fetchFromIpWhoIs },
    { name: "cloudflare", fn: fetchFromCloudflareTrace },
    { name: "ipinfo.io", fn: fetchFromIpInfo },
    { name: "ip-api.com", fn: fetchFromIpApi },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn();
      if (result.countryCode) {
        const { country, countryCode } = normalizeCountryCodeToRegion(result.countryCode);
        return {
          country,
          countryCode,
          detected: true,
          provider: provider.name,
          ip: result.ip,
        };
      }
    } catch (err) {
      // Gracefully continue to the next provider in the cascade
    }
  }

  // If all external IP providers fail, fall back to timezone heuristics
  const fallbackCountry = detectCountryFromTimezone();
  return {
    country: fallbackCountry,
    countryCode: fallbackCountry === "Nigeria" ? "NG" : "US",
    detected: false,
    provider: "timezone_fallback",
  };
};

// Fallback: Detect country from timezone & locale heuristics
export const detectCountryFromTimezone = (): Country => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone.startsWith("Africa/Lagos") || timezone.startsWith("Africa/")) {
      return "Nigeria";
    }
    
    const language = typeof navigator !== "undefined" ? (navigator.language || navigator.languages?.[0] || "") : "";
    if (language.includes("NG") || language.includes("ng")) {
      return "Nigeria";
    }
    
    return "USA";
  } catch {
    return "USA";
  }
};

