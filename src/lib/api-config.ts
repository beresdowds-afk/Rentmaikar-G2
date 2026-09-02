/**
 * RentMaikar API and domain configuration.
 *
 * Frontend domains (unchanged):
 *  - https://rentmaikar.com (canonical)
 *  - https://www.rentmaikar.com
 *
 * Backend/API domain:
 *  - https://staging.rentmaikar.com (canonical backend base URL)
 */

/** Canonical production frontend origin */
export const FRONTEND_ORIGIN = "https://rentmaikar.com";

/** Supported frontend origins for CORS and redirections */
export const ALLOWED_FRONTEND_ORIGINS = [
  "https://rentmaikar.com",
  "https://www.rentmaikar.com",
] as const;

/** Canonical production backend API base URL */
export const DEFAULT_BACKEND_URL = "https://staging.rentmaikar.com";

/**
 * Resolves the active backend API base URL from the environment,
 * falling back to the canonical production backend URL.
 */
export const API_BASE_URL: string =
  (import.meta as any).env?.VITE_API_BASE_URL || DEFAULT_BACKEND_URL;

/**
 * Returns whether a given origin is an allowed frontend origin.
 */
export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_FRONTEND_ORIGINS.includes(
    origin as (typeof ALLOWED_FRONTEND_ORIGINS)[number],
  );
}
