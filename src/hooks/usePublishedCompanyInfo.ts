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

function rowToCompanyInfo(row: CompanyInfoRow, region: Country): CompanyInfo {
  const fallback = staticFallback(region);
  return {
    companyName: row.company_name || fallback.companyName,
    phone: row.phone || fallback.phone,
    phoneRaw: row.phone_raw || fallback.phoneRaw,
    email: row.email || fallback.email,
    fullAddress: row.full_address || fallback.fullAddress,
    address: row.address_line || fallback.address,
    city: row.city || fallback.city,
    state: row.state || fallback.state,
    country: row.country_name || fallback.country,
    postalCode: row.postal_code || fallback.postalCode,
  };
}

export function usePublishedCompanyInfo() {
  const query = useQuery({
    queryKey: ["published-company-info"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<CompanyInfoRow[]> => {
      const { data, error } = await supabase
        .from("platform_company_info" as never)
        .select(
          "region,company_name,phone,phone_raw,email,full_address,address_line,city,state,country_name,postal_code",
        )
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as CompanyInfoRow[];
    },
  });

  const rows = query.data ?? [];

  /**
   * Company info for a region. Published database values win; static
   * bootstrap/legacy values fill any gaps so the UI never renders blank
   * contact details while the table is loading or offline.
   */
  const infoFor = (region: Country): CompanyInfo => {
    const needle = region.trim().toLowerCase();
    const row = rows.find((r) => r.region.trim().toLowerCase() === needle);
    return row ? rowToCompanyInfo(row, region) : staticFallback(region);
  };

  return { ...query, infoFor };
}
