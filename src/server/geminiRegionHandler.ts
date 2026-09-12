import { GoogleGenAI } from "@google/genai";

export interface RegionQualificationData {
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

// Built-in verified baseline platforms for quick lookup
export const KNOWN_REGIONAL_PLATFORMS: Record<string, { platforms: string[]; postalLabel: string; flag?: string }> = {
  usa: { platforms: ["Uber", "Lyft"], postalLabel: "Zip code", flag: "🇺🇸" },
  unitedstates: { platforms: ["Uber", "Lyft"], postalLabel: "Zip code", flag: "🇺🇸" },
  us: { platforms: ["Uber", "Lyft"], postalLabel: "Zip code", flag: "🇺🇸" },
  nigeria: { platforms: ["Bolt", "inDrive"], postalLabel: "Postal code / State", flag: "🇳🇬" },
  ng: { platforms: ["Bolt", "inDrive"], postalLabel: "Postal code / State", flag: "🇳🇬" },
  ghana: { platforms: ["Bolt", "Yango"], postalLabel: "GhanaPost GPS / Postal Code", flag: "🇬🇭" },
  kenya: { platforms: ["Bolt", "Little Cab", "Uber"], postalLabel: "Postal code", flag: "🇰🇪" },
  southafrica: { platforms: ["Uber", "Bolt"], postalLabel: "Postal code", flag: "🇿🇦" },
  unitedkingdom: { platforms: ["Uber", "Bolt"], postalLabel: "Postcode", flag: "🇬🇧" },
  uk: { platforms: ["Uber", "Bolt"], postalLabel: "Postcode", flag: "🇬🇧" },
  canada: { platforms: ["Uber", "Lyft"], postalLabel: "Postal code", flag: "🇨🇦" },
  australia: { platforms: ["Uber", "DiDi"], postalLabel: "Postcode", flag: "🇦🇺" },
  india: { platforms: ["Ola", "Uber"], postalLabel: "PIN code", flag: "🇮🇳" },
  mexico: { platforms: ["Uber", "DiDi"], postalLabel: "Código Postal", flag: "🇲🇽" },
  brazil: { platforms: ["Uber", "99 (DiDi)"], postalLabel: "CEP / Código Postal", flag: "🇧🇷" },
  germany: { platforms: ["Uber", "FreeNow"], postalLabel: "Postleitzahl (PLZ)", flag: "🇩🇪" },
  france: { platforms: ["Uber", "Bolt"], postalLabel: "Code Postal", flag: "🇫🇷" },
  uae: { platforms: ["Careem", "Uber"], postalLabel: "Makani / Postal Code", flag: "🇦🇪" },
  egypt: { platforms: ["inDrive", "Uber", "DiDi"], postalLabel: "Postal code", flag: "🇪🇬" },
};

export async function resolveRegionQualification(regionName: string): Promise<RegionQualificationData> {
  const cleanKey = (regionName || "").toLowerCase().replace(/[^a-z]/g, "");

  // Check built-in overrides for USA and Nigeria strictly
  if (cleanKey === "usa" || cleanKey === "unitedstates" || cleanKey === "us") {
    return {
      region: "USA",
      countryCode: "US",
      flag: "🇺🇸",
      ridesharePlatforms: ["Uber", "Lyft"],
      postalCodeLabel: "Zip code",
      ownerInspectionLabel: "Rideshare inspections (Uber / Lyft)",
      driverPlatformLabel: "Rideshare platform registration page (Uber / Lyft)",
      source: "preconfigured",
    };
  }

  if (cleanKey === "nigeria" || cleanKey === "ng") {
    return {
      region: "Nigeria",
      countryCode: "NG",
      flag: "🇳🇬",
      ridesharePlatforms: ["Bolt", "inDrive"],
      postalCodeLabel: "Postal code / State",
      ownerInspectionLabel: "Rideshare inspections (Bolt / inDrive)",
      driverPlatformLabel: "Rideshare platform registration page (Bolt / inDrive)",
      source: "preconfigured",
    };
  }

  // Attempt Google Gemini AI search with Grounding if API key is present
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const prompt = `You are a rideshare regulatory and platform research expert.
Query: Identify the top 2-3 most dominant rideshare platforms (e.g. Uber, Bolt, Lyft, inDrive, Yango, DiDi, Careem, Grab, Ola, FreeNow) operating in the region/country: "${regionName}".
Also determine the standard postal/zip code format name used in that region (e.g. "Zip code", "Postcode", "Postal code", "PIN code", "CEP").

Output MUST be a JSON object with this exact structure, with NO markdown fences:
{
  "region": "${regionName}",
  "ridesharePlatforms": ["Platform1", "Platform2"],
  "postalCodeLabel": "Postal format name",
  "inspectionDetails": "inspection description or name",
  "summary": "one sentence explaining rideshare market in ${regionName}"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const responseText = response.text || "";
      const cleaned = responseText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.ridesharePlatforms) && parsed.ridesharePlatforms.length > 0) {
        const platforms = parsed.ridesharePlatforms.slice(0, 3);
        const platformString = platforms.join(" / ");
        return {
          region: parsed.region || regionName,
          ridesharePlatforms: platforms,
          postalCodeLabel: parsed.postalCodeLabel || "Postal code / Zip",
          ownerInspectionLabel: `Rideshare inspections (${platformString})`,
          driverPlatformLabel: `Rideshare platform registration page (${platformString})`,
          additionalNotes: parsed.summary ? [parsed.summary] : undefined,
          source: "ai_search",
        };
      }
    } catch (aiError) {
      console.warn(`[geminiRegionHandler] Gemini AI search failed for region "${regionName}":`, aiError);
    }
  }

  // Fallback to known registry
  const match = KNOWN_REGIONAL_PLATFORMS[cleanKey];
  if (match) {
    const platformString = match.platforms.join(" / ");
    return {
      region: regionName,
      flag: match.flag,
      ridesharePlatforms: match.platforms,
      postalCodeLabel: match.postalLabel,
      ownerInspectionLabel: `Rideshare inspections (${platformString})`,
      driverPlatformLabel: `Rideshare platform registration page (${platformString})`,
      source: "fallback",
    };
  }

  // Generic fallback for any other unlisted region
  return {
    region: regionName,
    ridesharePlatforms: ["Uber", "Bolt"],
    postalCodeLabel: "Postal / Zip code",
    ownerInspectionLabel: `Rideshare inspections (Uber / Bolt / Local App)`,
    driverPlatformLabel: `Rideshare platform registration page (Local rideshare account)`,
    source: "fallback",
  };
}
