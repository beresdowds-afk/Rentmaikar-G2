export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-internal-secret, idempotency-key, x-cron-secret, x-api-key, prefer, accept, origin, x-requested-with, x-rentmaikar-client, x-rentmaikar-fallback, x-test-role, x-test-user-id",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type, X-Entity-Ref-ID, Message-ID, Date",
  "Access-Control-Max-Age": "86400",
};

/**
 * Convenience handler for preflight OPTIONS requests across Edge Functions.
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}
