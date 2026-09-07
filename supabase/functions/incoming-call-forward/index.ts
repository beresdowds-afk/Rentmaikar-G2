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

    // ── Stage 2: the browser agents did not pick up ──────────────────────
    // Twilio re-posts here with DialCallStatus once the <Client> dial ends.
    const stage = new URL(req.url).searchParams.get("stage");
    if (stage === "agents") {
      const dialStatus = (form.get("DialCallStatus")?.toString() || "").toLowerCase();
      if (dialStatus === "completed" || dialStatus === "answered") {
        return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      }
      // Nobody in-app answered: fall back to the regional forwarding number
      // or voicemail, exactly as before.
      return xml(buildCallForwardTwiml(destination, publicSenderFor("call", to)));
    }


    // Register the real Twilio inbound leg so it appears in the admin Call
    // Queue (direction=inbound, status=ringing) instead of a simulated entry.
    if (callSid) {
      const { data: existing } = await supabase
        .from("voip_calls")
        .select("id")
        .eq("call_sid", callSid)
        .maybeSingle();

      let callId = existing?.id as string | undefined;

      if (!callId) {
        const { data: inserted, error: insertError } = await supabase
          .from("voip_calls")
          .insert({
            call_sid: callSid,
            call_type: "individual",
            direction: "inbound",
            status: "ringing",
            region,
            started_at: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle();
        if (insertError) {
          console.error("[incoming-call-forward] voip_calls insert failed:", insertError.message);
        }
        callId = inserted?.id as string | undefined;
      }

      if (!existing?.id && callId && from) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("phone", from)
          .maybeSingle();

        const { error: participantError } = await supabase
          .from("voip_call_participants")
          .insert({
            call_id: callId,
            participant_type: "caller",
            phone_number: from,
            display_name: profile?.full_name ?? null,
            user_id: profile?.id ?? null,
            region,
            status: "ringing",
            joined_at: new Date().toISOString(),
          });
        if (participantError) {
          console.error(
            "[incoming-call-forward] participant insert failed:",
            participantError.message,
          );
        }
      }
    }

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

    // ── Stage 1: ring the staff who have the call centre open ────────────
    // Any agent registered in the browser softphone in the last 90 seconds
    // and marked "available" rings simultaneously. If none answer, Twilio
    // re-posts to this function with stage=agents and we fall back to the
    // regional forwarding number / voicemail.
    const { data: agents } = await supabase
      .from("voip_agent_presence")
      .select("identity, region, last_seen_at")
      .eq("status", "available")
      .gte("last_seen_at", new Date(Date.now() - 90_000).toISOString())
      .in("region", [region, "All"])
      .limit(8);

    const identities = (agents ?? [])
      .map((a: { identity: string }) => a.identity)
      .filter((i) => /^[A-Za-z0-9_.-]+$/.test(i));

    if (identities.length > 0) {
      const base = Deno.env.get("VOICE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
      const action = `${base}/functions/v1/incoming-call-forward?stage=agents`;
      const clients = identities.map((i) => `<Client>${i}</Client>`).join("");
      console.log(`[incoming-call-forward] ringing ${identities.length} in-app agent(s)`);
      return xml(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you to a Rent My Car support agent.</Say>
  <Dial timeout="25" answerOnBridge="true" action="${action}" method="POST">${clients}</Dial>
</Response>`,
      );
    }

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
