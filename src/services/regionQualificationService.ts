/**
 * Region Qualification Service
 * Handles region-aware requirements for:
 * - USA: Uber / Lyft
 * - Nigeria: Bolt / inDrive
 * - Other regions: AI-search generated
 */

export interface RegionQualification {
  region: string;
  countryCode?: string;
  flag?: string;
  ridesharePlatforms: string[];
  postalCodeLabel: string;
  ownerInspectionLabel: string;
  driverPlatformLabel: string;
  additionalNotes?: string[];
  source: "preconfigured" | "ai_search" | "fallback";
}

// In-memory cache to avoid repeated network calls
const cache = new Map<string, RegionQualification>();

// Preconfigured defaults for instantaneous zero-latency rendering
const PRECONFIGURED_REGIONS: Record<string, RegionQualification> = {
  usa: {
    region: "USA",
    countryCode: "US",
    flag: "🇺🇸",
    ridesharePlatforms: ["Uber", "Lyft"],
    postalCodeLabel: "Zip code",
    ownerInspectionLabel: "Rideshare inspections (Uber / Lyft)",
    driverPlatformLabel: "Rideshare platform registration page (Uber / Lyft)",
    source: "preconfigured",
  },
  nigeria: {
    region: "Nigeria",
    countryCode: "NG",
    flag: "🇳🇬",
    ridesharePlatforms: ["Bolt", "inDrive"],
    postalCodeLabel: "Postal code / State",
    ownerInspectionLabel: "Rideshare inspections (Bolt / inDrive)",
    driverPlatformLabel: "Rideshare platform registration page (Bolt / inDrive)",
    source: "preconfigured",
  },
  ghana: {
    region: "Ghana",
    countryCode: "GH",
    flag: "🇬🇭",
    ridesharePlatforms: ["Bolt", "Yango"],
    postalCodeLabel: "GhanaPost GPS / Postal code",
    ownerInspectionLabel: "Rideshare inspections (Bolt / Yango)",
    driverPlatformLabel: "Rideshare platform registration page (Bolt / Yango)",
    source: "preconfigured",
  },
  kenya: {
    region: "Kenya",
    countryCode: "KE",
    flag: "🇰🇪",
    ridesharePlatforms: ["Bolt", "Little Cab"],
    postalCodeLabel: "Postal code",
    ownerInspectionLabel: "Rideshare inspections (Bolt / Little)",
    driverPlatformLabel: "Rideshare platform registration page (Bolt / Little)",
    source: "preconfigured",
  },
  southafrica: {
    region: "South Africa",
    countryCode: "ZA",
    flag: "🇿🇦",
    ridesharePlatforms: ["Uber", "Bolt"],
    postalCodeLabel: "Postal code",
    ownerInspectionLabel: "Rideshare inspections (Uber / Bolt)",
    driverPlatformLabel: "Rideshare platform registration page (Uber / Bolt)",
    source: "preconfigured",
  },
  unitedkingdom: {
    region: "United Kingdom",
    countryCode: "GB",
    flag: "🇬🇧",
    ridesharePlatforms: ["Uber", "Bolt"],
    postalCodeLabel: "Postcode",
    ownerInspectionLabel: "Rideshare inspections (Uber / Bolt)",
    driverPlatformLabel: "Rideshare platform registration page (Uber / Bolt)",
    source: "preconfigured",
  },
  canada: {
    region: "Canada",
    countryCode: "CA",
    flag: "🇨🇦",
    ridesharePlatforms: ["Uber", "Lyft"],
    postalCodeLabel: "Postal code",
    ownerInspectionLabel: "Rideshare inspections (Uber / Lyft)",
    driverPlatformLabel: "Rideshare platform registration page (Uber / Lyft)",
    source: "preconfigured",
  },
  india: {
    region: "India",
    countryCode: "IN",
    flag: "🇮🇳",
    ridesharePlatforms: ["Ola", "Uber"],
    postalCodeLabel: "PIN code",
    ownerInspectionLabel: "Rideshare inspections (Ola / Uber)",
    driverPlatformLabel: "Rideshare platform registration page (Ola / Uber)",
    source: "preconfigured",
  },
};

export async function fetchRegionQualification(countryName: string): Promise<RegionQualification> {
  const normalized = (countryName || "").toLowerCase().trim();
  const key = normalized.replace(/[^a-z]/g, "");

  // Return strictly USA or Nigeria preconfigured without network overhead
  if (key === "usa" || key === "unitedstates" || key === "us") {
    return PRECONFIGURED_REGIONS.usa;
  }
  if (key === "nigeria" || key === "ng") {
    return PRECONFIGURED_REGIONS.nigeria;
  }

  // Check cache
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  // If already known in local map, use it as baseline
  const localPreconfig = PRECONFIGURED_REGIONS[key];

  // Try calling the server AI endpoint
  try {
    const res = await fetch(`/api/region-qualification?region=${encodeURIComponent(countryName)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data: RegionQualification = await res.json();
      cache.set(key, data);
      return data;
    }
  } catch (err) {
    console.debug("[regionQualificationService] Backend endpoint unreachable, using client resolution:", err);
  }

  if (localPreconfig) {
    cache.set(key, localPreconfig);
    return localPreconfig;
  }

  // Fallback
  const fallbackData: RegionQualification = {
    region: countryName || "Global",
    ridesharePlatforms: ["Uber", "Bolt"],
    postalCodeLabel: "Postal / Zip code",
    ownerInspectionLabel: "Rideshare inspections (Uber / Bolt)",
    driverPlatformLabel: "Rideshare platform registration page (Local rideshare account)",
    source: "fallback",
  };
  cache.set(key, fallbackData);
  return fallbackData;
}
