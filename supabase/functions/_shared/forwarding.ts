// ════════════════════════════════════════════════════════════
// Unified inbound forwarding engine — the RentMaikar routing layer
//
// Public numbers are customer-facing aliases. Providers (Twilio for voice,
// Sent.dm for SMS/WhatsApp) deliver the inbound leg to this backend, which
// then dispatches its OWN outbound leg to the regional destination in
// `contact_settings` (falling back to `platform_regions.forwarding_*` and
// finally the global Master Communications Endpoint). Messaging is never
// carrier-forwarded.
//
// Master on/off switches live in `platform_kv_settings` under the
// `forwarding_config` key so admins can toggle each channel at runtime.
// ════════════════════════════════════════════════════════════

import { sendViaSent } from "./sent-client.ts";
import { evaluateHop, formatTrace } from "./comms-correlation.ts";
import { twilioFallbackAllowed } from "./twilio-messaging-guard.ts";
import {
  type CommsChannel,
  getMasterEndpointFor,
  publicSenderFor,
  RENTMAIKAR_NUMBERS,
} from "./comms-endpoints.ts";
import { resendSendEmail } from "./resend-gateway.ts";

export { evaluateHop, formatTrace, getLoopPolicy, LOOP_POLICY_KEY, parseTrace, stripTrace } from "./comms-correlation.ts";



// deno-lint-ignore no-explicit-any
type Supa = any;

export type ForwardChannel = "call" | "sms" | "whatsapp" | "email";

export interface ForwardingConfig {
  call: boolean;
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
}

export const FORWARDING_CONFIG_KEY = "forwarding_config";

const DEFAULT_CONFIG: ForwardingConfig = {
  call: false,
  sms: false,
  whatsapp: false,
  email: false,
};

/** Normalise the many region spellings used across the platform. */
export function normaliseRegion(region?: string | null): "USA" | "Nigeria" {
  const r = (region || "").trim().toLowerCase();
  if (r.startsWith("ng") || r.includes("nigeria")) return "Nigeria";
  return "USA";
}

/** Region inferred from an E.164 phone number. */
export function regionFromPhone(...numbers: (string | null | undefined)[]): "USA" | "Nigeria" {
  for (const n of numbers) {
    const clean = (n || "").replace("whatsapp:", "").replace(/\s/g, "");
    if (clean.startsWith("+234") || clean.startsWith("234")) return "Nigeria";
  }
  return "USA";
}

export async function getForwardingConfig(supabase: Supa): Promise<ForwardingConfig> {
  try {
    const { data } = await supabase
      .from("platform_kv_settings")
      .select("value")
      .eq("key", FORWARDING_CONFIG_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<ForwardingConfig>;
    return { ...DEFAULT_CONFIG, ...value };
  } catch (e) {
    console.error("[forwarding] failed to read config:", e);
    return DEFAULT_CONFIG;
  }
}

export async function isForwardingEnabled(supabase: Supa, channel: ForwardChannel): Promise<boolean> {
  const cfg = await getForwardingConfig(supabase);
  return !!cfg[channel];
}

/**
 * Resolve the destination for a channel in a region.
 * `call` forwards to the SMS/voice contact number for that region.
 */
export async function getForwardingDestination(
  supabase: Supa,
  channel: ForwardChannel,
  region?: string | null,
): Promise<string | null> {
  const target = normaliseRegion(region);
  const contactType = channel === "call" ? "sms" : channel;

  const { data: rows } = await supabase
    .from("contact_settings")
    .select("region, contact_value, is_active")
    .eq("contact_type", contactType)
    .eq("is_active", true);

  const list = (rows ?? []) as { region: string; contact_value: string }[];
  const match =
    list.find((r) => normaliseRegion(r.region) === target) ?? list[0] ?? null;

  let value = match?.contact_value?.trim() || null;

  // Fallback to the regional operations forwarding numbers.
  if (!value && channel !== "email") {
    const column = channel === "whatsapp" ? "forwarding_whatsapp" : "forwarding_sms";
    const { data: regionRows } = await supabase
      .from("platform_regions")
      .select(`${column}`)
      .eq("is_active", true)
      .limit(1);
    value = (regionRows?.[0]?.[column] as string | undefined)?.trim() || null;
  }

  if (channel === "email") return value ?? null;

  // Final fallback: the global Master Communications Endpoint.
  if (!value) {
    return await getMasterEndpointFor(supabase, channel as CommsChannel);
  }
  // Phone numbers are stored with display spacing — normalise to E.164.
  const digits = value.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+") ? digits : `+${digits}`;

  // Our own public aliases are not valid termination points — a message sent
  // there would loop back into this webhook. Route to the master endpoint.
  const ours = Object.values(RENTMAIKAR_NUMBERS) as string[];
  if (ours.includes(e164) && e164 !== RENTMAIKAR_NUMBERS.masterEndpoint) {
    return await getMasterEndpointFor(supabase, channel as CommsChannel);
  }
  return e164;
}



/** Build the TwiML used by the inbound-call forwarding webhook. */
export function buildCallForwardTwiml(destination: string | null, callerId?: string | null): string {
  if (!destination) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling Rent My Car. All of our agents are currently unavailable. Please leave a message after the tone.</Say>
  <Record maxLength="120" playBeep="true" />
  <Say voice="alice">Thank you. Goodbye.</Say>
</Response>`;
  }
  const callerAttr = callerId ? ` callerId="${callerId}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you to a Rent My Car support agent.</Say>
  <Dial${callerAttr} timeout="25" answerOnBridge="true">
    <Number>${destination}</Number>
  </Dial>
  <Say voice="alice">Sorry, no agent is available right now. Please leave a message after the tone.</Say>
  <Record maxLength="120" playBeep="true" />
  <Say voice="alice">Thank you. Goodbye.</Say>
</Response>`;
}

interface ForwardMessageArgs {
  channel: "sms" | "whatsapp";
  region?: string | null;
  from: string;
  body: string;
  senderName?: string | null;
  mediaUrl?: string | null;
  /** Correlation ID inherited from provider metadata, when available. */
  correlationId?: string | null;
  /** Hop count of the leg that produced this message, when known. */
  hop?: number | null;
}

export interface ForwardResult {
  forwarded: boolean;
  reason?: string;
  destination?: string;
  provider?: string;
  correlationId?: string;
  hop?: number;
  maxHops?: number;
}

/**
 * Forward an inbound SMS / WhatsApp message to the Master Communications
 * Endpoint (or the region's configured destination).
 *
 * This is an application-level outbound leg dispatched by the backend — NOT
 * carrier forwarding. The customer's original number is preserved in the
 * message envelope and in `messaging_events` so replies can be sent from the
 * correct public US sender. Sent.dm is the messaging provider; Twilio is
 * voice-only unless messaging approval is explicitly enabled.
 *
 * Every dispatched leg carries an end-to-end correlation ID and hop counter;
 * relays are refused once `platform_kv_settings.comms_loop_policy.max_hops`
 * is reached, so a message circling between our own aliases dies quickly.
 * Never throws — forwarding must not break inbound ingestion.
 */
export async function forwardInboundMessage(
  supabase: Supa,
  args: ForwardMessageArgs,
): Promise<ForwardResult> {
  try {
    if (!(await isForwardingEnabled(supabase, args.channel))) {
      return { forwarded: false, reason: "disabled" };
    }
    const destination = await getForwardingDestination(supabase, args.channel, args.region);
    if (!destination) return { forwarded: false, reason: "no_destination" };

    const cleanFrom = (args.from || "").replace("whatsapp:", "");
    if (destination.replace(/\s/g, "") === cleanFrom.replace(/\s/g, "")) {
      return { forwarded: false, reason: "loop_guard" };
    }

    // ─── Correlation + max-hop policy ───
    const decision = await evaluateHop(supabase, {
      body: args.body,
      correlationId: args.correlationId,
      hop: args.hop,
    });
    if (!decision.allowed) {
      console.warn(
        `[forwarding] dropping ${args.channel} relay cid=${decision.correlationId} hop=${decision.hop} max=${decision.maxHops}`,
      );
      return {
        forwarded: false,
        reason: decision.reason ?? "max_hops_exceeded",
        destination,
        correlationId: decision.correlationId,
        hop: decision.hop,
        maxHops: decision.maxHops,
      };
    }

    const isWa = args.channel === "whatsapp";
    const label = args.senderName ? `${args.senderName} (${cleanFrom})` : cleanFrom;
    const trace = formatTrace(decision.correlationId, decision.hop, decision.maxHops);
    const text = `[Forwarded ${isWa ? "WhatsApp" : "SMS"} from ${label}]\n${decision.cleanBody || "(no text)"}\n${trace}`
      .slice(0, 1500);

    // ─── Outbound leg via Sent.dm (global messaging default) ───
    const sent = await sendViaSent({
      to: destination,
      channel: isWa ? "whatsapp" : "sms",
      text,
      senderId: publicSenderFor(isWa ? "whatsapp" : "sms"),
      ...(args.mediaUrl ? { mediaUrls: [args.mediaUrl] } : {}),
      metadata: {
        purpose: "inbound_forward",
        customer_phone: cleanFrom,
        endpoint: destination,
        region: normaliseRegion(args.region),
        correlation_id: decision.correlationId,
        hop: decision.hop,
        max_hops: decision.maxHops,
      },

    });

    if (sent.ok) {
      console.log(`[forwarding] ${args.channel} forwarded to master endpoint via Sent.dm`);
      return {
        forwarded: true,
        destination,
        provider: "sent",
        correlationId: decision.correlationId,
        hop: decision.hop,
        maxHops: decision.maxHops,
      };
    }

    console.error(`[forwarding] Sent.dm forward failed: ${sent.error ?? "unknown"}`);

    // ─── Twilio fallback (blocked unless messaging approval is granted) ───
    if (!twilioFallbackAllowed(destination)) {
      return {
        forwarded: false,
        reason: `sent_failed:${sent.error ?? "unknown"}`,
        destination,
        correlationId: decision.correlationId,
        hop: decision.hop,
        maxHops: decision.maxHops,
      };
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    const whatsappNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER") || twilioNumber;
    if (!accountSid || !authToken) return { forwarded: false, reason: "twilio_not_configured" };

    const fromNumber = isWa ? `whatsapp:${whatsappNumber}` : twilioNumber;
    if (!fromNumber) return { forwarded: false, reason: "no_sender_number" };

    const params = new URLSearchParams({
      To: isWa ? `whatsapp:${destination}` : destination,
      From: fromNumber,
      Body: text,
    });
    if (args.mediaUrl) params.append("MediaUrl", args.mediaUrl);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[forwarding] ${args.channel} forward failed [${res.status}]: ${detail}`);
      return { forwarded: false, reason: `provider_error_${res.status}`, destination };
    }
    return {
      forwarded: true,
      destination,
      provider: "twilio",
      correlationId: decision.correlationId,
      hop: decision.hop,
      maxHops: decision.maxHops,
    };
  } catch (e) {
    console.error("[forwarding] unexpected error forwarding message:", e);
    return { forwarded: false, reason: "exception" };
  }

}

interface ForwardEmailArgs {
  region?: string | null;
  fromAddress: string;
  fromName?: string | null;
  subject: string;
  body: string;
  htmlBody?: string | null;
}

/** Forward an inbound email to the configured regional support mailbox. */
export async function forwardInboundEmail(
  supabase: Supa,
  args: ForwardEmailArgs,
): Promise<{ forwarded: boolean; reason?: string }> {
  try {
    if (!(await isForwardingEnabled(supabase, "email"))) {
      return { forwarded: false, reason: "disabled" };
    }
    const destination = await getForwardingDestination(supabase, "email", args.region);
    if (!destination) return { forwarded: false, reason: "no_destination" };
    if (destination.toLowerCase() === (args.fromAddress || "").toLowerCase()) {
      return { forwarded: false, reason: "loop_guard" };
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return { forwarded: false, reason: "resend_not_configured" };

    const label = args.fromName ? `${args.fromName} <${args.fromAddress}>` : args.fromAddress;
    const html =
      `<p style="color:#64748b;font-size:12px">Forwarded from <strong>${label}</strong></p><hr/>` +
      (args.htmlBody || `<pre style="white-space:pre-wrap;font-family:inherit">${args.body}</pre>`);

    const res = await resendSendEmail({
        from: "Rentmaikar Inbox <noreply@rentmaikar.com>",
        to: [destination],
        reply_to: args.fromAddress,
        subject: `[Fwd] ${args.subject || "(no subject)"}`,
        html,
      }, apiKey);

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[forwarding] email forward failed [${res.status}]: ${detail}`);
      return { forwarded: false, reason: `provider_error_${res.status}` };
    }
    console.log("[forwarding] inbound email forwarded to configured mailbox");
    return { forwarded: true };
  } catch (e) {
    console.error("[forwarding] unexpected error forwarding email:", e);
    return { forwarded: false, reason: "exception" };
  }
}
