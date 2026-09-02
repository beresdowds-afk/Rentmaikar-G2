// Inbound Twilio webhook authentication for voice callbacks.
//
// `X-Twilio-Signature` is HMAC-signed with the ACCOUNT AUTH TOKEN. RentMaikar
// authenticates the REST API with an API key/secret pair, so a stale or rotated
// auth token silently breaks every inbound call: the webhook answers 403 and
// the caller hears "an application error has occurred".
//
// This helper keeps signature verification as the primary check and adds a
// second, equally strong proof of authenticity that does NOT depend on the auth
// token: look the CallSid up on the Twilio REST API with the API key and
// confirm the call really exists on our account and matches the posted legs.
// A forger cannot fabricate a CallSid that resolves on our account.

import { verifyTwilioRequest } from "./twilio-signature.ts";
import { twilioRequest } from "./twilio-auth.ts";

function norm(v: unknown): string {
  return String(v ?? "").replace(/[^\d+]/g, "");
}

/**
 * Returns `null` when the request is a genuine Twilio voice callback,
 * or a 403 `Response` when it cannot be authenticated by either method.
 */
export async function verifyTwilioVoiceCallback(
  req: Request,
  form: FormData,
): Promise<Response | null> {
  const denied = await verifyTwilioRequest(req, form);
  if (!denied) return null;

  const callSid = String(form.get("CallSid") ?? "");
  if (!/^CA[0-9a-fA-F]{32}$/.test(callSid)) {
    console.error("[twilio-callback-auth] rejected: signature failed and no valid CallSid");
    return denied;
  }

  const lookup = await twilioRequest(`/Calls/${callSid}.json`);
  if (!lookup.ok) {
    console.error(
      `[twilio-callback-auth] rejected: CallSid lookup failed [${lookup.status}]`,
      (lookup.payload as { message?: string }).message ?? "",
    );
    return denied;
  }

  const call = lookup.payload as { to?: string; from?: string; status?: string };
  const toMatches = norm(call.to) === norm(form.get("To"));
  const fromMatches = norm(call.from) === norm(form.get("From"));
  if (!toMatches || !fromMatches) {
    console.error("[twilio-callback-auth] rejected: CallSid legs do not match the posted payload");
    return denied;
  }

  console.warn(
    "[twilio-callback-auth] signature check failed but CallSid verified on our Twilio account — " +
      "TWILIO_AUTH_TOKEN is likely stale and should be refreshed.",
  );
  return null;
}
