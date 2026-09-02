import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyManychatSignature } from "../_shared/manychat-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-manychat-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const raw = await req.text();
  const sig = req.headers.get("x-manychat-signature") || req.headers.get("x-hub-signature-256");
  const configured = !!Deno.env.get("MANYCHAT_WEBHOOK_SECRET");

  if (configured) {
    const ok = await verifyManychatSignature(raw, sig);
    if (!ok) {
      console.error("manychat-webhook: bad signature");
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("manychat-webhook: MANYCHAT_WEBHOOK_SECRET not set, accepting without verification (dev only)");
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = JSON.parse(raw);
    const subscriber = payload?.subscriber || payload?.contact || {};
    const subscriberId = String(subscriber.id || payload.subscriber_id || "");
    const platform = (payload?.platform || subscriber?.channel || "instagram") as string;
    const channel = platform.toLowerCase().includes("facebook") ? "facebook_messenger" : "instagram";
    const text = payload?.message?.text || payload?.last_input_text || "";
    const externalId = String(payload?.message?.id || payload?.event_id || `manychat_${Date.now()}`);
    const senderName = subscriber.first_name
      ? `${subscriber.first_name} ${subscriber.last_name || ""}`.trim()
      : (subscriber.username || subscriberId);

    // Match/create conversation keyed by external subscriber id in metadata
    const { data: existing } = await supabase
      .from("inbox_conversations")
      .select("id")
      .eq("channel", channel)
      .contains("metadata", { manychat_subscriber_id: subscriberId })
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId = existing?.id;
    if (!conversationId) {
      const { data: conv, error: convErr } = await supabase
        .from("inbox_conversations")
        .insert({
          channel,
          status: "open",
          subject: `New ${channel} message from ${senderName}`,
          last_message_at: new Date().toISOString(),
          metadata: {
            provider: "manychat",
            manychat_subscriber_id: subscriberId,
            platform,
          },
        })
        .select("id")
        .single();
      if (convErr) throw convErr;
      conversationId = conv.id;
    } else {
      await supabase
        .from("inbox_conversations")
        .update({ last_message_at: new Date().toISOString(), status: "open" })
        .eq("id", conversationId);
    }

    await supabase.from("inbox_messages").insert({
      conversation_id: conversationId,
      channel,
      content: text,
      sender_type: "user",
      sender_name: senderName,
      external_id: externalId,
      metadata: {
        provider: "manychat",
        manychat_subscriber_id: subscriberId,
        platform,
        raw: payload,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("manychat-webhook error:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
