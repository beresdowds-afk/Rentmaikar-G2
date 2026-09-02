import type { RegionOption } from "@/contexts/RegionContext";
import { regionCountryCode, regionDialingCode } from "@/lib/region-format";

/**
 * Region-aware sample data.
 *
 * Every placeholder, hint, validation example, or API-doc sample that shows a
 * name, phone number, address, or location should come from here so the copy
 * always matches the visitor's selected region — never a hardcoded US "+1"
 * or a Nigerian name shown to a US visitor.
 */

export interface RegionSamples {
  /** Sample full name, e.g. "Jordan Miller" (US) / "Adaeze Okafor" (NG). */
  name: string;
  /** Sample given name. */
  firstName: string;
  /** Sample family name. */
  lastName: string;
  /** Sample email derived from the sample name. */
  email: string;
  /** Sample phone in E.164 form, e.g. "+14155552671". */
  phoneE164: string;
  /** Human-readable phone sample for placeholders, e.g. "+1 415 555 2671". */
  phoneDisplay: string;
  /** Sample street address. */
  address: string;
  /** Sample city. */
  city: string;
  /** Sample "City, Country" location label. */
  location: string;
  /** Sample postal/ZIP code for the region. */
  postalCode: string;
  /** Region-appropriate label, e.g. "ZIP Code" (US) / "Postal Code". */
  postalLabel: string;
  /** Sample pickup/depot landmark description. */
  landmark: string;
}

interface SampleSeed {
  name: string;
  phoneNational: string; // national significant number, digits only
  phoneDisplayNational: string; // national number formatted for display
  address: string;
  city: string;
  countryLabel: string;
  postalCode: string;
  postalLabel: string;
  landmark: string;
}

/** Keyed by ISO 3166-1 alpha-2. */
const SAMPLES_BY_ISO: Record<string, SampleSeed> = {
  US: {
    name: "Jordan Miller",
    phoneNational: "4155552671",
    phoneDisplayNational: "415 555 2671",
    address: "4507 Oak Ridge Drive, Austin, TX 78745",
    city: "Austin",
    countryLabel: "USA",
    postalCode: "78745",
    postalLabel: "ZIP Code",
    landmark: "Downtown Hub, visitor lot 4",
  },
  NG: {
    name: "Adaeze Okafor",
    phoneNational: "8031234567",
    phoneDisplayNational: "803 123 4567",
    address: "24 Ademola Street, Ikeja, Lagos",
    city: "Lagos",
    countryLabel: "Nigeria",
    postalCode: "100271",
    postalLabel: "Postal Code",
    landmark: "Admiralty Way depot, gate 2",
  },
};

const GENERIC: SampleSeed = {
  name: "Alex Morgan",
  phoneNational: "5550123456",
  phoneDisplayNational: "555 012 3456",
  address: "12 Market Street",
  city: "",
  countryLabel: "",
  postalCode: "0000",
  postalLabel: "Postal Code",
  landmark: "Main depot, visitor parking",
};

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

/**
 * Sample data for the given region. Falls back to dialing-code-derived
 * values for builder-created regions so nothing ever renders a "+1" sample
 * for a region that does not use it.
 */
export function regionSampleData(region?: RegionOption | null): RegionSamples {
  const iso = regionCountryCode(region);
  const seed = (iso && SAMPLES_BY_ISO[iso]) || GENERIC;
  const dial = regionDialingCode(region);
  const city = seed.city || region?.label || "";
  const countryLabel = seed.countryLabel || region?.label || "";
  const [firstName, ...restName] = seed.name.split(" ");
  return {
    name: seed.name,
    firstName,
    lastName: restName.join(" "),
    email: `${slugify(seed.name)}@example.com`,
    phoneE164: `${dial}${seed.phoneNational}`,
    phoneDisplay: `${dial} ${seed.phoneDisplayNational}`.trim(),
    address: seed.address,
    city,
    location: [city, countryLabel].filter(Boolean).join(", "),
    postalCode: seed.postalCode,
    postalLabel: seed.postalLabel,
    landmark: seed.landmark,
  };
}
