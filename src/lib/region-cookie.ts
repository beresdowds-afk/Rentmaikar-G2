import type { Country, RegionMode } from "@/contexts/RegionContext";

const COUNTRY_COOKIE = "preferred-country";
const MODE_COOKIE = "region-mode";
const MANUAL_PICK_COOKIE = "region-manual-pick";
const ONE_YEAR = 60 * 60 * 24 * 365;


const isBrowser = () => typeof document !== "undefined";

const readCookie = (name: string): string | null => {
  if (!isBrowser()) return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
};

const writeCookie = (name: string, value: string) => {
  if (!isBrowser()) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`;
};

export const getStoredCountry = (): Country | null => {
  const fromLocal =
    isBrowser() ? window.localStorage.getItem(COUNTRY_COOKIE) : null;
  const fromCookie = readCookie(COUNTRY_COOKIE);
  const value = (fromLocal || fromCookie || "").trim();
  // Any non-empty country name is accepted: built-ins plus every region
  // produced by the Region Builder. Validation against the live region list
  // happens in RegionProvider.
  return value.length > 0 && value.length <= 64 ? (value as Country) : null;
};

export const getStoredMode = (): RegionMode | null => {
  const fromLocal =
    isBrowser() ? window.localStorage.getItem(MODE_COOKIE) : null;
  const fromCookie = readCookie(MODE_COOKIE);
  const value = fromLocal || fromCookie;
  return value === "auto" || value === "manual" ? value : null;
};

export const persistCountry = (country: Country) => {
  if (isBrowser()) window.localStorage.setItem(COUNTRY_COOKIE, country);
  writeCookie(COUNTRY_COOKIE, country);
};

export const persistMode = (mode: RegionMode) => {
  if (isBrowser()) window.localStorage.setItem(MODE_COOKIE, mode);
  writeCookie(MODE_COOKIE, mode);
};

/**
 * Remembers that the region was explicitly chosen by the user (admins).
 * Survives reloads so a profile re-sync or IP detection can never silently
 * replace a deliberate selection.
 */
export const getManualPick = (): boolean => {
  const fromLocal = isBrowser()
    ? window.localStorage.getItem(MANUAL_PICK_COOKIE)
    : null;
  return (fromLocal || readCookie(MANUAL_PICK_COOKIE)) === "1";
};

export const persistManualPick = (value: boolean) => {
  const raw = value ? "1" : "0";
  if (isBrowser()) window.localStorage.setItem(MANUAL_PICK_COOKIE, raw);
  writeCookie(MANUAL_PICK_COOKIE, raw);
};

