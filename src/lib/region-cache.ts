import type { RegionOption } from "@/contexts/RegionContext";

/**
 * Offline-tolerant cache for the allowed-region list.
 *
 * The authoritative list comes from the `get_allowed_regions()` RPC. Realtime
 * updates can be delayed (or entirely unavailable when the installed PWA is
 * offline), so the last successful response is mirrored into localStorage and
 * replayed on the next cold start. Built-in launch regions are always present
 * so the app can never end up with an empty region picker.
 */

const CACHE_KEY = "rentmaikar.allowed-regions.v1";
/** Cached regions are served immediately, then revalidated in the background. */
export const REGION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const BUILTIN_REGION_OPTIONS: RegionOption[] = [
  {
    value: "USA",
    label: "United States",
    flag: "🇺🇸",
    countryCode: "US",
    currency: "USD",
    currencySymbol: "$",
    phonePrefix: "+1",
    builtIn: true,
  },
  {
    value: "Nigeria",
    label: "Nigeria",
    flag: "🇳🇬",
    countryCode: "NG",
    currency: "NGN",
    currencySymbol: "₦",
    phonePrefix: "+234",
    builtIn: true,
  },
];

interface CacheEnvelope {
  savedAt: number;
  regions: RegionOption[];
}

const isBrowser = () => typeof window !== "undefined" && !!window.localStorage;

const isRegion = (v: unknown): v is RegionOption => {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.value === "string" && r.value.trim().length > 0;
};

/** Merge built-ins with builder regions, de-duplicating by name and ISO code. */
export function mergeRegions(builder: RegionOption[]): RegionOption[] {
  const extras = builder
    .filter(isRegion)
    .filter(
      (r) =>
        !BUILTIN_REGION_OPTIONS.some(
          (b) =>
            b.value.toLowerCase() === r.value.toLowerCase() ||
            (!!r.countryCode && b.countryCode === r.countryCode.toUpperCase()),
        ),
    );
  const seen = new Set<string>();
  const unique = extras.filter((r) => {
    const key = r.value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [
    ...BUILTIN_REGION_OPTIONS,
    ...unique.sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

export function readRegionCache():
  | { regions: RegionOption[]; stale: boolean; savedAt: number }
  | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed || !Array.isArray(parsed.regions)) return null;
    const regions = parsed.regions.filter(isRegion);
    if (regions.length === 0) return null;
    const savedAt = parsed.savedAt ?? 0;
    return {
      regions: mergeRegions(regions.filter((r) => !r.builtIn)),
      stale: Date.now() - savedAt > REGION_CACHE_TTL_MS,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function writeRegionCache(regions: RegionOption[]): void {
  if (!isBrowser()) return;
  try {
    const envelope: CacheEnvelope = { savedAt: Date.now(), regions };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
  } catch {
    /* quota / private mode — cache is best-effort */
  }
}

export function clearRegionCache(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Row shape returned by the `get_allowed_regions()` RPC. */
export interface AllowedRegionRow {
  value: string;
  label: string;
  flag: string;
  country_code: string;
  currency: string;
  currency_symbol: string;
  phone_prefix: string;
  built_in: boolean;
}

export function mapAllowedRegionRows(rows: AllowedRegionRow[] | null | undefined): RegionOption[] {
  return (rows ?? [])
    .map((row) => ({
      value: String(row.value ?? "").trim(),
      label: String(row.label ?? row.value ?? "").trim(),
      flag: String(row.flag ?? "🌍"),
      countryCode: String(row.country_code ?? "").toUpperCase(),
      currency: String(row.currency ?? "USD").toUpperCase(),
      currencySymbol: String(row.currency_symbol ?? "$"),
      phonePrefix: String(row.phone_prefix ?? ""),
      builtIn: !!row.built_in,
    }))
    .filter((r) => r.value.length > 0);
}

/** Resolve a stored/remote country string against the allowed list. */
export function resolveRegion(
  country: string | null | undefined,
  regions: RegionOption[],
): RegionOption | null {
  const needle = (country ?? "").trim().toLowerCase();
  if (!needle) return null;
  return (
    regions.find((r) => r.value.toLowerCase() === needle) ??
    regions.find((r) => r.countryCode.toLowerCase() === needle) ??
    null
  );
}
