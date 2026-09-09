const COUNTRY_KEY = 'rm_region_country';
const MODE_KEY = 'rm_region_mode';
const MANUAL_PICK_KEY = 'rm_region_manual_pick';

export function getStoredCountry(): any {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(COUNTRY_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredMode(): any {
  if (typeof window === 'undefined') return null;
  try {
    return (localStorage.getItem(MODE_KEY) as any) || null;
  } catch {
    return null;
  }
}

export function persistCountry(country: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COUNTRY_KEY, country);
    document.cookie = `${COUNTRY_KEY}=${encodeURIComponent(country)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore storage failure
  }
}

export function persistMode(mode: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MODE_KEY, mode);
    document.cookie = `${MODE_KEY}=${encodeURIComponent(mode)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ignore storage failure
  }
}

export function getManualPick(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MANUAL_PICK_KEY) === 'true';
  } catch {
    return false;
  }
}

export function persistManualPick(picked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MANUAL_PICK_KEY, picked ? 'true' : 'false');
  } catch {
    // Ignore storage failure
  }
}
