// Send an SMS/WhatsApp update to the customer on a case, from the admin panel.
// The message goes out on the public messaging number (+1 608 548 9220, Sent.dm),
// is stored on the case thread and recorded on the case timeline.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaSent } from "../_shared/sent-client.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { regionFromPhone } from "../_shared/forwarding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ error: "Not authenticated" }, 401);

    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return json({ error: "Admins only" }, 403);

    const payload = await req.json().catch(() => ({}));
    const caseId = String(payload.case_id ?? "");
    const body = String(payload.body ?? "").trim();
    const channel = payload.channel === "whatsapp" ? "whatsapp" : "sms";

    if (!/^[0-9a-f-]{36}$/i.test(caseId)) return json({ error: "A valid case is required" }, 400);
    if (!body || body.length > 1000) {
      return json({ error: "Message must be between 1 and 1000 characters" }, 400);
    }

    const { data: caseRow } = await admin
      .from("support_cases")
      .select("id, case_number, customer_phone, customer_name, region, conversation_id")
      .eq("id", caseId)
      .maybeSingle();

    if (!caseRow) return json({ error: "Case not found" }, 404);
    if (!caseRow.customer_phone) {
      return json({ error: "This case has no customer phone number" }, 400);
    }

    const text = `[${caseRow.case_number}] ${body}`;
    const result = await sendViaSent({
      to: caseRow.customer_phone,
      channel,
      text,
      metadata: { case_id: caseRow.id, case_number: caseRow.case_number },
    });

    const region = caseRow.region || regionFromPhone(caseRow.customer_phone);

    await logMessagingEvent(admin, {
      channel,
      provider: "sent",
      event_type: result.ok ? "sent" : "failed",
      direction: "outbound",
      recipient: caseRow.customer_phone,
      region,
      provider_message_id: result.messageId,
      metadata: { case_id: caseRow.id, case_number: caseRow.case_number },
    }).catch((e) => console.error("[case-send-sms] event log failed:", e));

    if (!result.ok) {
      await admin.from("case_events").insert({
        case_id: caseRow.id,
        event_type: "message_failed",
        description: `${channel === "whatsapp" ? "WhatsApp" : "SMS"} update could not be sent`,
        actor_id: user.id,
        metadata: { error: result.error ?? "unknown" },
      });
      return json({ error: result.error ?? "The message could not be sent" }, 502);
    }

    // Store it on the case thread so the customer portal shows the update too.
    if (caseRow.conversation_id) {
      await admin.from("inbox_messages").insert({
        conversation_id: caseRow.conversation_id,
        channel,
        sender_type: "admin",
        sender_id: user.id,
        content: text,
        external_id: result.messageId ?? null,
        metadata: { case_id: caseRow.id },
      });
    }

    await admin.from("case_notes").insert({
      case_id: caseRow.id,
      author_id: user.id,
      author_role: "admin",
      body: text,
      is_internal: false,
    });

    await admin.from("case_events").insert({
      case_id: caseRow.id,
      event_type: "message_sent",
      description: `${channel === "whatsapp" ? "WhatsApp" : "SMS"} update sent to the customer`,
      actor_id: user.id,
      metadata: { provider_message_id: result.messageId ?? null },
    });

    return json({ sent: true, message_id: result.messageId ?? null });
  } catch (error) {
    console.error("[case-send-sms] error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      500,
    );
  }
});
