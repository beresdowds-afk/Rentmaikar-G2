// Mints a short-lived Twilio Voice access token so the browser (or PWA) can
// register as a WebRTC client and place / receive in-app calls.
//
// Without this endpoint the Twilio Voice SDK has no identity and every in-app
// call fails before it reaches the network.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TTL_SECONDS = 3600;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization header" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const apiKeySid = Deno.env.get("TWILIO_API_KEY_SID") || Deno.env.get("TWILIO_API_KEY");
    const apiKeySecret = Deno.env.get("TWILIO_API_KEY_SECRET") || Deno.env.get("TWILIO_API_SECRET");
    const twimlAppSid = Deno.env.get("TWILIO_TWIML_APP_SID");

    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !apiKeySid && "TWILIO_API_KEY_SID",
      !apiKeySecret && "TWILIO_API_SECRET",
      !twimlAppSid && "TWILIO_TWIML_APP_SID",
    ].filter(Boolean);
    if (missing.length) {
      console.error("voice-access-token: missing config", missing);
      return json(503, {
        error: "In-app calling is not configured",
        details: `Missing: ${missing.join(", ")}`,
      });
    }

    // Identity is stable per user so admins can dial a specific client back.
    const identity = `user_${user.id}`;
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({
      jti: `${apiKeySid}-${now}`,
      grants: {
        identity,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: twimlAppSid },
        },
      },
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" })
      .setIssuer(apiKeySid!)
      .setSubject(accountSid!)
      .setNotBefore(now)
      .setIssuedAt(now)
      .setExpirationTime(now + TTL_SECONDS)
      .sign(new TextEncoder().encode(apiKeySecret!));

    return json(200, { token, identity, ttl: TTL_SECONDS });
  } catch (e) {
    console.error("voice-access-token error", e);
    return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
  }
});
