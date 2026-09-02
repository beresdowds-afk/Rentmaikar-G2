// Shared rate-limit + concurrency helpers for edge functions.
//
// Rate limit is persisted in `public.rate_limit_log`. Buckets are 1-minute
// windows keyed by (identifier, endpoint). Concurrency uses per-instance in-memory
// counters — imperfect across Deno isolates but a solid last-line defense against
// a single client hammering an endpoint from one machine.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const svc = () => createClient(SUPABASE_URL, SERVICE_KEY);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
  count: number;
}

/**
 * Sliding-1-minute rate limit. Returns `allowed=false` when the caller has
 * exceeded `max_per_minute` requests in the current window.
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  max_per_minute: number,
): Promise<RateLimitResult> {
  const supa = svc();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60_000).toISOString();

  const { data } = await supa
    .from("rate_limit_log")
    .select("id, request_count, window_start")
    .eq("identifier", identifier)
    .eq("endpoint", endpoint)
    .gte("window_start", windowStart)
    .order("window_start", { ascending: false })
    .limit(1);

  const existing = data?.[0];
  if (existing) {
    const nextCount = (existing.request_count ?? 0) + 1;
    await supa.from("rate_limit_log").update({ request_count: nextCount }).eq("id", existing.id);
    const allowed = nextCount <= max_per_minute;
    return {
      allowed,
      count: nextCount,
      remaining: Math.max(0, max_per_minute - nextCount),
      retry_after_seconds: allowed
        ? 0
        : Math.max(
          1,
          60 - Math.floor((now.getTime() - new Date(existing.window_start).getTime()) / 1000),
        ),
    };
  }

  await supa.from("rate_limit_log").insert({
    identifier,
    endpoint,
    request_count: 1,
    window_start: now.toISOString(),
  });
  return { allowed: true, count: 1, remaining: max_per_minute - 1, retry_after_seconds: 0 };
}

// ------------------- Concurrency (per-instance) -------------------
const inFlight = new Map<string, number>();

export function tryAcquireConcurrency(key: string, max: number): boolean {
  const cur = inFlight.get(key) ?? 0;
  if (cur >= max) return false;
  inFlight.set(key, cur + 1);
  return true;
}
export function releaseConcurrency(key: string): void {
  const cur = inFlight.get(key) ?? 0;
  if (cur <= 1) inFlight.delete(key);
  else inFlight.set(key, cur - 1);
}

/** 429 response helper. */
export function tooMany(retryAfter: number, body?: Record<string, unknown>): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Retry-After": String(Math.max(1, retryAfter || 30)),
  });
  return new Response(
    JSON.stringify({ error: "rate_limited", retry_after_seconds: retryAfter, ...body }),
    { status: 429, headers },
  );
}
