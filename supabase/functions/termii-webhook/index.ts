import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isStopKeyword, isStartKeyword } from "../_shared/opt-out.ts";
import { maybeAutoReply } from "../_shared/auto-reply.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Classify Termii inbound message type ───
interface ParsedTermiiMessage {
  type: "text" | "image" | "document" | "location" | "interactive" | "unknown";
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  latitude?: number;
  longitude?: number;
  interactivePayload?: string;
}

const parseTermiiMessage = (payload: Record<string, unknown>): ParsedTermiiMessage => {
  const text = (payload.text || payload.body || payload.message || "") as string;
  const mediaUrl = payload.media_url as string | undefined;
  const mediaType = payload.media_type as string | undefined;
  const latitude = payload.latitude as number | undefined;
  const longitude = payload.longitude as number | undefined;
  const interactive = payload.interactive as Record<string, unknown> | undefined;

  // Location
  if (latitude && longitude) {
    return {
      type: "location",
      content: text || `📍 Location: ${latitude}, ${longitude}`,
      latitude,
      longitude,
    };
  }

  // Interactive reply
  if (interactive) {
    return {
      type: "interactive",
      content: text || (interactive.body as string) || "Interactive reply",
      interactivePayload: JSON.stringify(interactive),
    };
  }

  // Media (image or document)
  if (mediaUrl) {
    const isImage = mediaType?.startsWith("image/") ||
      mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    return {
      type: isImage ? "image" : "document",
      content: text || (isImage ? "📷 Image" : "📄 Document"),
      mediaUrl,
      mediaType,
    };
  }

  return { type: "text", content: text };
};

// ─── Process media from Termii ───
const processTermiiMedia = async (
  supabase: ReturnType<typeof createClient>,
  mediaUrl: string,
  mediaType: string | undefined,
  cleanFrom: string,
  messageId: string,
) => {
  try {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      console.warn("Failed to download Termii media:", mediaResponse.status);
      return { storagePath: null, publicUrl: mediaUrl };
    }

    const mediaBlob = await mediaResponse.blob();
    const contentType = mediaType || mediaResponse.headers.get("content-type") || "application/octet-stream";
    const ext = contentType.includes("pdf") ? "pdf"
      : contentType.includes("png") ? "png"
      : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
      : contentType.includes("word") ? "docx"
      : "bin";

    const storagePath = `whatsapp/${cleanFrom.replace("+", "")}/${messageId || Date.now()}.${ext}`;
    const bucket = contentType.startsWith("image/") ? "chat-attachments" : "user-documents";

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, mediaBlob, { contentType, upsert: true });

    if (uploadError) {
      console.warn("Termii media upload failed:", uploadError.message);
      return { storagePath: null, publicUrl: mediaUrl };
    }

    console.log(`Termii media uploaded to ${bucket}/${storagePath}`);
    return { storagePath: `${bucket}/${storagePath}`, publicUrl: mediaUrl };
  } catch (err) {
    console.warn("Termii media processing error:", err);
    return { storagePath: null, publicUrl: mediaUrl };
  }
};

// ─── Process location: update vehicle tracking ───
const processLocationMessage = async (
  supabase: ReturnType<typeof createClient>,
  cleanFrom: string,
  latitude: number,
  longitude: number,
) => {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("phone", cleanFrom)
      .single();

    if (!profile) return null;

    const { data: rental } = await supabase
      .from("rentals")
      .select("id, vehicle_id")
      .eq("driver_id", profile.user_id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (rental) {
      await supabase
        .from("iot_devices")
        .update({
          latitude,
          longitude,
          last_ping: new Date().toISOString(),
        })
        .eq("vehicle_id", rental.vehicle_id);

      console.log(`Location updated for vehicle ${rental.vehicle_id}`);
      return rental.vehicle_id;
    }
    return null;
  } catch (err) {
    console.warn("Location processing error:", err);
    return null;
  }
};

// Self-service command keywords
const COMMAND_KEYWORDS = [
  "PAY", "PAYMENT", "STATUS", "BALANCE", "HELP", "INFO", "SUPPORT",
  "OK", "DONE", "1", "BOOKING", "2", "3", "4", "HUMAN", "DOCS", "RULES", "IOT",
  // Negotiation keywords
  "ACCEPT", "REJECT", "COUNTER", "NEGOTIATE", "PRICE", "OFFER",
  "APPROVE", "DECLINE", "MODIFY", "LOCK",
];

// Negotiation-specific keywords for intent detection
const NEGOTIATION_KEYWORDS = [
  "ACCEPT", "REJECT", "COUNTER", "NEGOTIATE", "PRICE", "OFFER",
  "APPROVE", "DECLINE", "MODIFY", "LOCK",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ─── Termii Webhook Authentication ───
  // Fail closed: require a shared secret configured in the Termii dashboard.
  // Accept it via ?secret=... query param OR the `x-termii-secret` header.
  // Internal calls with the Supabase service-role bearer are also allowed.
  const configuredSecret = Deno.env.get("TERMII_WEBHOOK_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const providedHeader = req.headers.get("x-termii-secret") || "";
  const providedQuery = new URL(req.url).searchParams.get("secret") || "";
  const isServiceRole = !!serviceKey && bearer === serviceKey;
  const isSharedSecret =
    !!configuredSecret &&
    (providedHeader === configuredSecret || providedQuery === configuredSecret);

  if (!isServiceRole && !isSharedSecret) {
    console.error(
      "termii-webhook: unauthorized request (missing/invalid TERMII_WEBHOOK_SECRET or service-role bearer)",
    );
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }



  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();

    const from = (payload.from || payload.mobile || payload.phone || "") as string;
    const messageId = (payload.message_id || payload.id || "") as string;
    const channel = (payload.channel || "sms") as string;

    // Normalize Nigerian phone
    let cleanFrom = from;
    if (cleanFrom && !cleanFrom.startsWith("+")) {
      cleanFrom = cleanFrom.startsWith("234") ? `+${cleanFrom}` : `+234${cleanFrom}`;
    }

    const inboundChannel = channel === "whatsapp" ? "whatsapp" : "sms";

    // ─── Parse message type ───
    const parsed = parseTermiiMessage(payload);

    console.log("Termii inbound:", {
      from: cleanFrom,
      channel: inboundChannel,
      type: parsed.type,
      content: parsed.content?.substring(0, 50) + "...",
      messageId,
    });

    // ─── Route text commands to appropriate handler ───
    if (parsed.type === "text") {
      const upperBody = parsed.content.trim().toUpperCase();

      if (inboundChannel === "whatsapp" && COMMAND_KEYWORDS.includes(upperBody)) {
        console.log(`Forwarding WhatsApp command "${upperBody}" to whatsapp-commands`);
        await fetch(`${supabaseUrl}/functions/v1/whatsapp-commands`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ from: cleanFrom, text: parsed.content, channel: "whatsapp" }),
        });
        return new Response(
          JSON.stringify({ success: true, routed: "whatsapp-commands" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── STOP / START always route to the command handler ───
      if (isStopKeyword(parsed.content) || isStartKeyword(parsed.content)) {
        const target = inboundChannel === "whatsapp" ? "whatsapp-commands" : "sms-commands";
        console.log(`[Opt-out Router] Forwarding "${upperBody}" to ${target}`);
        await fetch(`${supabaseUrl}/functions/v1/${target}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ from: cleanFrom, text: parsed.content, channel: inboundChannel }),
        });
        return new Response(
          JSON.stringify({ success: true, routed: target }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Route negotiation keywords to inbox with high priority ───
      if (NEGOTIATION_KEYWORDS.includes(upperBody)) {
        console.log(`Negotiation keyword "${upperBody}" detected from ${cleanFrom}`);
        // Tag as negotiation for inbox prioritization — continues to save below
      }

      // Route SMS keywords to sms-commands
      const SMS_KEYWORDS = [
        "PAY", "PAYMENT", "STATUS", "BALANCE", "HELP", "INFO", "STOP", "START",
        "DOC", "DOCS", "LOCATION", "DONE", "1", "2", "3", "4", "HUMAN",
        // Negotiation keywords
        "ACCEPT", "REJECT", "COUNTER", "NEGOTIATE", "PRICE", "OFFER",
        "APPROVE", "DECLINE", "MODIFY", "LOCK",
      ];
      if (inboundChannel === "sms" && SMS_KEYWORDS.includes(upperBody)) {
        console.log(`Forwarding SMS command "${upperBody}" to sms-commands`);
        await fetch(`${supabaseUrl}/functions/v1/sms-commands`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ from: cleanFrom, text: parsed.content, channel: "sms" }),
        });
        // Continue to save message to inbox
      }
    }

    // ─── Process media ───
    let mediaMetadata: Record<string, unknown> = {};

    if ((parsed.type === "image" || parsed.type === "document") && parsed.mediaUrl) {
      const media = await processTermiiMedia(
        supabase, parsed.mediaUrl, parsed.mediaType, cleanFrom, messageId
      );
      mediaMetadata = {
        message_type: parsed.type,
        media_url: media.publicUrl,
        storage_path: media.storagePath,
        media_type: parsed.mediaType,
      };
    }

    // ─── Process location ───
    if (parsed.type === "location" && parsed.latitude && parsed.longitude) {
      const vehicleId = await processLocationMessage(
        supabase, cleanFrom, parsed.latitude, parsed.longitude
      );
      mediaMetadata = {
        message_type: "location",
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        vehicle_id: vehicleId,
      };
    }

    // ─── Interactive metadata ───
    if (parsed.type === "interactive") {
      mediaMetadata = {
        message_type: "interactive",
        interactive_payload: parsed.interactivePayload,
      };
    }

    // ─── Upsert conversation ───
    const { data: existingConversation } = await supabase
      .from("inbox_conversations")
      .select("*")
      .eq("user_phone", cleanFrom)
      .eq("channel", inboundChannel)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .single();

    let conversationId: string;

    if (existingConversation) {
      conversationId = existingConversation.id;
      await supabase
        .from("inbox_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } else {
      const { data: newConversation, error: createError } = await supabase
        .from("inbox_conversations")
        .insert({
          channel: inboundChannel,
          region: "NIGERIA",
          user_phone: cleanFrom,
          status: "open",
          priority: (parsed.type === "location" || (parsed.type === "text" && NEGOTIATION_KEYWORDS.includes(parsed.content.trim().toUpperCase()))) ? "high" : "normal",
          subject: NEGOTIATION_KEYWORDS.includes((parsed.content || "").trim().toUpperCase())
            ? `🤝 Negotiation reply from ${cleanFrom}`
            : `New ${inboundChannel.toUpperCase()} ${parsed.type} from ${cleanFrom}`,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) throw createError;
      conversationId = newConversation.id;
    }

    // ─── Save message ───
    const { error: messageError } = await supabase
      .from("inbox_messages")
      .insert({
        conversation_id: conversationId,
        channel: inboundChannel,
        content: parsed.content || "",
        sender_type: "user",
        sender_name: cleanFrom,
        external_id: messageId,
        metadata: {
          provider: "termii",
          region: "NIGERIA",
          message_type: parsed.type,
          is_negotiation: parsed.type === "text" && NEGOTIATION_KEYWORDS.includes(parsed.content.trim().toUpperCase()),
          negotiation_intent: NEGOTIATION_KEYWORDS.includes((parsed.content || "").trim().toUpperCase())
            ? parsed.content.trim().toUpperCase()
            : null,
          ...mediaMetadata,
          raw_payload: payload,
        },
      });

    if (messageError) throw messageError;

    console.log(`Termii ${parsed.type} message saved successfully`);

    // Optional keyword auto-reply
    await maybeAutoReply(supabase, {
      conversationId,
      content: parsed.content || "",
      channel: inboundChannel,
      region: "NIGERIA",
      recipientPhone: cleanFrom,
    });


    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Termii webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
