import { Country } from "@/contexts/RegionContext";

interface GeoLocationResult {
  country: Country;
  countryCode: string;
  detected: boolean;
}

// Free IP geolocation using ip-api.com (no API key required)
export const detectCountryFromIP = async (): Promise<GeoLocationResult> => {
  try {
    // Use HTTPS for secure transmission of IP data
    const response = await fetch("https://ip-api.com/json/?fields=countryCode", {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch geolocation");
    }

    const data = await response.json();
    const countryCode = data.countryCode || "";

    // Map country code to our supported countries
    if (countryCode === "NG") {
      return { country: "Nigeria", countryCode, detected: true };
    }
    
    // Default to USA for US and all other countries
    return { country: "USA", countryCode, detected: true };
  } catch (error) {
    console.warn("IP geolocation failed, falling back to timezone detection:", error);
    return { country: "USA", countryCode: "", detected: false };
  }
};

// Fallback: Detect country from timezone
export const detectCountryFromTimezone = (): Country => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone.startsWith("Africa/Lagos") || timezone.startsWith("Africa/")) {
      return "Nigeria";
    }
    
    const language = navigator.language || navigator.languages?.[0] || "";
    if (language.includes("NG") || language.includes("ng")) {
      return "Nigeria";
    }
    
    return "USA";
  } catch {
    return "USA";
  }
};
