// Twilio REST auth helper.
//
// Twilio returns 401 / code 20003 ("Authenticate") when the Account SID and
// Auth Token pair is wrong or mismatched. Many accounts instead issue API
// Keys (SK...) with a secret — those authenticate as
// Basic base64(apiKeySid:apiKeySecret) against the SAME account SID in the URL.
//
// `twilioRequest` tries the configured API key credentials (SK...) first —
// RentMaikar's approved credential pair — and falls back to the account
// auth token only if the API key is rejected with a 401.

export interface TwilioResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown>;
  /** Which credential pair succeeded (or was last attempted). */
  credential: string;
}

function candidates(): Array<{ user: string; pass: string; label: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const list: Array<{ user: string; pass: string; label: string }> = [];

  const keySid = Deno.env.get("TWILIO_API_KEY_SID") ?? Deno.env.get("TWILIO_API_KEY");
  const keySecret = Deno.env.get("TWILIO_API_KEY_SECRET") ?? Deno.env.get("TWILIO_API_SECRET");
  if (keySid && keySecret && keySid.startsWith("SK")) {
    list.push({ user: keySid, pass: keySecret, label: "api_key" });
  }

  // Auth token intentionally set aside per owner decision; API key only.

  return list;
}

export function twilioAccountSid(): string | null {
  return Deno.env.get("TWILIO_ACCOUNT_SID") || null;
}

export function twilioCredentialsConfigured(): boolean {
  return !!twilioAccountSid() && candidates().length > 0;
}

/**
 * POST/GET the Twilio REST API for this account, retrying with API key
 * credentials when the account auth token is rejected.
 *
 * @param path Path after `/2010-04-01/Accounts/<sid>` e.g. "/Calls.json"
 */
export async function twilioRequest(
  path: string,
  init: { method?: string; body?: URLSearchParams } = {},
): Promise<TwilioResult> {
  const accountSid = twilioAccountSid();
  const creds = candidates();
  if (!accountSid || creds.length === 0) {
    return {
      ok: false,
      status: 400,
      payload: { message: "Twilio credentials are not configured" },
      credential: "none",
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`;
  let last: TwilioResult | null = null;

  for (const cred of creds) {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: "Basic " + btoa(`${cred.user}:${cred.pass}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: init.body ? init.body.toString() : undefined,
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    last = { ok: res.ok, status: res.status, payload, credential: cred.label };
    if (res.ok) return last;
    if (res.status !== 401 && res.status !== 403) return last;
    console.error(
      `[twilio-auth] ${cred.label} rejected [${res.status}]`,
      (payload as { message?: string }).message ?? "",
    );
  }

  return last!;
}
