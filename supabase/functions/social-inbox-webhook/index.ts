import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Unified social inbox webhook.
 * Accepts inbound messages from Meta (Facebook / Instagram), LinkedIn and Google
 * channels and threads them into the unified inbox.
 *
 * URL: /functions/v1/social-inbox-webhook?platform=facebook|instagram|linkedin|google
 */

const ALLOWED = ["facebook", "instagram", "linkedin", "google"] as const;
type Platform = (typeof ALLOWED)[number];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Normalized {
  senderId: string;
  senderName?: string;
  senderEmail?: string;
  text: string;
  externalId?: string;
}

const asString = (v: unknown, max = 4000) =>
  typeof v === "string" ? v.slice(0, max) : undefined;

function normalize(platform: Platform, body: any): Normalized[] {
  const out: Normalized[] = [];

  if (platform === "facebook" || platform === "instagram") {
    for (const entry of body?.entry ?? []) {
      for (const ev of entry?.messaging ?? []) {
        const text = asString(ev?.message?.text);
        if (!text) continue;
        out.push({
          senderId: String(ev?.sender?.id ?? "unknown"),
          text,
          externalId: asString(ev?.message?.mid, 200),
        });
      }
    }
    return out;
  }

  if (platform === "linkedin") {
    const events = Array.isArray(body?.events) ? body.events : [body];
    for (const ev of events) {
      const text = asString(ev?.message?.text ?? ev?.text ?? ev?.eventContent?.text);
      if (!text) continue;
      out.push({
        senderId: String(ev?.from ?? ev?.sender ?? "unknown"),
        senderName: asString(ev?.senderName, 200),
        text,
        externalId: asString(ev?.id ?? ev?.eventId, 200),
      });
    }
    return out;
  }

  // Google Business Messages / Google Chat
  const text = asString(body?.message?.text ?? body?.text);
  if (text) {
    out.push({
      senderId: String(body?.conversationId ?? body?.message?.sender?.name ?? body?.user?.name ?? "unknown"),
      senderName: asString(body?.user?.displayName ?? body?.context?.userInfo?.displayName, 200),
      senderEmail: asString(body?.user?.email, 320),
      text,
      externalId: asString(body?.message?.name ?? body?.requestId, 200),
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const platform = (url.searchParams.get("platform") ?? "").toLowerCase() as Platform;

  if (!ALLOWED.includes(platform)) {
    return new Response(
      JSON.stringify({ error: "Unsupported platform", allowed: ALLOWED }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Meta subscription verification handshake
  if (req.method === "GET") {
    const challenge = url.searchParams.get("hub.challenge");
    const token = url.searchParams.get("hub.verify_token");
    const expected = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    if (challenge && (!expected || token === expected)) {
      return new Response(challenge, { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const { data: config } = await supabase
      .from("social_messaging_configs")
      .select("platform, is_enabled")
      .ilike("platform", `${platform}%`)
      .limit(1)
      .maybeSingle();

    if (config && config.is_enabled === false) {
      return new Response(JSON.stringify({ ok: true, skipped: "channel_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = normalize(platform, body);
    let stored = 0;

    for (const msg of messages) {
      const handle = `${platform}:${msg.senderId}`;

      const { data: existing } = await supabase
        .from("inbox_conversations")
        .select("id")
        .eq("channel", platform)
        .eq("user_name", msg.senderName ?? handle)
        .neq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let conversationId = existing?.id as string | undefined;

      if (conversationId) {
        await supabase
          .from("inbox_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      } else {
        const { data: created, error: createErr } = await supabase
          .from("inbox_conversations")
          .insert({
            channel: platform,
            region: "USA",
            user_name: msg.senderName ?? handle,
            user_email: msg.senderEmail ?? null,
            status: "open",
            priority: "normal",
            subject: `New ${platform} message from ${msg.senderName ?? msg.senderId}`,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (createErr) throw createErr;
        conversationId = created.id;
      }

      const { error: msgErr } = await supabase.from("inbox_messages").insert({
        conversation_id: conversationId,
        channel: platform,
        content: msg.text,
        sender_type: "user",
        sender_name: msg.senderName ?? handle,
        external_id: msg.externalId ?? null,
        metadata: { provider: platform, sender_id: msg.senderId },
      });
      if (msgErr) throw msgErr;
      stored += 1;
    }

    return new Response(JSON.stringify({ ok: true, stored }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("social-inbox-webhook failed", e);
    return new Response(
      JSON.stringify({ error: "Failed to process social message", details: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
