/**
 * Phase 15: Legacy Authentication Decommissioning
 * 
 * STATUS: DECOMMISSIONED
 * 
 * This legacy Supabase Edge Function has been decommissioned.
 * All phone verification codes, attempts, and profile state transitions
 * have been migrated to the authoritative RentMaikar backend engine
 * (/api/functions/verify-phone / OtpService).
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
    `[DEPRECATION AUDIT] Legacy verify-phone invoked from ${req.headers.get("x-forwarded-for") || "unknown"}. Redirecting caller to authoritative backend.`
  );

  return new Response(
    JSON.stringify({
      success: false,
      valid: false,
      error:
        "DECOMMISSIONED: 'verify-phone' edge function has been decommissioned in Phase 15. All phone verification is authoritatively handled by the RentMaikar backend API gateway (/api/functions/verify-phone).",
      decommissioned: true,
      phase: 15,
      migratedTo: "/api/functions/verify-phone",
    }),
    {
      status: 410,
      headers: corsHeaders,
    }
  );
});
