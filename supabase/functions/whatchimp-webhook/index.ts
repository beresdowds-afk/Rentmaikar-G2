import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyWhatchimpSignature } from "../_shared/whatchimp-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Meta-style webhook verification challenge (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATCHIMP_VERIFY_TOKEN") || Deno.env.get("WHATCHIMP_WEBHOOK_SECRET");
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge || "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  const configured = !!Deno.env.get("WHATCHIMP_WEBHOOK_SECRET");

  if (configured) {
    const ok = await verifyWhatchimpSignature(raw, sig);
    if (!ok) {
      console.error("whatchimp-webhook: bad signature");
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("whatchimp-webhook: WHATCHIMP_WEBHOOK_SECRET not set, accepting without verification (dev only)");
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = JSON.parse(raw);

    // Meta/Whatchimp payload shape: entry[].changes[].value.messages[]
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const messages = change?.value?.messages || [];
        for (const msg of messages) {
          const from = "+" + String(msg.from || "").replace(/^\+/, "");
          const messageId = msg.id || `whatchimp_${Date.now()}`;
          const text = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || "";
          const mediaUrl = msg.image?.link || msg.document?.link || null;

          // Upsert conversation
          const { data: existing } = await supabase
            .from("inbox_conversations")
            .select("id")
            .eq("user_phone", from)
            .eq("channel", "whatsapp")
            .neq("status", "closed")
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          let conversationId = existing?.id;
          if (!conversationId) {
            const { data: conv, error: convErr } = await supabase
              .from("inbox_conversations")
              .insert({
                channel: "whatsapp",
                user_phone: from,
                status: "open",
                subject: `New WhatsApp (Whatchimp) from ${from}`,
                last_message_at: new Date().toISOString(),
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
            channel: "whatsapp",
            content: text,
            sender_type: "user",
            sender_name: from,
            external_id: messageId,
            metadata: {
              provider: "whatchimp",
              media_url: mediaUrl,
              raw: msg,
            },
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("whatchimp-webhook error:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
