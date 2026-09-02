// ════════════════════════════════════════════════════════════
// RentMaikar communications endpoint registry
//
// Public numbers are customer-facing aliases only. They terminate at the
// providers (Twilio for voice, Sent.dm for SMS/WhatsApp), which hand the
// conversation to the RentMaikar backend. The backend is the routing layer:
// it stores the customer's original number and dispatches an OUTBOUND leg to
// the Master Communications Endpoint. No carrier-level forwarding is used for
// SMS or WhatsApp — that is not equivalent to voice forwarding.
//
//   Customer → public US number → Twilio/Sent → RentMaikar backend
//            → outbound leg → Master Communications Endpoint
// ════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
type Supa = any;

export type CommsChannel = "call" | "sms" | "whatsapp";

/** Customer-facing / operational number registry. */
export const RENTMAIKAR_NUMBERS = {
  /** USA public voice + SMS contact (Twilio, 10DLC). Published. */
  usaVoicePublic: "+16083843932",
  /** USA outbound-only Twilio number. NEVER publish. */
  usaVoiceDialOut: "+13806003018",
  /** USA public messaging / WhatsApp number (Sent.dm). */
  usaMessagingPublic: "+16085489220",
  /** Global master endpoint — the human/ops termination point. */
  masterEndpoint: "+2349163072576",
} as const;

export const MASTER_ENDPOINT_KEY = "master_communications_endpoint";

export interface MasterEndpoint {
  voice: string;
  sms: string;
  whatsapp: string;
}

const DEFAULT_MASTER: MasterEndpoint = {
  voice: RENTMAIKAR_NUMBERS.masterEndpoint,
  sms: RENTMAIKAR_NUMBERS.masterEndpoint,
  whatsapp: RENTMAIKAR_NUMBERS.masterEndpoint,
};

function toE164(value?: string | null): string | null {
  const raw = (value || "").replace(/^whatsapp:/i, "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

/**
 * Master Communications Endpoint, overridable at runtime via
 * `platform_kv_settings.master_communications_endpoint`
 * (`{ voice, sms, whatsapp }`, or a bare string applied to all channels).
 */
export async function getMasterEndpoint(supabase: Supa): Promise<MasterEndpoint> {
  try {
    const { data } = await supabase
      .from("platform_kv_settings")
      .select("value")
      .eq("key", MASTER_ENDPOINT_KEY)
      .maybeSingle();

    const value = data?.value;
    if (!value) return { ...DEFAULT_MASTER };
    if (typeof value === "string") {
      const one = toE164(value);
      return one ? { voice: one, sms: one, whatsapp: one } : { ...DEFAULT_MASTER };
    }
    const v = value as Partial<MasterEndpoint>;
    return {
      voice: toE164(v.voice) ?? DEFAULT_MASTER.voice,
      sms: toE164(v.sms) ?? DEFAULT_MASTER.sms,
      whatsapp: toE164(v.whatsapp) ?? DEFAULT_MASTER.whatsapp,
    };
  } catch (e) {
    console.error("[comms-endpoints] failed to read master endpoint:", e);
    return { ...DEFAULT_MASTER };
  }
}

export async function getMasterEndpointFor(
  supabase: Supa,
  channel: CommsChannel,
): Promise<string> {
  const master = await getMasterEndpoint(supabase);
  if (channel === "call") return master.voice;
  if (channel === "whatsapp") return master.whatsapp;
  return master.sms;
}

/**
 * The public sender RentMaikar presents for a channel. Voice keeps the
 * published Twilio number as caller ID; messaging uses the Sent.dm number so
 * the Nigerian master endpoint is never exposed to customers.
 */
export function publicSenderFor(channel: CommsChannel, dialedNumber?: string | null): string {
  if (channel === "call") {
    const dialed = toE164(dialedNumber);
    // Preserve the number the customer actually dialled when it is one of ours.
    if (dialed === RENTMAIKAR_NUMBERS.usaVoiceDialOut) return RENTMAIKAR_NUMBERS.usaVoicePublic;
    return dialed || Deno.env.get("TWILIO_VOICE_FROM") || RENTMAIKAR_NUMBERS.usaVoicePublic;
  }
  if (channel === "whatsapp") {
    return Deno.env.get("SENT_WHATSAPP_NUMBER") || RENTMAIKAR_NUMBERS.usaMessagingPublic;
  }
  return Deno.env.get("SENT_SMS_NUMBER") || RENTMAIKAR_NUMBERS.usaMessagingPublic;
}
