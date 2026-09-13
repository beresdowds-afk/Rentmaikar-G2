import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_INFO } from "@/lib/email-config";
import { companyInfoMap } from "@/lib/region-config";
import type { CompanyInfo, Country } from "@/contexts/RegionContext";

/**
 * Published per-region company contact info (public.platform_company_info).
 *
 * Legal pages (Terms of Use, Privacy Policy) and any other public surface
 * that shows an organization phone number should source it from here so the
 * number always matches what admins published for that region — never a
 * hardcoded constant.
 *
 * Fallback chain per region:
 *   1. Active platform_company_info row (admin-published, wins when present)
 *   2. Bootstrap region-config entry (companyInfoMap)
 *   3. Legacy COMPANY_INFO constants
 */

interface CompanyInfoRow {
  region: string;
  company_name: string | null;
  phone: string | null;
  phone_raw: string | null;
  email: string | null;
  full_address: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  country_name: string | null;
  postal_code: string | null;
}

interface ContactSettingRow {
  region: string;
  contact_type: string;
  contact_value: string;
}

interface PublishedPayload {
  companies: CompanyInfoRow[];
  contacts: ContactSettingRow[];
}

/** COMPANY_INFO is keyed by uppercase region ("USA" | "NIGERIA"). */
function legacyFallback(region: Country) {
  const key = region.toUpperCase() as keyof typeof COMPANY_INFO;
  return COMPANY_INFO[key] as (typeof COMPANY_INFO)["USA"] | undefined;
}

/** Static (non-database) fallback for a region. */
function staticFallback(region: Country): CompanyInfo {
  const bootstrap = companyInfoMap[region];
  const legacy = legacyFallback(region);
  return {
    companyName: bootstrap?.companyName || legacy?.companyName || "Rentmaikar",
    phone: bootstrap?.phone || legacy?.phone || "",
    phoneRaw: bootstrap?.phoneRaw || legacy?.phoneRaw || "",
    email: bootstrap?.email || legacy?.email || "",
    fullAddress: bootstrap?.fullAddress || legacy?.fullAddress || "",
    address: bootstrap?.address || legacy?.address || "",
    city: bootstrap?.city || legacy?.city || "",
    state: bootstrap?.state || legacy?.state || "",
    country: bootstrap?.country || legacy?.country || region,
    postalCode: bootstrap?.postalCode || legacy?.zip || "",
  };
}

function resolveCompanyInfo(
  row: CompanyInfoRow | undefined,
  contactsForRegion: ContactSettingRow[],
  region: Country,
): CompanyInfo {
  const fallback = staticFallback(region);

  const smsContact = contactsForRegion.find(
    (c) => c.contact_type === "sms" || c.contact_type === "phone",
  );
  const emailContact = contactsForRegion.find(
    (c) => c.contact_type === "email",
  );
  const whatsappContact = contactsForRegion.find(
    (c) => c.contact_type === "whatsapp",
  );

  const phone = smsContact?.contact_value || row?.phone || fallback.phone;
  const phoneRaw = smsContact?.contact_value
    ? smsContact.contact_value.replace(/[^\d+]/g, "")
    : row?.phone_raw || fallback.phoneRaw;
  const email = emailContact?.contact_value || row?.email || fallback.email;
  const whatsapp =
    whatsappContact?.contact_value ||
    phoneRaw ||
    fallback.phoneRaw;

  return {
    companyName: row?.company_name || fallback.companyName,
    phone,
    phoneRaw,
    email,
    fullAddress: row?.full_address || fallback.fullAddress,
    address: row?.address_line || fallback.address,
    city: row?.city || fallback.city,
    state: row?.state || fallback.state,
    country: row?.country_name || fallback.country,
    postalCode: row?.postal_code || fallback.postalCode,
    whatsapp,
  };
}

export function usePublishedCompanyInfo() {
  const query = useQuery({
    queryKey: ["published-company-info"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<PublishedPayload> => {
      const [compRes, contactsRes] = await Promise.all([
        supabase
          .from("platform_company_info" as never)
          .select(
            "region,company_name,phone,phone_raw,email,full_address,address_line,city,state,country_name,postal_code",
          )
          .eq("is_active", true),
        supabase
          .from("contact_settings" as never)
          .select("region,contact_type,contact_value")
          .eq("is_active", true),
      ]);

      if (compRes.error) throw compRes.error;

      return {
        companies: (compRes.data ?? []) as unknown as CompanyInfoRow[],
        contacts: (contactsRes.data ?? []) as unknown as ContactSettingRow[],
      };
    },
  });

  const payload = query.data ?? { companies: [], contacts: [] };

  /**
   * Company info for a region. CONTACT SETTINGS acts as the primary source
   * of truth for active channel details (phone/sms, email, whatsapp),
   * enriched by published company info and static bootstrap fallbacks.
   */
  const infoFor = (region: Country): CompanyInfo => {
    const needle = region.trim().toLowerCase();
    const row = payload.companies.find(
      (r) => r.region.trim().toLowerCase() === needle,
    );
    const regionContacts = payload.contacts.filter(
      (c) => c.region.trim().toLowerCase() === needle,
    );
    return resolveCompanyInfo(row, regionContacts, region);
  };

  return { ...query, infoFor };
}
