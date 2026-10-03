// ════════════════════════════════════════════════════════════
// Sent.dm delivery-status receiver
//
//   Sent.dm status callback → this function → messaging_events
//
// Mirrors `resend-events` for email: every provider status update for an
// outbound SMS/WhatsApp message is persisted as an outbound `messaging_events`
// row so the admin delivery log reflects the final outcome (queued → sent →
// delivered / failed) instead of only the initial send result.
// ════════════════════════════════════════════════════════════
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logMessagingEvent, type MessagingEventType } from "../_shared/messaging-events.ts";
import { regionFromPhone } from "../_shared/forwarding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sent-signature, x-webhook-signature",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Token, hex-HMAC, or `t=...,v1=...` signature modes (same as sent-inbound). */
async function verifySignature(req: Request, raw: string): Promise<boolean> {
  const secret = Deno.env.get("SENT_WEBHOOK_SECRET") ?? "";
  if (!secret) {
    console.warn("[sent-status] SENT_WEBHOOK_SECRET not set — accepting unverified");
    return true;
  }
  const signature =
    req.headers.get("x-sent-signature") || req.headers.get("x-webhook-signature");
  if (!signature) return false;
  if (signature === secret) return true;

  const expected = await hmacHex(secret, raw);
  if (signature === expected) return true;

  const parts = Object.fromEntries(
    signature.split(",").map((p) => p.split("=").map((s) => s.trim())),
  ) as Record<string, string>;
  return parts.v1 === expected;
}

/** Map every Sent.dm status/event name onto our messaging_events vocabulary. */
const STATUS_MAP: Record<string, MessagingEventType> = {
  queued: "queued",
  accepted: "queued",
  pending: "queued",
  submitted: "sent",
  sent: "sent",
  dispatched: "sent",
  delivered: "delivered",
  delivery_success: "delivered",
  read: "read",
  seen: "read",
  failed: "failed",
  delivery_failed: "failed",
  undelivered: "failed",
  undeliverable: "failed",
  error: "failed",
  expired: "failed",
  rejected: "rejected",
  blocked: "blocked",
  opted_out: "opted_out",
  unsubscribed: "unsubscribed",
};

const FAILURE_STATUSES = new Set<MessagingEventType>([
  "failed",
  "rejected",
  "blocked",
  "opted_out",
  "unsubscribed",
]);

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const raw = await req.text();
    if (!(await verifySignature(req, raw))) {
      return json({ received: false, error: "Invalid signature" }, 401);
    }

    // deno-lint-ignore no-explicit-any
    const event: any = raw ? JSON.parse(raw) : {};
    const payload = event.data ?? event.message ?? event;

    const rawStatus = String(
      payload.status ?? payload.state ?? event.type ?? event.event ?? "",
    )
      .toLowerCase()
      .replace(/^message[._]/, "")
      .replace(/[\s-]+/g, "_");

    const eventType = STATUS_MAP[rawStatus];
    if (!eventType) {
      console.log(`[sent-status] ignoring unmapped status: ${rawStatus || "(empty)"}`);
      return json({ received: true, handled: false, status: rawStatus || null });
    }

    const to = String(payload.to ?? payload.recipient ?? payload.msisdn ?? "").replace(
      /^whatsapp:/i,
      "",
    );
    const from = String(payload.from ?? payload.sender ?? payload.sender_id ?? "");
    const channel = (String(payload.channel ?? "").toLowerCase() === "whatsapp"
      ? "whatsapp"
      : "sms") as "sms" | "whatsapp";
    const messageId: string | undefined =
      payload.message_id ?? payload.id ?? event.message_id ?? event.id;
    const eventId: string | undefined = event.id ?? payload.event_id;

    const errorCode =
      payload.error_code ?? payload.errorCode ?? payload.error?.code ?? null;
    const errorMessage =
      payload.error_message ??
      payload.errorMessage ??
      payload.error?.message ??
      payload.reason ??
      (FAILURE_STATUSES.has(eventType) ? `Provider reported "${rawStatus}"` : null);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Replay protection: the same provider event id is only recorded once.
    if (eventId) {
      const { data: seen } = await supabase
        .from("messaging_events")
        .select("id")
        .eq("provider", "sent")
        .eq("provider_event_id", eventId)
        .limit(1)
        .maybeSingle();
      if (seen) {
        return json({ received: true, handled: false, reason: "duplicate" });
      }
    }

    // Carry over the user/conversation context from the original send row so
    // the delivery log can filter these status updates by user.
    let userId: string | undefined;
    let conversationId: string | undefined;
    let templateName: string | undefined;
    if (messageId) {
      const { data: origin } = await supabase
        .from("messaging_events")
        .select("user_id, conversation_id, template_name")
        .eq("provider_message_id", messageId)
        .eq("direction", "outbound")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      userId = (origin?.user_id as string | null) ?? undefined;
      conversationId = (origin?.conversation_id as string | null) ?? undefined;
      templateName = (origin?.template_name as string | null) ?? undefined;
    }

    await logMessagingEvent(supabase, {
      channel,
      provider: "sent",
      event_type: eventType,
      direction: "outbound",
      recipient: to,
      sender: from,
      region: regionFromPhone(to, from),
      provider_message_id: messageId,
      provider_event_id: eventId,
      user_id: userId,
      conversation_id: conversationId,
      template_name: templateName,
      error_code: errorCode ? String(errorCode) : undefined,
      error_message: errorMessage ? String(errorMessage) : undefined,
      raw_payload: event,
      metadata: { raw_status: rawStatus, source: "sent-status-webhook" },
    });

    return json({ received: true, handled: true, status: eventType });
  } catch (error) {
    console.error("[sent-status] error:", error);
    return json(
      { received: false, error: error instanceof Error ? error.message : "unknown" },
      500,
    );
  }
});
