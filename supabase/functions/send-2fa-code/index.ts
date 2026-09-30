/**
 * Phase 15: Legacy Authentication Decommissioning
 * 
 * STATUS: DECOMMISSIONED
 * 
 * This legacy Supabase Edge Function has been decommissioned.
 * All two-factor authentication setup, status checks, code dispatch, and verification
 * are now handled authoritatively by the RentMaikar backend engine
 * (/api/functions/send-2fa-code / OtpService / Authenticator).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.warn(
    `[DEPRECATION AUDIT] Legacy send-2fa-code invoked from ${req.headers.get("x-forwarded-for") || "unknown"}. Redirecting caller to authoritative backend.`
  );

  return new Response(
    JSON.stringify({
      success: false,
      error:
        "DECOMMISSIONED: 'send-2fa-code' edge function has been decommissioned in Phase 15. All 2FA operations are authoritatively handled by the RentMaikar backend API gateway (/api/functions/send-2fa-code).",
      decommissioned: true,
      phase: 15,
      migratedTo: "/api/functions/send-2fa-code",
    }),
    {
      status: 410,
      headers: corsHeaders,
    }
  );
});
