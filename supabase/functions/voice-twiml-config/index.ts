// Admin-only helper that reports the exact URLs the Twilio TwiML App must use
// for in-app (WebRTC) calling, and verifies the live TwiML App configuration.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json(403, { error: "Admin access required" });

    let action: string = "verify";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.action === "string") action = body.action;
      } catch {
        // no body -> verify
      }
    }

    const expected = {
      voiceUrl: `${supabaseUrl}/functions/v1/voice-twiml-dial`,
      voiceMethod: "POST",
      statusCallbackUrl: `${supabaseUrl}/functions/v1/voip-status-callback`,
      recordingCallbackUrl: `${supabaseUrl}/functions/v1/recording-status-callback`,
      accessTokenUrl: `${supabaseUrl}/functions/v1/voice-access-token`,
    };

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twimlAppSid = Deno.env.get("TWILIO_TWIML_APP_SID");
    const apiKeySid = Deno.env.get("TWILIO_API_KEY_SID") || Deno.env.get("TWILIO_API_KEY");
    const apiKeySecret = Deno.env.get("TWILIO_API_KEY_SECRET") || Deno.env.get("TWILIO_API_SECRET");

    const secrets = {
      TWILIO_ACCOUNT_SID: !!accountSid,
      TWILIO_AUTH_TOKEN: !!authToken,
      TWILIO_TWIML_APP_SID: !!twimlAppSid,
      TWILIO_API_KEY_SID: !!apiKeySid,
      TWILIO_API_SECRET: !!apiKeySecret,
      TWILIO_PHONE_NUMBER: !!Deno.env.get("TWILIO_PHONE_NUMBER"),
    };

    // RentMaikar authenticates Twilio REST with the API key/secret pair first;
    // the account auth token is only a fallback.
    const credentials: Array<{ label: string; header: string }> = [];
    if (apiKeySid && apiKeySecret) {
      credentials.push({ label: "TWILIO_API_KEY_SID", header: "Basic " + btoa(`${apiKeySid}:${apiKeySecret}`) });
    }
    if (accountSid && authToken) {
      credentials.push({ label: "TWILIO_AUTH_TOKEN", header: "Basic " + btoa(`${accountSid}:${authToken}`) });
    }


    if (!accountSid || !twimlAppSid || credentials.length === 0) {
      return json(200, {
        expected,
        secrets,
        twimlApp: null,
        matches: false,
        error: "Twilio account credentials or TwiML App SID are not configured.",
      });
    }

    const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}.json`;

    // Pick the first credential set Twilio actually accepts.
    let basicAuth = "";
    let lastStatus = 0;
    let lastDetails = "";
    for (const cred of credentials) {
      const probe = await fetch(base, { headers: { Authorization: cred.header } });
      const probeText = await probe.text();
      if (probe.ok) {
        basicAuth = cred.header;
        break;
      }
      lastStatus = probe.status;
      lastDetails = probeText;
      console.error(`Twilio auth check failed with ${cred.label} [${probe.status}]: ${probeText}`);
    }

    if (!basicAuth) {
      // Return 200 so the admin panel can render actionable guidance instead of crashing.
      return json(200, {
        expected,
        secrets,
        twimlApp: null,
        matches: false,
        error:
          lastStatus === 401
            ? "Twilio rejected the stored credentials (error 20003). Verify TWILIO_ACCOUNT_SID matches the account that owns the TwiML App, and that TWILIO_AUTH_TOKEN (or the API key/secret pair) is current."
            : `Twilio request failed with status ${lastStatus}.`,
        details: lastDetails,
        status: lastStatus,
      });
    }

    // Create a dedicated RentMaikar TwiML App instead of repurposing an
    // existing (e.g. Flex) application. The returned SID must be stored as
    // TWILIO_TWIML_APP_SID.
    if (action === "create") {
      const createRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications.json`,
        {
          method: "POST",
          headers: { Authorization: basicAuth, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            FriendlyName: "RentMaikar Call Centre",
            VoiceUrl: expected.voiceUrl,
            VoiceMethod: "POST",
            StatusCallback: expected.statusCallbackUrl,
            StatusCallbackMethod: "POST",
          }),
        },
      );
      const createText = await createRes.text();
      if (!createRes.ok) {
        return json(200, { expected, secrets, twimlApp: null, matches: false, error: "Failed to create TwiML App", status: createRes.status, details: createText });
      }
      const created = JSON.parse(createText);
      return json(200, {
        expected,
        secrets,
        created: { sid: created.sid, friendlyName: created.friendly_name, voiceUrl: created.voice_url },
        matches: true,
        note: "Store this SID as TWILIO_TWIML_APP_SID.",
      });
    }

    if (action === "apply") {

      const applyRes = await fetch(base, {
        method: "POST",
        headers: { Authorization: basicAuth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          VoiceUrl: expected.voiceUrl,
          VoiceMethod: "POST",
          StatusCallback: expected.statusCallbackUrl,
          StatusCallbackMethod: "POST",
        }),
      });
      const applyText = await applyRes.text();
      if (!applyRes.ok) {
        console.error(`Twilio update failed [${applyRes.status}]: ${applyText}`);
        return json(200, {
          expected,
          secrets,
          twimlApp: null,
          matches: false,
          error: "Failed to update TwiML App",
          status: applyRes.status,
          details: applyText,
        });
      }
    }

    const res = await fetch(base, { headers: { Authorization: basicAuth } });
    const text = await res.text();
    if (!res.ok) {
      console.error(`Twilio fetch failed [${res.status}]: ${text}`);
      return json(200, {
        expected,
        secrets,
        twimlApp: null,
        matches: false,
        error: "Failed to read TwiML App",
        status: res.status,
        details: text,
      });
    }

    const app = JSON.parse(text);
    const twimlApp = {
      sid: app.sid,
      friendlyName: app.friendly_name,
      voiceUrl: app.voice_url,
      voiceMethod: app.voice_method,
      statusCallback: app.status_callback,
      statusCallbackMethod: app.status_callback_method,
    };

    const matches =
      twimlApp.voiceUrl === expected.voiceUrl &&
      String(twimlApp.voiceMethod).toUpperCase() === "POST";

    return json(200, { expected, secrets, twimlApp, matches, applied: action === "apply" });
  } catch (e) {
    console.error("voice-twiml-config error", e);
    return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
  }
});
