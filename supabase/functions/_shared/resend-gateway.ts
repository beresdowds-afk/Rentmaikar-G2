/**
 * Shared Resend transport.
 *
 * The project's `RESEND_API_KEY` is managed by the Lovable Resend connector, so
 * it is a *connection* key — not a raw `re_...` Resend API key. Posting it
 * straight to api.resend.com fails with `401 API key is invalid`, which is what
 * silently killed every outbound email.
 *
 * Use `RESEND_ENDPOINT` + `resendHeaders(key)` for every send: when the key is a
 * real Resend key we talk to Resend directly, otherwise we route through the
 * Lovable connector gateway (same path `process-email-queue` already uses).
 */

import { reportResendAuthFailure } from "./email-alerts.ts";

const RESEND_DIRECT_URL = "https://api.resend.com";
const RESEND_GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

/** True when the configured key is a raw Resend API key (`re_...`). */
export function isDirectResendKey(key?: string | null): boolean {
  return !!key && key.startsWith("re_");
}

/** Base URL to use for Resend calls, given the configured key. */
export function resendBaseUrl(key?: string | null): string {
  return isDirectResendKey(key) ? RESEND_DIRECT_URL : RESEND_GATEWAY_URL;
}

/** Full endpoint for sending an email with the configured key. */
export function resendEmailsUrl(key?: string | null): string {
  return `${resendBaseUrl(key)}/emails`;
}

/** Endpoint resolved from the ambient RESEND_API_KEY secret. */
export const RESEND_ENDPOINT = resendEmailsUrl(Deno.env.get("RESEND_API_KEY"));

/**
 * Headers for a Resend send. Direct keys use `Authorization: Bearer <re_...>`;
 * connector keys authenticate with the Lovable API key and pass the connection
 * key through `X-Connection-Api-Key`.
 */
export function resendHeaders(key?: string | null): Record<string, string> {
  const resendKey = key ?? Deno.env.get("RESEND_API_KEY") ?? "";
  if (isDirectResendKey(resendKey)) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    };
  }
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": resendKey,
  };
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
 * Single transport for every outbound Resend email. Normalises the sender onto
 * the verified domain and keeps the original address as `reply_to` so replies
 * still reach the human mailbox. A 401/403 from Resend is terminal, so it is
 * alerted to the team with the failing recipient and payload excerpt.
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

  const res = await fetch(resendEmailsUrl(apiKey), {
    method: "POST",
    headers: resendHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (res.status === 401 || res.status === 403) {
    // Clone so the caller can still read the body itself.
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

  return res;
}


