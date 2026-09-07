// TwiML App voice URL for in-app (WebRTC) calls.
//
// Twilio POSTs here whenever a browser client placed through the Voice SDK
// connects, and whenever an inbound leg is bridged to a client identity.
// It answers with TwiML that bridges the browser leg to its destination.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioVoiceCallback } from "../_shared/twilio-callback-auth.ts";

const xmlHeaders = { "Content-Type": "text/xml; charset=utf-8" };

function xml(body: string, status = 200) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status,
    headers: xmlHeaders,
  });
}

function say(message: string) {
  return xml(`<Response><Say voice="alice">${message}</Say><Hangup/></Response>`);
}

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: xmlHeaders });

  try {
    const form = await req.formData();
    const denied = await verifyTwilioVoiceCallback(req, form);
    if (denied) return denied;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const voiceBaseUrl = Deno.env.get("VOICE_SUPABASE_URL") || supabaseUrl;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const to = String(form.get("To") ?? "").trim();
    const from = String(form.get("From") ?? "").trim();
    const callSid = String(form.get("CallSid") ?? "");
    const region = String(form.get("Region") ?? form.get("region") ?? "USA");

    if (!to) return say("No destination was provided for this call.");

    // Resolve the browser caller (identity is user_<uuid>) for audit history.
    const callerUserId = from.startsWith("client:user_")
      ? from.replace("client:user_", "")
      : null;

    // Outgoing legs present an admin-facing dial-out number as caller ID; the
    // exact number is chosen from the admin-managed routing table by the
    // staff member's role and region, with the secrets as a fallback.
    let callerId = "";
    if (callerUserId) {
      const { data: routed, error: routeError } = await supabase.rpc(
        "voip_resolve_outbound_number",
        { _user_id: callerUserId, _region: region },
      );
      if (routeError) console.error("voip_resolve_outbound_number failed", routeError.message);
      if (typeof routed === "string") callerId = routed;
    }
    if (!callerId) {
      callerId =
        Deno.env.get("TWILIO_VOICE_FROM") ||
        Deno.env.get("TWILIO_OUTBOUND_NUMBER") ||
        Deno.env.get("TWILIO_PHONE_NUMBER") ||
        "";
    }


    let dialTarget: string;

    if (to.startsWith("client:") || to.startsWith("user_")) {
      const identity = to.replace(/^client:/, "");
      dialTarget = `<Client>${esc(identity)}</Client>`;
    } else if (to === "support") {
      const { data: company } = await supabase
        .from("platform_company_info")
        .select("phone_raw, phone")
        .eq("region", region)
        .eq("is_active", true)
        .maybeSingle();

      const supportNumber = (company?.phone_raw || company?.phone || "").replace(/[^\d+]/g, "");
      if (!supportNumber) {
        return say("Support calling is not available for your region right now. Please request a callback.");
      }
      dialTarget = `<Number>${esc(supportNumber)}</Number>`;
    } else if (/^\+\d{8,15}$/.test(to)) {
      dialTarget = `<Number>${esc(to)}</Number>`;
    } else {
      return say("That destination is not valid.");
    }

    if (callerUserId) {
      await supabase.from("voip_calls").insert({
        call_sid: callSid || null,
        initiated_by: callerUserId,
        call_type: "individual",
        region,
        status: "in-progress",
        direction: "outbound",
        started_at: new Date().toISOString(),
      });
    }

    const statusCallback = `${voiceBaseUrl}/functions/v1/voip-status-callback`;
    const recordingCallback = `${voiceBaseUrl}/functions/v1/recording-status-callback`;

    return xml(
      `<Response><Dial answerOnBridge="true" timeout="30"` +
        (callerId ? ` callerId="${esc(callerId)}"` : "") +
        ` record="record-from-answer-dual"` +
        ` recordingStatusCallback="${esc(recordingCallback)}"` +
        ` recordingStatusCallbackEvent="completed"` +
        ` action="${esc(statusCallback)}" method="POST">${dialTarget}</Dial></Response>`,
    );
  } catch (e) {
    console.error("voice-twiml-dial error", e);
    return say("We could not connect your call. Please try again.");
  }
});
