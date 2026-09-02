/**
 * Security headers and CSP configuration for production.
 */

/** Content Security Policy directives */
export const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "https://fonts.gstatic.com"],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://*.supabase.co",
    "https://*.tile.openstreetmap.org",
    "https://unpkg.com",
  ],
  "connect-src": [
    "'self'",
    "https://staging.rentmaikar.com",
    "wss://staging.rentmaikar.com",

    "https://*.supabase.co",
    "wss://*.supabase.co",
    // Twilio Voice SDK (in-app call centre signalling + media)
    "https://*.twilio.com",
    "wss://*.twilio.com",
    "https://api.paypal.com",
    "https://api.paystack.co",
  ],
  "media-src": ["'self'", "blob:", "mediastream:"],

  "frame-src": ["'self'", "https://www.paypal.com", "https://paystack.com"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
} as const;

/** Build CSP string from directives */
export function buildCSP(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

/** Standard security headers for edge functions */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(self), geolocation=(self), payment=(self)",
};

/** Allowed production frontend origins */
export const ALLOWED_ORIGINS = [
  "https://rentmaikar.com",
  "https://www.rentmaikar.com",
] as const;

/** CORS headers for edge functions */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

/** Build CORS headers dynamically based on the incoming request origin */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const allowOrigin =
    requestOrigin && (ALLOWED_ORIGINS as readonly string[]).includes(requestOrigin)
      ? requestOrigin
      : "https://rentmaikar.com";

  return {
    ...CORS_HEADERS,
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
  };
}

/** Merge all headers for edge function responses */
export function getSecureResponseHeaders(): Record<string, string> {
  return {
    ...CORS_HEADERS,
    ...SECURITY_HEADERS,
  };
}
