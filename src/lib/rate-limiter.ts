/**
 * Client-side rate limiter using sliding window.
 * Use for protecting form submissions, API calls, etc.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  /** Unique key for this rate limit (e.g. "login", "register", "contact") */
  key: string;
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
}

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = store.get(config.key) || { timestamps: [] };

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(
    (ts) => now - ts < config.windowMs
  );

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = config.windowMs - (now - oldestInWindow);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    };
  }

  entry.timestamps.push(now);
  store.set(config.key, entry);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    retryAfterMs: null,
  };
}

/** Pre-configured rate limits for common actions */
export const RATE_LIMITS = {
  login: { key: "auth:login", maxRequests: 5, windowMs: 60_000 },
  register: { key: "auth:register", maxRequests: 3, windowMs: 300_000 },
  passwordReset: { key: "auth:reset", maxRequests: 3, windowMs: 300_000 },
  contactSupport: { key: "support:contact", maxRequests: 5, windowMs: 60_000 },
  formSubmit: { key: "form:submit", maxRequests: 10, windowMs: 60_000 },
  apiCall: { key: "api:call", maxRequests: 30, windowMs: 60_000 },
} as const;

/**
 * Edge function rate limiting helper.
 * Use in Supabase Edge Functions for server-side rate limiting.
 */
export function createEdgeRateLimitHeaders(
  remaining: number,
  limit: number,
  resetMs: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
  };
}
