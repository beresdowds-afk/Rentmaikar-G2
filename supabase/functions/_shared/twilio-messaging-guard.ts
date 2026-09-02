/**
 * Messaging provider policy.
 *
 * Sent.dm is the global CPaaS for SMS and WhatsApp and is always attempted
 * first. Twilio is the automatic USA fallback and Termii the Nigerian
 * fallback — Twilio is never used as a *primary* messaging provider, only
 * after a Sent.dm dispatch fails or is unavailable.
 *
 * Switches:
 *   TWILIO_MESSAGING_ENABLED=true  – allow Twilio as a primary SMS/WhatsApp sender
 *   TWILIO_SMS_FALLBACK=false      – disable the USA Twilio fallback entirely
 */
function flag(name: string, fallback: boolean): boolean {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true";
}

/**
 * Throws unless Twilio may be used as a primary messaging sender. Keep this on
 * paths where Twilio would be chosen ahead of Sent.dm.
 */
export function assertTwilioMessagingEnabled(): void {
  if (!twilioMessagingEnabled()) {
    throw new Error(
      "Twilio messaging is disabled as a primary sender. Route SMS/WhatsApp via Sent.dm instead.",
    );
  }
}

/** Twilio allowed as a *primary* SMS/WhatsApp sender. Off by default. */
export function twilioMessagingEnabled(): boolean {
  return flag("TWILIO_MESSAGING_ENABLED", false);
}

/**
 * Twilio allowed as the USA fallback after Sent.dm fails. On by default;
 * only applies to +1 destinations (Nigeria falls back to Termii).
 */
export function twilioFallbackAllowed(destination?: string | null): boolean {
  if (!flag("TWILIO_SMS_FALLBACK", true)) return false;
  if (twilioMessagingEnabled()) return true;
  const bare = (destination ?? "").replace(/^whatsapp:/i, "").replace(/[^0-9+]/g, "");
  if (!bare) return false;
  const e164 = bare.startsWith("+") ? bare : `+${bare}`;
  // USA/Canada numbering plan only — never Nigerian or other regions.
  return e164.startsWith("+1");
}
