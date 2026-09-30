/**
 * Phase 15: Legacy Authentication Decommissioning
 * 
 * STATUS: DECOMMISSIONED
 * 
 * This legacy Supabase Edge Function has been decommissioned.
 * All phone OTP creation, validation, rate-limiting, and GoTrue session link
 * generation have been consolidated into the authoritative RentMaikar backend
 * engine (/api/functions/phone-otp-custom / OtpService / Authenticator).
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
    `[DEPRECATION AUDIT] Legacy phone-otp-custom invoked from ${req.headers.get("x-forwarded-for") || "unknown"}. Redirecting caller to authoritative backend.`
  );

  return new Response(
    JSON.stringify({
      success: false,
      error:
        "DECOMMISSIONED: 'phone-otp-custom' edge function has been decommissioned in Phase 15. All authentication is authoritatively handled by the RentMaikar backend API gateway (/api/functions/phone-otp-custom).",
      decommissioned: true,
      phase: 15,
      migratedTo: "/api/functions/phone-otp-custom",
    }),
    {
      status: 410,
      headers: corsHeaders,
    }
  );
});
