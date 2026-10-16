
import { Country } from "@/contexts/RegionContext";

export interface GeoLocationResult {
  country: Country;
  countryCode: string;
  detected: boolean;
  provider?: string;
  ip?: string;
}

/**
 * Normalizes country codes and country names into canonical Country values.
 * Unknown or unsupported countries are never silently converted to USA.
 */
export const normalizeCountryCodeToRegion = (
  rawCode: string
): { country: Country; countryCode: string } => {
  const code = (rawCode || "").trim().toUpperCase();

  if (code === "NG" || code === "NGA" || code === "NIGERIA") {
    return {
      country: "Nigeria",
      countryCode: "NG",
    };
  }

  if (code === "US" || code === "USA") {
    return {
      country: "USA",
      countryCode: "US",
    };
  }

  return {
    country: "" as Country,
    countryCode: code,
  };
};

// Provider 1: ipwho.is
const fetchFromIpWhoIs = async (): Promise<{
  countryCode: string;
  ip?: string;
}> => {
  const res = await fetch("https://ipwho.is/", { method: "GET" });

  if (!res.ok) {
    throw new Error(`ipwho.is responded with status ${res.status}`);
  }

  const data = await res.json();

  if (!data.success && data.message) {
    throw new Error(data.message);
  }

  if (!data.country_code) {
    throw new Error("No country_code returned by ipwho.is");
  }

  return {
    countryCode: data.country_code,
    ip: data.ip,
  };
};

// Provider 2: Cloudflare trace
const fetchFromCloudflareTrace = async (): Promise<{
  countryCode: string;
  ip?: string;
}> => {
  const res = await fetch("https://cloudflare.com/cdn-cgi/trace", {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error(
      `Cloudflare trace responded with status ${res.status}`
    );
  }

  const text = await res.text();
  const locMatch = text.match(/loc=([A-Z]{2})/i);
  const ipMatch = text.match(/ip=([^\r\n]+)/i);

  if (!locMatch || !locMatch[1]) {
    throw new Error("No loc= match in Cloudflare trace");
  }

  return {
    countryCode: locMatch[1].toUpperCase(),
    ip: ipMatch ? ipMatch[1].trim() : undefined,
  };
};

// Provider 3: ipinfo.io
const fetchFromIpInfo = async (): Promise<{
  countryCode: string;
  ip?: string;
}> => {
  const res = await fetch("https://ipinfo.io/json", {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error(`ipinfo.io responded with status ${res.status}`);
  }

  const data = await res.json();

  if (!data.country) {
    throw new Error("No country returned by ipinfo.io");
  }

  return {
    countryCode: data.country,
    ip: data.ip,
  };
};

// Provider 4: ip-api.com
const fetchFromIpApi = async (): Promise<{
  countryCode: string;
  ip?: string;
}> => {
  const res = await fetch(
    "https://ip-api.com/json/?fields=status,countryCode,query",
    { method: "GET" }
  );

  if (!res.ok) {
    throw new Error(`ip-api.com responded with status ${res.status}`);
  }

  const data = await res.json();

  if (data.status === "fail") {
    throw new Error("ip-api returned fail");
  }

  if (!data.countryCode) {
    throw new Error("No countryCode returned by ip-api.com");
  }

  return {
    countryCode: data.countryCode,
    ip: data.query,
  };
};

/**
 * Detects country using a cascading set of IP geolocation providers.
 * Does not request GPS hardware permissions.
 */
export const detectCountryFromIP =
  async (): Promise<GeoLocationResult> => {
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
          const { country, countryCode } =
            normalizeCountryCodeToRegion(result.countryCode);

          // Continue to another provider if the country is unsupported.
          if (!country) {
            continue;
          }

          return {
            country,
            countryCode,
            detected: true,
            provider: provider.name,
            ip: result.ip,
          };
        }
      } catch {
        // Continue to the next provider if this provider fails.
      }
    }

    // All providers failed or returned unsupported countries.
    const country = detectCountryFromTimezone();

    return {
      country,
      countryCode: country === "Nigeria" ? "NG" : country === "USA" ? "US" : "",
      detected: false,
    };
  };

/**
 * Fallback country detection using timezone and browser locale.
 *
 * An unresolved country remains unresolved; it never defaults to USA.
 */
export const detectCountryFromTimezone = (): Country => {
  try {
    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "";

    if (timezone === "Africa/Lagos") {
      return "Nigeria";
    }

    const language =
      typeof navigator !== "undefined"
        ? (
            navigator.language ||
            navigator.languages?.[0] ||
            ""
          ).toLowerCase()
        : "";

    if (
      language === "ng" ||
      language.endsWith("-ng")
    ) {
      return "Nigeria";
    }

    if (
      timezone === "America/New_York" ||
      timezone === "America/Detroit" ||
      timezone === "America/Indiana/Indianapolis" ||
      timezone === "America/Indiana/Marengo" ||
      timezone === "America/Indiana/Vevay" ||
      timezone === "America/Kentucky/Louisville" ||
      timezone === "America/Kentucky/Monticello" ||
      timezone === "America/Chicago" ||
      timezone === "America/Denver" ||
      timezone === "America/Los_Angeles" ||
      timezone === "America/Anchorage" ||
      timezone === "Pacific/Honolulu" ||
      timezone === "America/Phoenix"
    ) {
      return "USA";
    }

    return "" as Country;
  } catch {
    return "" as Country;
  }
};
