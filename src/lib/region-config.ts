import type {
  Country,
  CompanyInfo,
  RegionConfig,
} from "@/contexts/RegionContext";

/**
 * ----------------------------------------------------------------------
 * Built-in Region Configuration
 * ----------------------------------------------------------------------
 *
 * These values are ONLY used for the built-in launch regions (USA and Nigeria).
 *
 * Once a Region Builder region is selected, RegionContext automatically
 * falls back to the published metadata coming from Supabase.
 *
 * Think of this file as the application's bootstrap defaults.
 * ----------------------------------------------------------------------
 */

export const regionConfig: Record<
  "USA" | "Nigeria",
  RegionConfig
> = {
  USA: {
    currency: "USD",
    currencySymbol: "$",
    phonePrefix: "+1",

    whatsappNumber: "",
    smsNumber: "",
    supportEmail: "",
  },

  Nigeria: {
    currency: "NGN",
    currencySymbol: "₦",
    phonePrefix: "+234",

    whatsappNumber: "",
    smsNumber: "",
    supportEmail: "",
  },
};

/**
 * ----------------------------------------------------------------------
 * Static contact overrides.
 *
 * These are only fallback values. Once the Regional Contact Channels
 * table loads from Supabase, those values override these.
 * ----------------------------------------------------------------------
 */
export const contactOverrides: Partial<
  Record<
    Country,
    Partial<
      Pick<
        RegionConfig,
        "whatsappNumber" | "smsNumber" | "supportEmail"
      >
    >
  >
> = {
  USA: {
    whatsappNumber: "",
    smsNumber: "",
    supportEmail: "",
  },

  Nigeria: {
    whatsappNumber: "",
    smsNumber: "",
    supportEmail: "",
  },
};

/**
 * ----------------------------------------------------------------------
 * Company Information
 *
 * Bootstrap values for the two built-in regions.
 * If you later move company information into Supabase, these simply become
 * fallbacks.
 * ----------------------------------------------------------------------
 */
export const companyInfoMap: Partial<
  Record<Country, CompanyInfo>
> = {
  USA: {
    companyName: "RentMaikar USA",

    phone: "",
    phoneRaw: "",

    email: "",

    fullAddress: "",

    address: "",
    city: "",
    state: "",
    country: "USA",
    postalCode: "",
  },

  Nigeria: {
    companyName: "RentMaikar Nigeria",

    phone: "",
    phoneRaw: "",

    email: "",

    fullAddress: "",

    address: "",
    city: "",
    state: "",
    country: "Nigeria",
    postalCode: "",
  },
};
