/**
 * Writes carrier-keyword consent changes (STOP / START / HELP) into
 * public.sms_consent_records so the A2P 10DLC audit trail covers both
 * web-form opt-ins and inbound SMS keyword events.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SMS_DISCLOSURE_VERSION = "2026-08-23.v1";

// Quoted confirmations must match the A2P 10DLC campaign submission verbatim.
export const KEYWORD_DISCLOSURES = {
  stop:
    "STOP keyword received (accepted opt-out keywords: STOP, STOPALL, OPTOUT, CANCEL, END, QUIT, UNSUBSCRIBE, REVOKE). All Rentmaikar service and promotional text messages to this number are stopped immediately. Confirmation sent: \"You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.\"",
  start:
    "START keyword received by SMS. The user re-subscribed to Rentmaikar text messages. Confirmation sent: \"Rentmaikar: You're re-subscribed to SMS notifications. Reply HELP for commands or STOP to opt out again.\"",
  help:
    "HELP/INFO keyword received by SMS. Help and opt-out information was returned: \"Reply STOP to unsubscribe. Msg&Data Rates May Apply.\"",
} as const;

export type SmsKeywordEvent = keyof typeof KEYWORD_DISCLOSURES;

/**
 * Records the consent change for a keyword event. Never throws — messaging
 * flows must not break when the audit write fails.
 *
 * STOP writes granted=false for both service and marketing consent.
 * START writes granted=true for service consent only (marketing must be
 * re-opted-in explicitly on the web form).
 * HELP writes an informational service-consent row preserving current state.
 */
export async function recordKeywordConsent(
  supabase: SupabaseClient,
  params: {
    event: SmsKeywordEvent;
    phone: string;
    userId?: string | null;
    /** Raw keyword the user typed, e.g. "UNSUBSCRIBE". */
    keyword?: string;
    /** Inbound channel: "sms" or "whatsapp". */
    channel?: string;
  },
): Promise<void> {
  const { event, phone, userId = null, keyword, channel = "sms" } = params;
  const source = `twilio_inbound_${channel}_keyword${keyword ? `:${keyword.toUpperCase()}` : ""}`;
  const disclosure = KEYWORD_DISCLOSURES[event];

  const rows =
    event === "stop"
      ? (["service", "marketing"] as const).map((consent_type) => ({
          consent_type,
          granted: false,
        }))
      : event === "start"
        ? [{ consent_type: "service" as const, granted: true }]
        : [{ consent_type: "service" as const, granted: true }];

  try {
    const { error } = await supabase.from("sms_consent_records").insert(
      rows.map((r) => ({
        user_id: userId,
        phone_number: phone,
        consent_type: r.consent_type,
        granted: r.granted,
        disclosure_version: SMS_DISCLOSURE_VERSION,
        disclosure_text: disclosure,
        source,
        user_agent: null,
      })),
    );
    if (error) {
      console.error("[sms-consent-audit] insert failed:", error.message);
      return;
    }
    console.log(`[sms-consent-audit] ${event.toUpperCase()} recorded for ${phone} (${source})`);
  } catch (e) {
    console.error("[sms-consent-audit] unexpected error:", (e as Error)?.message ?? e);
  }
}
