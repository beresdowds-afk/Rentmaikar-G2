/**
 * Central STOP/START opt-out guard.
 *
 * Every outbound SMS/WhatsApp sender must call `isOptedOut` (or the
 * `filterOptedOut` helper) before contacting a number. Opt-out is stored per
 * phone number so it also covers numbers with no account attached.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type OptOutChannel = "sms" | "whatsapp" | "all";

/**
 * Keywords that stop all messaging.
 * The A2P 10DLC campaign submission declares: OPTOUT, CANCEL, END, QUIT,
 * UNSUBSCRIBE, REVOKE, STOP, STOPALL. Extra variants below are a superset so
 * users are never kept subscribed because of phrasing.
 */
export const STOP_KEYWORDS = [
  "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT-OUT",
  "REVOKE",
  "REMOVE", "NO MORE", "STOP MESSAGES", "DUROO", // Yoruba "stop"
];

/** Keywords that resume messaging. */
export const START_KEYWORDS = [
  "START", "UNSTOP", "YES", "SUBSCRIBE", "RESUME", "OPTIN", "OPT-IN", "BEGIN",
];

/** Help keywords per the A2P 10DLC campaign submission: HELP, INFO. */
export const HELP_KEYWORDS = ["HELP", "INFO"];

const normalizeKeyword = (message: string) =>
  (message || "").trim().toUpperCase().replace(/[.!,]+$/g, "");

export const isStopKeyword = (message: string): boolean =>
  STOP_KEYWORDS.includes(normalizeKeyword(message));

export const isStartKeyword = (message: string): boolean =>
  START_KEYWORDS.includes(normalizeKeyword(message));

export const isHelpKeyword = (message: string): boolean =>
  HELP_KEYWORDS.includes(normalizeKeyword(message));

function client(supabase?: SupabaseClient): SupabaseClient {
  return (
    supabase ??
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )
  );
}

/**
 * True when the number must not be contacted on this channel.
 * Fails closed on a lookup error only for marketing-style sends is NOT desired
 * here: we fail OPEN for delivery-critical flows but log loudly, so callers can
 * decide. Default behaviour is fail-closed (do not send) to guarantee STOP.
 */
export async function isOptedOut(
  phone: string,
  channel: OptOutChannel = "sms",
  supabase?: SupabaseClient,
): Promise<boolean> {
  if (!phone) return false;
  try {
    const { data, error } = await client(supabase).rpc("is_messaging_opted_out", {
      _phone: phone,
      _channel: channel,
    });
    if (error) {
      console.error("[opt-out] lookup failed, suppressing send:", error.message);
      return true; // fail closed — never contact after STOP
    }
    return data === true;
  } catch (e) {
    console.error("[opt-out] lookup threw, suppressing send:", (e as Error)?.message ?? e);
    return true;
  }
}

/** Record STOP (optedOut=true) or START (optedOut=false). */
export async function setOptOut(
  phone: string,
  optedOut: boolean,
  opts: {
    channel?: OptOutChannel;
    userId?: string | null;
    source?: string;
    keyword?: string;
    supabase?: SupabaseClient;
  } = {},
): Promise<void> {
  const { channel = "all", userId = null, source, keyword, supabase } = opts;
  const { error } = await client(supabase).rpc("set_messaging_opt_out", {
    _phone: phone,
    _opted_out: optedOut,
    _channel: channel,
    _user_id: userId,
    _source: source ?? null,
    _keyword: keyword ?? null,
  });
  if (error) {
    console.error("[opt-out] failed to record preference:", error.message);
    throw new Error(error.message);
  }
  console.log(`[opt-out] ${optedOut ? "STOP" : "START"} recorded for ${phone} (${channel})`);
}

/** Filter a recipient list down to numbers that may still be contacted. */
export async function filterOptedOut<T>(
  recipients: T[],
  getPhone: (r: T) => string | null | undefined,
  channel: OptOutChannel = "sms",
  supabase?: SupabaseClient,
): Promise<T[]> {
  const results = await Promise.all(
    recipients.map(async (r) => {
      const phone = getPhone(r);
      if (!phone) return null;
      return (await isOptedOut(phone, channel, supabase)) ? null : r;
    }),
  );
  return results.filter((r): r is T => r !== null);
}
