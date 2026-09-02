import { useQuery } from '@tanstack/react-query';
import type { Country } from 'react-phone-number-input';
import { supabase } from '@/integrations/supabase/client';

/**
 * Row from the `phone_reference` table — one per ISO country.
 * Stores the IDD calling code and canonical example numbers so every
 * phone input across the platform can show a correctly-formatted
 * placeholder and validate against a shared reference.
 */
export interface PhoneReferenceRow {
  iso2: Country;
  country_name: string;
  calling_code: string;
  example_e164: string | null;
  example_national: string | null;
  region_label: string | null;
}

/**
 * Fetches the full phone reference dataset (245 countries) once and caches
 * it for the session. Also exposes lookup maps by ISO code and by IDD
 * calling code, plus a `regionToIso` map derived from `region_label`.
 */
export function usePhoneReference() {
  const query = useQuery({
    queryKey: ['phone-reference'],
    staleTime: 24 * 60 * 60 * 1000, // 1 day
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async (): Promise<PhoneReferenceRow[]> => {
      const { data, error } = await supabase
        .from('phone_reference' as never)
        .select('iso2,country_name,calling_code,example_e164,example_national,region_label')
        .order('country_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PhoneReferenceRow[];
    },
  });

  const rows = query.data ?? [];
  const byIso: Record<string, PhoneReferenceRow> = {};
  const byCallingCode: Record<string, PhoneReferenceRow[]> = {};
  const regionToIso: Record<string, Country> = {};
  for (const row of rows) {
    byIso[row.iso2] = row;
    (byCallingCode[row.calling_code] ??= []).push(row);
    if (row.region_label) regionToIso[row.region_label] = row.iso2;
  }

  return { ...query, rows, byIso, byCallingCode, regionToIso };
}

/**
 * Convenience: example placeholder for a given ISO country. Falls back
 * to a generic hint until the reference dataset finishes loading.
 */
export function usePhoneExample(iso: Country | null | undefined): string {
  const { byIso } = usePhoneReference();
  if (!iso) return 'Enter phone number';
  const row = byIso[iso];
  return row?.example_national || 'Enter phone number';
}
