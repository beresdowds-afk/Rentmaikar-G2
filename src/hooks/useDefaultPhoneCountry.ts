import { useEffect, useState } from 'react';
import type { Country } from 'react-phone-number-input';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { supabase } from '@/integrations/supabase/client';
import { useRegion } from '@/contexts/RegionContext';
import { getManualPick, getStoredCountry } from '@/lib/region-cookie';

/**
 * Region → default ISO country for the IDD (international dialing code)
 * dropdown. Extend this map as new markets launch — new entries are picked
 * up automatically everywhere PhoneNumberInput is rendered.
 */
export const REGION_TO_ISO: Record<string, Country> = {
  USA: 'US',
  Nigeria: 'NG',
  // Uppercase aliases used in some DB rows / queries.
  US: 'US',
  NG: 'NG',
  NIGERIA: 'NG',
};

/**
 * Resolves the safest ISO country fallback for a given region label.
 * Falls back to `US` only when the region is genuinely unknown.
 */
export function regionToDefaultCountry(
  region: string | null | undefined,
): Country | undefined {
  if (!region) return undefined;
  return REGION_TO_ISO[region] ?? REGION_TO_ISO[region.toUpperCase()];
}

/**
 * Region-aware default ISO country for phone inputs.
 *
 * Resolution priority (highest first):
 *   1. Country encoded in the user's stored E.164 phone number
 *   2. `profiles.preferred_country`
 *   3. Current `RegionContext.country` (region-aware fallback)
 *
 * Returns `undefined` when nothing is known — the phone input then shows a
 * neutral country picker (no pre-filled dialing code or flag) so the user
 * chooses their own country.
 *
 * Guarantees every phone input across web, iOS and Android (Capacitor webview)
 * initializes to the correct dialing code and stays consistent as the user
 * updates their profile or switches region.
 */
export function useDefaultPhoneCountry(): Country | undefined {
  const { country } = useRegion();
  const fallback = regionToDefaultCountry(country);
  const [iso, setIso] = useState<Country | undefined>(fallback);

  // Keep in sync when the region changes before the async profile lookup
  // resolves — this is what makes the input truly region-aware.
  useEffect(() => {
    setIso(fallback);
  }, [fallback]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      // profiles is keyed by user_id (not id) — matching the auth user.
      const { data } = await supabase
        .from('profiles')
        .select('phone, preferred_country')
        .eq('user_id', uid)
        .maybeSingle();
      if (cancelled) return;
      const parsed = data?.phone ? parsePhoneNumberFromString(data.phone) : null;
      if (parsed?.country) return setIso(parsed.country as Country);
      const preferred = regionToDefaultCountry(data?.preferred_country);
      if (preferred) return setIso(preferred);
      // Leave region fallback in place.
    })();
    return () => {
      cancelled = true;
    };
  }, [fallback]);

  return iso;
}

/**
 * Like {@link useDefaultPhoneCountry}, but never falls back to the app's
 * safe-default region ("USA"). It only pre-selects a country when that choice
 * is genuinely known:
 *   1. Country encoded in the user's stored E.164 phone number
 *   2. `profiles.preferred_country`
 *   3. The active region — only when it was explicitly stored (auto-detected
 *      for this visitor) or deliberately selected (e.g. by an admin)
 *
 * Otherwise it returns `undefined`, so verification phone fields render a
 * neutral picker with no flag and no pre-filled dialing code.
 */
export function useResolvedPhoneCountry(): Country | undefined {
  const { country, isDetecting } = useRegion();
  const regionTrusted = !isDetecting && (getManualPick() || !!getStoredCountry());
  const fallback = regionTrusted ? regionToDefaultCountry(country) : undefined;
  const [iso, setIso] = useState<Country | undefined>(fallback);

  useEffect(() => {
    setIso(fallback);
  }, [fallback]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from('profiles')
        .select('phone, preferred_country')
        .eq('user_id', uid)
        .maybeSingle();
      if (cancelled) return;
      const parsed = data?.phone ? parsePhoneNumberFromString(data.phone) : null;
      if (parsed?.country) return setIso(parsed.country as Country);
      const preferred = regionToDefaultCountry(data?.preferred_country);
      if (preferred) return setIso(preferred);
    })();
    return () => {
      cancelled = true;
    };
  }, [fallback]);

  return iso;
}
