// ════════════════════════════════════════════════════════════
// Case IVR — inbound voice menu for the public numbers.
//
// Configure as the "A call comes in" webhook. The caller picks a reason, the
// call is logged in the call log, a case is opened for it, the customer gets a
// text with the case number, and the call is handed to the staff softphones.
// ════════════════════════════════════════════════════════════
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioVoiceCallback } from "../_shared/twilio-callback-auth.ts";
import { regionFromPhone } from "../_shared/forwarding.ts";
import { sendViaSent } from "../_shared/sent-client.ts";

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

const MENU: Record<string, { subject: string; priority: string }> = {
  "1": { subject: "Rental or payment enquiry", priority: "normal" },
  "2": { subject: "Vehicle problem or breakdown", priority: "high" },
  "3": { subject: "New rental enquiry", priority: "normal" },
  "4": { subject: "Message left for support", priority: "normal" },
};

// deno-lint-ignore no-explicit-any
type Supa = any;

async function ensureCall(supabase: Supa, callSid: string, region: string, from: string) {
  const { data: existing } = await supabase
    .from("voip_calls")
    .select("id, case_id")
    .eq("call_sid", callSid)
    .maybeSingle();
  if (existing?.id) return existing;

  const { data: profile } = from
    ? await supabase.from("profiles").select("user_id, full_name").eq("phone", from).maybeSingle()
    : { data: null };

  const { data: inserted, error } = await supabase
    .from("voip_calls")
    .insert({
      call_sid: callSid,
      call_type: "individual",
      direction: "inbound",
      status: "ringing",
      region,
      receiver_id: profile?.user_id ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id, case_id")
    .maybeSingle();
  if (error) console.error("[voice-ivr-case] call insert failed:", error.message);
  return inserted ?? null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const form = await req.formData();
    const denied = await verifyTwilioVoiceCallback(req, form);
    if (denied) return denied;

    const url = new URL(req.url);
    const stage = url.searchParams.get("stage");
    const base = Deno.env.get("VOICE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const from = (form.get("From")?.toString() || "").trim();
    const to = (form.get("To")?.toString() || "").trim();
    const callSid = form.get("CallSid")?.toString() || "";
    const digits = form.get("Digits")?.toString() || "";
    const region = regionFromPhone(to, from);

    // ── Stage 1: play the menu ───────────────────────────────────────────
    if (stage !== "menu") {
      return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="8" action="${base}/functions/v1/voice-ivr-case?stage=menu" method="POST">
    <Say voice="alice">Welcome to Rent My Car support. For a rental or payment question, press 1. For a vehicle problem or breakdown, press 2. To rent a vehicle, press 3. To leave a message, press 4.</Say>
  </Gather>
  <Say voice="alice">We did not get your selection. Goodbye.</Say>
</Response>`);
    }

    // ── Stage 2: the caller chose a reason — open the case ───────────────
    const choice = MENU[digits] ?? MENU["1"];
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let caseNumber: string | null = null;

    if (callSid) {
      const call = await ensureCall(supabase, callSid, region, from);
      if (call?.id) {
        const { data: caseId, error } = await supabase.rpc("case_for_call", {
          p_call_id: call.id,
          p_subject: choice.subject,
        });
        if (error) {
          console.error("[voice-ivr-case] case_for_call failed:", error.message);
        } else if (caseId) {
          const { data: updated } = await supabase
            .from("support_cases")
            .update({
              priority: choice.priority,
              customer_phone: from || null,
              origin_channel: "call",
              metadata: { ivr_option: digits, public_alias: to },
            })
            .eq("id", caseId)
            .select("case_number")
            .maybeSingle();
          caseNumber = updated?.case_number ?? null;

          await supabase.from("case_events").insert({
            case_id: caseId,
            event_type: "ivr_selection",
            description: `Caller chose "${choice.subject}"`,
            metadata: { digits, call_sid: callSid },
          });
        }
      }
    }

    // Text the case number to the caller so they can follow it in the portal.
    if (caseNumber && from) {
      sendViaSent({
        to: from,
        channel: "sms",
        text:
          `Rent My Car: we have opened case ${caseNumber} for your call about ${choice.subject.toLowerCase()}. Reply to this message any time, or track it in your account.`,
        metadata: { case_number: caseNumber },
      }).catch((e) => console.error("[voice-ivr-case] sms failed:", e));
    }

    const spoken = caseNumber
      ? `Thank you. We have opened case ${caseNumber.replace(/\D/g, "").split("").join(" ")} and texted you the details.`
      : "Thank you. We have logged your call.";

    if (digits === "4") {
      return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${spoken} Please leave your message after the tone, then hang up.</Say>
  <Record maxLength="120" playBeep="true" />
  <Say voice="alice">Thank you. A support agent will follow up. Goodbye.</Say>
</Response>`);
    }

    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${spoken} Please hold while we connect you.</Say>
  <Redirect method="POST">${base}/functions/v1/incoming-call-forward</Redirect>
</Response>`);
  } catch (error) {
    console.error("[voice-ivr-case] error:", error);
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">We are unable to take your call right now. Please try again later.</Say></Response>`,
    );
  }
});
