/**
 * RentMaikar Platform Domain Configuration:
 * - Frontend domain: rentmaikar.com (production web client)
 * - Backend domain: staging.rentmaikar.com (API gateway & server services)
 * - Incoming mail domain: backend.rentmaikar.com (inbound mailboxes & webhooks)
 * - Outgoing mail domain: notify.rentmaikar.com (outbound transactional dispatch)
 */

export const DOMAIN_CONFIG = {
  frontend: "rentmaikar.com",
  frontendOrigin: "https://rentmaikar.com",
  backend: "staging.rentmaikar.com",
  backendOrigin: "https://staging.rentmaikar.com",
  incomingMailDomain: "backend.rentmaikar.com",
  outgoingMailDomain: "notify.rentmaikar.com",
} as const;

/** Canonical production frontend origin */
export const FRONTEND_ORIGIN = DOMAIN_CONFIG.frontendOrigin;

/** Supported frontend origins for CORS and redirections */
export const ALLOWED_FRONTEND_ORIGINS = [
  "https://rentmaikar.com",
  "https://www.rentmaikar.com",
] as const;

/** Canonical production backend API base URL */
export const DEFAULT_BACKEND_URL = DOMAIN_CONFIG.backendOrigin;

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
