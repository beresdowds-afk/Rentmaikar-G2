/**
 * Shared Direct Resend Transport & Connector.
 *
 * This module establishes and maintains the Direct Resend connector, communicating
 * directly with the official Resend API (https://api.resend.com) using standard
 * Resend API key Bearer authorization.
 *
 * The unnecessary Lovable Resend connector gateway (connector-gateway.lovable.dev)
 * has been removed in favor of direct API connectivity to api.resend.com.
 */

import { reportResendAuthFailure } from "./email-alerts.ts";
import { sentApiKey, sentEnabled } from "./sent-client.ts";

export const RESEND_DIRECT_URL = "https://api.resend.com";

/** True when the configured key is a valid Resend key. */
export function isDirectResendKey(key?: string | null): boolean {
  return !!key && (key.startsWith("re_") || key.trim().length > 0);
}

/** Base URL for all Resend API calls — always the Direct Resend API. */
export function resendBaseUrl(_key?: string | null): string {
  return RESEND_DIRECT_URL;
}

/** Full endpoint for sending an email with Direct Resend. */
export function resendEmailsUrl(key?: string | null): string {
  return `${resendBaseUrl(key)}/emails`;
}

/** Full endpoint for batch email sending with Direct Resend. */
export function resendBatchEmailsUrl(key?: string | null): string {
  return `${resendBaseUrl(key)}/emails/batch`;
}

/** Full endpoint for verifying domains with Direct Resend. */
export function resendDomainsUrl(key?: string | null): string {
  return `${resendBaseUrl(key)}/domains`;
}

/** Endpoint resolved from the ambient RESEND_API_KEY secret. */
export const RESEND_ENDPOINT = resendEmailsUrl(Deno.env.get("RESEND_API_KEY"));

/**
 * Headers for Direct Resend API requests.
 * Uses standard Direct Resend Bearer authentication: `Authorization: Bearer <RESEND_API_KEY>`.
 */
export function resendHeaders(key?: string | null): Record<string, string> {
  const resendKey = key ?? Deno.env.get("RESEND_API_KEY") ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${resendKey}`,
  };
}

/**
 * Verify connectivity directly with the Resend API to maintain connection health.
 */
export async function verifyDirectResendConnection(apiKey?: string | null): Promise<{
  ok: boolean;
  status: number;
  message: string;
}> {
  const key = apiKey ?? Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) {
    return { ok: false, status: 401, message: "Missing RESEND_API_KEY" };
  }
  try {
    const res = await fetch(resendDomainsUrl(key), {
      method: "GET",
      headers: resendHeaders(key),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      return { ok: true, status: res.status, message: "Direct Resend connector active and verified" };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: `Resend error: ${text.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, status: 500, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The only domain verified for sending in Resend. Anything sent from an
 * unverified domain (e.g. `@rentmaikar.com`, `@mail.rentmaikar.com`) is
 * rejected with `403 domain is not verified`, which is why outbound email was
 * failing. Overridable with `RESEND_SENDING_DOMAIN`.
 */
export function resendSendingDomain(): string {
  return Deno.env.get("RESEND_SENDING_DOMAIN") || "notify.rentmaikar.com";
}

/** Split `Name <local@domain>` (or a bare address) into its parts. */
function parseAddress(value: string): { name?: string; local: string; domain: string } | null {
  const angled = value.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^<>@\s]+)@([^<>@\s]+)>\s*$/);
  if (angled) {
    return { name: angled[1]?.trim() || undefined, local: angled[2], domain: angled[3] };
  }
  const bare = value.match(/^\s*([^<>@\s]+)@([^<>@\s]+)\s*$/);
  if (!bare) return null;
  return { local: bare[1], domain: bare[2] };
}


/**
 * Rewrites a sender onto the verified sending domain, preserving the display
 * name and mailbox. `RESEND_FALLBACK_FROM` still wins when explicitly set.
 */
export function resendFrom(from: string): string {
  const override = Deno.env.get("RESEND_FALLBACK_FROM");
  const candidate = override || from;
  const parsed = parseAddress(candidate);
  if (!parsed) return candidate;
  const domain = resendSendingDomain();
  if (parsed.domain.toLowerCase() === domain.toLowerCase()) return candidate;
  const address = `${parsed.local}@${domain}`;
  return parsed.name ? `${parsed.name} <${address}>` : address;
}

type ResendBody = Record<string, unknown> & { from?: string; reply_to?: string | string[] };

/** Best-effort caller name (`supabase/functions/<name>/index.ts`) for alerts. */
function callerFunctionName(): string {
  const stack = new Error().stack ?? "";
  const match = stack.match(/functions\/([A-Za-z0-9_-]+)\/[^/]+\.ts/);
  return match?.[1] ?? Deno.env.get("SB_FUNCTION_NAME") ?? "unknown-function";
}

/**
 * Fallback: send email via SENT.DM when Resend dispatch fails or is unavailable.
 */
export async function sendEmailViaSent(payload: Record<string, unknown>): Promise<Response | null> {
  if (!sentEnabled()) return null;
  const baseUrl = Deno.env.get("SENT_API_BASE_URL") || "https://api.sent.dm";
  const apiKey = sentApiKey();
  const toRaw = payload.to;
  const toList: string[] = Array.isArray(toRaw)
    ? toRaw.map(String)
    : typeof toRaw === "string"
      ? [toRaw]
      : [];

  if (!toList.length) return null;

  try {
    const res = await fetch(`${baseUrl}/v3/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        to: toList,
        channel: ["email"],
        subject: payload.subject,
        text: payload.text || payload.subject,
        html: payload.html,
        from: payload.from,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      console.log("[resend-gateway] Email fallback via SENT.DM succeeded for", toList.join(", "));
    } else {
      console.warn(`[resend-gateway] Email fallback via SENT.DM returned HTTP ${res.status}`);
    }
    return res;
  } catch (e) {
    console.error("[resend-gateway] Email fallback via SENT.DM error:", e);
    return null;
  }
}

/**
 * Single transport for every outbound Resend email with SENT.DM fallback.
 * Resend is the primary Global email service provider and SENT.DM is the fallback.
 * Normalises the sender onto the verified domain and keeps the original address
 * as `reply_to` so replies still reach the human mailbox. A 401/403 from Resend
 * is terminal, so it is alerted to the team with the failing recipient and
 * payload excerpt before attempting the SENT.DM fallback.
 */
export async function resendSendEmail(body: ResendBody, key?: string | null): Promise<Response> {
  const apiKey = key ?? Deno.env.get("RESEND_API_KEY") ?? "";
  const originalFrom = typeof body.from === "string" ? body.from : "";
  const from = originalFrom ? resendFrom(originalFrom) : originalFrom;
  const replyTo = body.reply_to ??
    (originalFrom && from !== originalFrom ? originalFrom : undefined);
  const caller = callerFunctionName();

  const payload = {
    ...body,
    ...(from ? { from } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  let res: Response | null = null;
  let resendFailed = false;

  if (apiKey) {
    try {
      res = await fetch(resendEmailsUrl(apiKey), {
        method: "POST",
        headers: resendHeaders(apiKey),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        resendFailed = true;
      }
    } catch (e) {
      console.warn("[resend-gateway] Primary Resend fetch failed:", e);
      resendFailed = true;
    }
  } else {
    resendFailed = true;
  }

  if (res && (res.status === 401 || res.status === 403)) {
    // Clone so the caller can still read the body itself if not falling back.
    const detail = await res.clone().text().catch(() => "");
    const to = Array.isArray(body.to) ? body.to[0] : body.to;
    await reportResendAuthFailure({
      functionName: caller,
      status: res.status,
      recipient: typeof to === "string" ? to : null,
      subject: typeof body.subject === "string" ? body.subject : null,
      payload,
      providerResponse: detail,
    });
  }

  // If primary Resend succeeded, return response immediately
  if (res && res.ok) {
    return res;
  }

  // Fallback: SENT.DM as global fallback email provider
  if (resendFailed || !res || !res.ok) {
    console.warn(`[resend-gateway] Resend send ${res ? `status ${res.status}` : 'unavailable'}, trying SENT.DM fallback...`);
    const sentFallbackRes = await sendEmailViaSent(payload);
    if (sentFallbackRes && sentFallbackRes.ok) {
      return sentFallbackRes;
    }
  }

  // If fallback was not successful or unavailable, return the original Resend response (or synthetic error)
  if (res) {
    return res;
  }

  return new Response(
    JSON.stringify({ error: "Resend and SENT.DM email delivery failed or unconfigured" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}


