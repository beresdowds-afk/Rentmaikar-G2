import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioVoiceCallback } from "../_shared/twilio-callback-auth.ts";
import {
  buildCallForwardTwiml,
  getForwardingDestination,
  isForwardingEnabled,
  regionFromPhone,
} from "../_shared/forwarding.ts";
import { publicSenderFor } from "../_shared/comms-endpoints.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

const xml = (body: string) =>
  new Response(body, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/xml" },
  });

/**
 * Inbound call forwarding.
 *
 * Configure this function's URL as the "A Call Comes In" voice webhook on the
 * Twilio number. Genuine, signed Twilio requests are bridged to the regional
 * forwarding number from Contact Settings; otherwise the caller is sent to
 * voicemail.
 */
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const form = await req.formData();
    const denied = await verifyTwilioVoiceCallback(req, form);
    if (denied) return denied;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const from = (form.get("From")?.toString() || "").trim();
    const to = (form.get("To")?.toString() || "").trim();
    const callSid = form.get("CallSid")?.toString() || "";
    const region = regionFromPhone(to, from);

    const enabled = await isForwardingEnabled(supabase, "call");
    const destination = enabled
      ? await getForwardingDestination(supabase, "call", region)
      : null;

    console.log(
      `[incoming-call-forward] region=${region} enabled=${enabled} destination=${destination ? "configured" : "none"}`,
    );

    await logMessagingEvent(supabase, {
      channel: "voip",
      provider: "twilio",
      event_type: destination ? "forwarded" : "received",
      direction: "inbound",
      recipient: to,
      sender: from,
      region,
      provider_message_id: callSid,
      metadata: {
        forwarding_enabled: enabled,
        forwarded: !!destination,
        // Preserve the customer's original number and the endpoint that
        // actually handled the conversation.
        customer_phone: from,
        public_alias: to,
        endpoint: destination,
      },
    }).catch((e) => console.error("[incoming-call-forward] event log failed:", e));

    // Present a published RentMaikar number as caller ID (never the
    // dial-out-only number, never the master endpoint).
    return xml(buildCallForwardTwiml(destination, publicSenderFor("call", to)));

  } catch (error) {
    console.error("[incoming-call-forward] error:", error);
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">We are unable to take your call right now. Please try again later.</Say></Response>`,
    );
  }
});
