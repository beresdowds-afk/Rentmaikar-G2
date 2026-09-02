/**
 * Shared security headers for all edge functions.
 * Import: import { corsHeaders, secureHeaders, withSecurity } from '../_shared/security-headers.ts'
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export const secureHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/** Merge CORS + security headers for responses */
export function withSecurity(extra?: Record<string, string>): Record<string, string> {
  return {
    ...corsHeaders,
    ...secureHeaders,
    ...extra,
  };
}

/** Rate limit tracking (in-memory per instance) */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function edgeRateLimit(
  key: string,
  maxRequests: number = 60,
  windowSec: number = 60
): { allowed: boolean; remaining: number; headers: Record<string, string> } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      headers: {
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': String(maxRequests - 1),
        'X-RateLimit-Reset': String(Math.ceil((now + windowSec * 1000) / 1000)),
      },
    };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);

  if (entry.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      headers: {
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
        'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
      },
    };
  }

  return {
    allowed: true,
    remaining,
    headers: {
      'X-RateLimit-Limit': String(maxRequests),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    },
  };
}
