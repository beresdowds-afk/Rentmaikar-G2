// ════════════════════════════════════════════════════════════
// Sent.dm inbound receiver — RentMaikar routing layer
//
//   Customer → +1 608 548 9220 (public messaging/WhatsApp alias)
//            → Sent.dm → this function (RentMaikar backend)
//            → outbound leg → Master Communications Endpoint
//
// Nothing is carrier-forwarded: the backend owns the outbound leg, so the
// customer's original US number stays in `messaging_events` and replies can be
// sent from the correct public sender.
// ════════════════════════════════════════════════════════════
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { forwardInboundMessage, regionFromPhone } from "../_shared/forwarding.ts";
import { parseTrace } from "../_shared/comms-correlation.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";

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

/** Token, hex-HMAC, or `t=...,v1=...` signature modes. */
async function verifySignature(req: Request, raw: string): Promise<boolean> {
  const secret = Deno.env.get("SENT_WEBHOOK_SECRET") ?? "";
  if (!secret) {
    console.warn("[sent-inbound] SENT_WEBHOOK_SECRET not set — accepting unverified");
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
    const eventType: string = (event.type || event.event || "message.inbound").toLowerCase();

    const from = String(payload.from ?? payload.sender ?? "").replace(/^whatsapp:/i, "");
    const to = String(payload.to ?? payload.recipient ?? payload.sender_id ?? "");
    const body = String(payload.text ?? payload.body ?? payload.message ?? "");
    const channel = (payload.channel === "whatsapp" ? "whatsapp" : "sms") as "sms" | "whatsapp";
    const mediaUrl: string | null = payload.media?.[0]?.url ?? payload.media_url ?? null;
    const messageId: string | undefined = payload.id ?? payload.message_id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Delivery receipts / status callbacks — log only.
    if (!eventType.includes("inbound") && !eventType.includes("received") && !body && !mediaUrl) {
      await logMessagingEvent(supabase, {
        channel,
        provider: "sent",
        event_type: String(payload.status ?? eventType),
        direction: "outbound",
        recipient: to,
        sender: from,
        region: regionFromPhone(to, from),
        provider_message_id: messageId,
        metadata: { raw_event_type: eventType },
      }).catch((e) => console.error("[sent-inbound] status log failed:", e));
      return json({ received: true, handled: "status" });
    }

    const region = regionFromPhone(from, to);
    // A trace marker on an inbound message means this leg originated from one
    // of our own relays — carry the correlation ID and hop count forward.
    const inheritedTrace = parseTrace(body);

    await logMessagingEvent(supabase, {
      channel,
      provider: "sent",
      event_type: "received",
      direction: "inbound",
      recipient: to,
      sender: from,
      region,
      provider_message_id: messageId,
      metadata: {
        customer_phone: from,
        public_alias: to,
        has_media: !!mediaUrl,
        correlation_id: inheritedTrace?.correlationId ?? null,
        inbound_hop: inheritedTrace?.hop ?? 0,
      },
    }).catch((e) => console.error("[sent-inbound] inbound log failed:", e));

    const forwarded = await forwardInboundMessage(supabase, {
      channel,
      region,
      from,
      body: body || "(no text)",
      mediaUrl,
      correlationId: inheritedTrace?.correlationId ?? null,
      hop: inheritedTrace?.hop ?? null,
    });

    if (forwarded.forwarded) {
      await logMessagingEvent(supabase, {
        channel,
        provider: forwarded.provider ?? "sent",
        event_type: "forwarded",
        direction: "outbound",
        sender: to,
        recipient: forwarded.destination,
        region,
        provider_message_id: messageId,
        metadata: {
          customer_phone: from,
          public_alias: to,
          endpoint: forwarded.destination,
          correlation_id: forwarded.correlationId,
          hop: forwarded.hop,
          max_hops: forwarded.maxHops,
        },
      }).catch((e) => console.error("[sent-inbound] forward log failed:", e));
    } else {
      console.log(`[sent-inbound] not forwarded: ${forwarded.reason}`);
    }

    return json({
      received: true,
      forwarded: forwarded.forwarded,
      reason: forwarded.reason,
      correlation_id: forwarded.correlationId,
      hop: forwarded.hop,
      max_hops: forwarded.maxHops,
    });
  } catch (error) {
    console.error("[sent-inbound] error:", error);
    return json(
      { received: false, error: error instanceof Error ? error.message : "unknown" },
      500,
    );
  }
});
