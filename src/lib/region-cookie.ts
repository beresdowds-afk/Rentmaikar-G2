const COUNTRY_KEY = "preferred-country";
const MODE_KEY = "region-mode";
const MANUAL_PICK_KEY = "region-manual-pick";

// Legacy keys support for seamless migration
const LEGACY_COUNTRY_KEY = "rm_region_country";
const LEGACY_MODE_KEY = "rm_region_mode";
const LEGACY_MANUAL_PICK_KEY = "rm_region_manual_pick";

export function getStoredCountry(): any {
  if (typeof window === "undefined") return null;
  try {
    return (
      localStorage.getItem(COUNTRY_KEY) ||
      localStorage.getItem(LEGACY_COUNTRY_KEY) ||
      null
    );
  } catch {
    return null;
  }
}

export function getStoredMode(): any {
  if (typeof window === "undefined") return null;
  try {
    return (
      (localStorage.getItem(MODE_KEY) as any) ||
      (localStorage.getItem(LEGACY_MODE_KEY) as any) ||
      null
    );
  } catch {
    return null;
  }
}

export function persistCountry(country: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COUNTRY_KEY, country);
    localStorage.setItem(LEGACY_COUNTRY_KEY, country);
    document.cookie = `${COUNTRY_KEY}=${encodeURIComponent(country)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore storage failure
  }
}

export function persistMode(mode: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(LEGACY_MODE_KEY, mode);
    document.cookie = `${MODE_KEY}=${encodeURIComponent(mode)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore storage failure
  }
}

export function getManualPick(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const val =
      localStorage.getItem(MANUAL_PICK_KEY) ??
      localStorage.getItem(LEGACY_MANUAL_PICK_KEY);
    return val === "true" || val === "1";
  } catch {
    return false;
  }
}

export function persistManualPick(picked: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const strVal = picked ? "true" : "false";
    localStorage.setItem(MANUAL_PICK_KEY, strVal);
    localStorage.setItem(LEGACY_MANUAL_PICK_KEY, strVal);
    document.cookie = `${MANUAL_PICK_KEY}=${strVal}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore storage failure
  }
}

