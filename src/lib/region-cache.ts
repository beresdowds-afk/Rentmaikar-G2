export interface RegionOption {
  value: string;
  label: string;
  flag: string;
  countryCode: string;
  currency: string;
  currencySymbol: string;
  phonePrefix: string;
  builtIn: boolean;
}

export interface AllowedRegionRow {
  id?: string;
  country_name: string;
  country_code: string;
  currency_code?: string;
  currency_symbol?: string;
  phone_prefix?: string;
  flag_emoji?: string;
  is_active?: boolean;
}

export const BUILTIN_REGION_OPTIONS: RegionOption[] = [
  {
    value: 'USA',
    label: 'United States',
    flag: '🇺🇸',
    countryCode: 'US',
    currency: 'USD',
    currencySymbol: '$',
    phonePrefix: '+1',
    builtIn: true,
  },
  {
    value: 'Nigeria',
    label: 'Nigeria',
    flag: '🇳🇬',
    countryCode: 'NG',
    currency: 'NGN',
    currencySymbol: '₦',
    phonePrefix: '+234',
    builtIn: true,
  },
];

const CACHE_KEY = 'rm_region_cache_v1';

export function mergeRegions(customRegions: RegionOption[] = []): RegionOption[] {
  const customMap = new Map<string, RegionOption>();
  for (const r of customRegions) {
    if (r.value) customMap.set(r.value.toLowerCase(), r);
  }
  const result = [...BUILTIN_REGION_OPTIONS];
  for (const [key, val] of customMap.entries()) {
    if (!result.some((r) => r.value.toLowerCase() === key)) {
      result.push(val);
    }
  }
  return result;
}

export function mapAllowedRegionRows(rows: AllowedRegionRow[] = []): RegionOption[] {
  return rows.map((row) => ({
    value: row.country_name,
    label: row.country_name,
    flag: row.flag_emoji || '🌐',
    countryCode: row.country_code,
    currency: row.currency_code || 'USD',
    currencySymbol: row.currency_symbol || '$',
    phonePrefix: row.phone_prefix || '+1',
    builtIn: BUILTIN_REGION_OPTIONS.some((b) => b.value.toLowerCase() === row.country_name.toLowerCase()),
  }));
}

export function readRegionCache(): { regions: RegionOption[]; timestamp: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function writeRegionCache(regions: RegionOption[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ regions, timestamp: Date.now() }));
  } catch {}
}

export function clearRegionCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

export function resolveRegion(country: string, availableRegions: RegionOption[]): RegionOption | null {
  if (!country) return null;
  const match = availableRegions.find(
    (r) =>
      r.value.toLowerCase() === country.toLowerCase() ||
      r.countryCode.toLowerCase() === country.toLowerCase()
  );
  return match || null;
}
