import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRoleOrRole } from "../_shared/auth-guards.ts";
import { whatchimp } from "../_shared/whatchimp-client.ts";
import { manychat } from "../_shared/manychat-client.ts";
import { isOptedOut } from "../_shared/opt-out.ts";
import { outboundPausedResponse, outboundRegionFromPhone } from "../_shared/channel-guard.ts";
import { sendViaSent } from "../_shared/sent-client.ts";
import { twilioFallbackAllowed } from "../_shared/twilio-messaging-guard.ts";
import { twilioCredentialsConfigured, twilioRequest } from "../_shared/twilio-auth.ts";

import { hasPlaceholders, renderPlaceholders, resolvePlaceholderValues } from "../_shared/reply-placeholders.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _auth = await requireServiceRoleOrRole(req, ["admin","admin_assistant","legal_support","iot_support","vehicle_support","insurance_support"]);
  if (_auth instanceof Response) return _auth;


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversationId, messageContent, channel, recipientPhone, attachments } = await req.json();

    interface OutboundAttachment {
      filename: string;
      contentType: string;
      size: number;
      storagePath: string;
      url: string;
    }
    const mediaList: OutboundAttachment[] = Array.isArray(attachments)
      ? (attachments as OutboundAttachment[]).filter((a) => a && typeof a.url === "string" && a.url)
      : [];
    // Providers cap outbound media; keep the first 10 and link the rest in the body.
    const mediaUrls = mediaList.slice(0, 10).map((a) => a.url);

    if (!conversationId || !messageContent || !channel) {
      throw new Error("Missing required fields: conversationId, messageContent, channel");
    }

    // ─── Look up conversation region + metadata (needed for social routing) ───
    const { data: conversation } = await supabase
      .from("inbox_conversations")
      .select("region, metadata, channel")
      .eq("id", conversationId)
      .single();

    // ─── Resolve {{placeholders}} before anything reaches a provider ───
    // Providers treat unresolved tokens as invalid template variables and
    // reject the whole message, so the text is always rendered first.
    let outboundText: string = messageContent;
    if (hasPlaceholders(messageContent)) {
      const values = await resolvePlaceholderValues(supabase, conversationId);
      outboundText = renderPlaceholders(messageContent, values, { keepUnknown: false })
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      if (outboundText && outboundText !== messageContent) {
        // Keep the stored thread copy identical to what the recipient reads.
        await supabase
          .from("inbox_messages")
          .update({ content: outboundText })
          .eq("conversation_id", conversationId)
          .eq("content", messageContent)
          .eq("sender_type", "admin");
      }
      if (!outboundText) outboundText = messageContent;
    }

    // ─── Social channels (Instagram / Facebook Messenger) → ManyChat ───
    if (channel === "instagram" || channel === "facebook_messenger") {
      const subscriberId = (conversation?.metadata as Record<string, unknown> | null)?.manychat_subscriber_id as string | undefined;
      if (!subscriberId) throw new Error("ManyChat subscriber_id missing on conversation");
      if (!manychat.isConfigured()) throw new Error("ManyChat not configured (MANYCHAT_API_TOKEN missing)");
      const result = await manychat.sendMessage(subscriberId, outboundText);
      if (!result.ok) throw new Error(`ManyChat send failed: ${JSON.stringify(result)}`);
      await supabase.from("inbox_messages").update({
        external_id: `manychat_${Date.now()}`,
        metadata: { provider: "manychat", sent_at: new Date().toISOString() },
      }).eq("conversation_id", conversationId).eq("content", outboundText).eq("sender_type", "admin")
        .is("external_id", null).order("created_at", { ascending: false }).limit(1);
      return new Response(JSON.stringify({ success: true, provider: "manychat" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!recipientPhone) throw new Error("recipientPhone required for phone-based channels");

    // ─── Admin outbound kill-switch (per channel + region) ───
    {
      const paused = await outboundPausedResponse(
        supabase,
        channel === "whatsapp" ? "whatsapp" : "sms",
        conversation?.region ?? outboundRegionFromPhone(recipientPhone),
        corsHeaders,
        { recipient: recipientPhone, functionName: "send-inbox-reply" },
      );
      if (paused) return paused;
    }

    let forwardingFrom: string | null = null;
    let regionWhatsappProvider: string | null = null;
    if (conversation?.region) {
      const { data: region } = await supabase
        .from("platform_regions")
        .select("forwarding_sms, forwarding_whatsapp")
        .eq("code", conversation.region)
        .single();
      if (region) forwardingFrom = channel === "whatsapp" ? region.forwarding_whatsapp : region.forwarding_sms;

      const { data: commProv } = await supabase
        .from("communication_providers")
        .select("whatsapp_provider")
        .eq("region_code", conversation.region)
        .maybeSingle();
      regionWhatsappProvider = commProv?.whatsapp_provider ?? null;
    }

    // ─── WhatsApp: honor per-region provider preference (Whatchimp / Twilio / Termii) ───
    const isNigeria = recipientPhone.startsWith("+234");
    let messageSid = "";
    let messageStatus = "";

    if (channel === "whatsapp" && regionWhatsappProvider === "whatchimp" && whatchimp.isConfigured()) {
      const result = await whatchimp.sendMessage({ to: recipientPhone, body: outboundText });
      if (!result.ok) throw new Error(`Whatchimp send failed: ${JSON.stringify(result)}`);
      messageSid = result.messageId;
      messageStatus = "sent";
      await supabase.from("inbox_messages").update({
        external_id: messageSid,
        metadata: { provider: "whatchimp", status: messageStatus, sent_at: new Date().toISOString() },
      }).eq("conversation_id", conversationId).eq("content", outboundText).eq("sender_type", "admin")
        .is("external_id", null).order("created_at", { ascending: false }).limit(1);
      return new Response(JSON.stringify({ success: true, provider: "whatchimp", messageSid }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (await isOptedOut(recipientPhone, channel === "whatsapp" ? "whatsapp" : "sms")) {
      console.log(`[opt-out] Suppressed inbox reply to ${recipientPhone}`);
      return new Response(
        JSON.stringify({
          success: false,
          suppressed: true,
          reason: "recipient_opted_out",
          error:
            "Recipient has opted out of messaging (STOP). They must reply START before we can message them again.",
        }),

        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── SENT.dm (global default CPaaS for SMS + WhatsApp) ───
    // Attempted before the regional providers; falls through silently when
    // the channel is disabled or the dispatch fails.
    {
      const sentChannel = channel === "whatsapp" ? "whatsapp" : "sms";
      const sentResult = await sendViaSent({
        to: recipientPhone,
        channel: sentChannel,
        text: outboundText,
        mediaUrls: mediaUrls,
        senderId: forwardingFrom || undefined,
        metadata: { conversation_id: conversationId, region: conversation?.region ?? null },
      });

      if (sentResult.ok) {
        console.log(`Inbox reply sent via Sent.dm (${sentChannel}):`, sentResult.messageId);
        await supabase.from("inbox_messages").update({
          external_id: sentResult.messageId,
          metadata: {
            provider: "sent",
            status: sentResult.status ?? "sent",
            sent_at: new Date().toISOString(),
            sent_from: forwardingFrom || "sent_default",
            is_forwarding_number: !!forwardingFrom,
            sandbox: sentResult.sandbox,
            ...(mediaList.length ? { attachments_detail: mediaList } : {}),
          },
        }).eq("conversation_id", conversationId).eq("content", outboundText).eq("sender_type", "admin")
          .is("external_id", null).order("created_at", { ascending: false }).limit(1);

        return new Response(
          JSON.stringify({
            success: true,
            provider: "sent",
            channel: sentChannel,
            messageSid: sentResult.messageId,
            status: sentResult.status ?? "sent",
            sentFrom: forwardingFrom || "default",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!sentResult.skipped) {
        console.warn(`[send-inbox-reply] Sent.dm dispatch failed, falling back: ${sentResult.error}`);
      }
    }

    if (isNigeria) {

      // ─── TERMII (Nigeria +234) ───
      const termiiApiKey = Deno.env.get("TERMII_API_KEY");
      const termiiSenderId = Deno.env.get("TERMII_SENDER_ID") || "Rentmaikar";

      if (!termiiApiKey) {
        throw new Error("TERMII_API_KEY is not configured for Nigeria messaging");
      }

      const isWhatsApp = channel === "whatsapp";
      const termiiChannel = isWhatsApp ? "whatsapp" : "generic";
      // Use forwarding sender ID if available
      const senderId = forwardingFrom || termiiSenderId;

      console.log(`Sending ${channel} via Termii to ${recipientPhone} from ${senderId}`);

      const termiiResponse = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientPhone.replace("+", ""),
          from: senderId,
          sms: mediaUrls.length
            ? `${outboundText}\n\n${mediaUrls.join("\n")}`
            : outboundText,
          type: "plain",
          channel: termiiChannel,
          api_key: termiiApiKey,
          notify_url: `${supabaseUrl}/functions/v1/termii-webhook`,
        }),
      });


      const termiiData = await termiiResponse.json();

      if (!termiiResponse.ok || termiiData.code !== "ok") {
        console.error("Termii API error:", termiiData);
        throw new Error(`Termii API error: ${termiiData.message || "Unknown error"}`);
      }

      messageSid = termiiData.message_id || `termii_${Date.now()}`;
      messageStatus = "sent";
      console.log("Message sent via Termii:", messageSid);
    } else {
      // ─── TWILIO (USA fallback) ───
      // Sent.dm is the global CPaaS; Twilio only picks up USA (+1) traffic
      // after Sent fails. Nigeria falls back to Termii above.
      if (!twilioFallbackAllowed(recipientPhone)) {
        throw new Error(
          "Sent.dm could not deliver this message and no fallback carrier is available for this destination. Check the Sent provider health panel.",
        );
      }

      const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

      if (!twilioCredentialsConfigured() || !TWILIO_PHONE_NUMBER) {
        throw new Error("Twilio credentials not configured");
      }

      let toNumber = recipientPhone;
      // Use forwarding number as "from" if configured, otherwise default provider number
      let fromNumber = forwardingFrom || TWILIO_PHONE_NUMBER;

      if (channel === "whatsapp") {
        toNumber = recipientPhone.startsWith("whatsapp:") ? recipientPhone : `whatsapp:${recipientPhone}`;
        fromNumber = `whatsapp:${(forwardingFrom || TWILIO_PHONE_NUMBER).replace(/^whatsapp:/i, "")}`;
      }

      console.log(`Sending ${channel} via Twilio to ${toNumber} from ${fromNumber}${forwardingFrom ? ' (forwarding)' : ''}`);

      const formData = new URLSearchParams();
      formData.append("To", toNumber);
      formData.append("From", fromNumber);
      formData.append("Body", outboundText);
      for (const url of mediaUrls) formData.append("MediaUrl", url);
      formData.append("StatusCallback", `${supabaseUrl}/functions/v1/twilio-webhook`);

      // Uses the approved API key SID/secret pair (auth token is set aside).
      const twilioResult = await twilioRequest("/Messages.json", {
        method: "POST",
        body: formData,
      });
      const twilioData = twilioResult.payload as Record<string, any>;

      if (!twilioResult.ok) {
        console.error("Twilio API error:", twilioData);
        throw new Error(`Twilio API error: ${twilioData.message || twilioData.error_message || "Unknown error"}`);
      }

      messageSid = twilioData.sid;
      messageStatus = twilioData.status;
      console.log("Message sent via Twilio:", messageSid);

    }

    // Update the message in the database with external_id
    const provider = isNigeria ? "termii" : "twilio";
    const { error: updateError } = await supabase
      .from("inbox_messages")
      .update({
        external_id: messageSid,
        metadata: {
          provider,
          status: messageStatus,
          sent_at: new Date().toISOString(),
          sent_from: forwardingFrom || (isNigeria ? "default_termii" : "default_twilio"),
          is_forwarding_number: !!forwardingFrom,
          ...(mediaList.length ? { attachments_detail: mediaList } : {}),
        },
      })
      .eq("conversation_id", conversationId)
      .eq("content", outboundText)
      .eq("sender_type", "admin")
      .is("external_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (updateError) {
      console.warn("Failed to update message with external ID:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageSid,
        status: messageStatus,
        provider,
        sentFrom: forwardingFrom || "default",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Send reply error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
