/**
 * Authoritative outbound caller-ID resolution for telephony edge functions.
 *
 * Order: configured line (`voip_resolve_outbound_number`) -> TWILIO_PHONE_NUMBER secret -> null.
 * Callers MUST treat `null` as a controlled failure (omit callerId / skip the send).
 * Never fall back to a hard-coded number (see DOCUMENTATION_AUTHORITY_AND_AI_STUDIO_GUARDRAILS.md).
 */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export async function resolveOutboundCallerId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  region: string | null = null,
  userId: string | null = null,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("voip_resolve_outbound_number", {
      _user_id: userId || NIL_UUID,
      _region: region,
    });
    if (!error && typeof data === "string" && data.trim()) return data.trim();
  } catch (err) {
    console.warn("[outbound-caller-id] resolver failed:", err);
  }
  const configured = Deno.env.get("TWILIO_PHONE_NUMBER")?.trim();
  return configured || null;
}

/** Renders a TwiML `callerId` attribute, or an empty string when no line is configured. */
export function callerIdAttr(callerId: string | null): string {
  return callerId ? ` callerId="${callerId}"` : "";
}
