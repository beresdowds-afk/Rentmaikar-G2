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
import { getConfiguredBusinessSender, resolveBusinessReplyTo } from "./email-sender-policy.ts";

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

/** Transport domain for provider DNS and bounce handling; not the visible From identity. */
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


/** Resolves the single server-configured visible From identity. */
export function resendFrom(_from: string): string {
  return getConfiguredBusinessSender();
}

type ResendBody = Record<string, unknown> & { from?: string; reply_to?: string | string[] };

/** Best-effort caller name (`supabase/functions/<name>/index.ts`) for alerts. */
function callerFunctionName(): string {
  const stack = new Error().stack ?? "";
  const match = stack.match(/functions\/([A-Za-z0-9_-]+)\/[^/]+\.ts/);
  return match?.[1] ?? Deno.env.get("SB_FUNCTION_NAME") ?? "unknown-function";
}

/**
 * Ensures the sender address contains a valid display Name attribute.
 */
export function ensureSenderName(addressWithOrWithoutName: string): string {
  const parsed = parseAddress(addressWithOrWithoutName);
  if (!parsed) return addressWithOrWithoutName;
  if (parsed.name && parsed.name.trim().length > 0) return addressWithOrWithoutName;
  const local = parsed.local.toLowerCase();
  const nameMap: Record<string, string> = {
    support: "Rentmaikar Support",
    noreply: "Rentmaikar Notifications",
    admin: "Rentmaikar Admin",
    notifications: "Rentmaikar Notifications",
    verify: "Rentmaikar Verification",
    negotiations: "Rentmaikar Pricing",
    payments: "Rentmaikar Billing & Payments",
    documents: "Rentmaikar Document Verification",
    legal: "Rentmaikar Legal",
    privacy: "Rentmaikar Privacy",
    dpo: "Rentmaikar Data Protection",
    nigeria: "Rentmaikar Nigeria Operations",
    usa: "Rentmaikar USA Operations",
    security: "Rentmaikar Security",
  };
  const derivedName = nameMap[local] || `Rentmaikar ${local.charAt(0).toUpperCase() + local.slice(1)}`;
  return `${derivedName} <${parsed.local}@${parsed.domain}>`;
}

/** Single Resend transport with a server-controlled visible From identity. */
export async function resendSendEmail(body: ResendBody, key?: string | null): Promise<Response> {
  const rawRecipients = Array.isArray(body.to)
    ? body.to
    : typeof body.to === "string"
      ? [body.to]
      : [];
  if (
    rawRecipients.length === 0 ||
    rawRecipients.length > 50 ||
    rawRecipients.some((recipient) => typeof recipient !== "string" || !parseAddress(recipient.trim())) ||
    body.cc !== undefined ||
    body.bcc !== undefined
  ) {
    return new Response(
      JSON.stringify({ error: "Invalid recipient list" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiKey = key ?? Deno.env.get("RESEND_API_KEY") ?? "";
  let from: string;
  try {
    from = ensureSenderName(resendFrom(typeof body.from === "string" ? body.from : ""));
  } catch (error) {
    console.error("[resend-gateway] Outbound sender configuration is invalid");
    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Outbound sender configuration is invalid",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  let replyTo: string | string[] | undefined;
  try {
    replyTo = resolveBusinessReplyTo(body.reply_to);
  } catch {
    return new Response(
      JSON.stringify({ error: "Reply-To must be an approved rentmaikar.com address" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const caller = callerFunctionName();

  // Generate or preserve unique message Id for tracking and headers
  const uniqueMessageId = (typeof body.id === "string" && body.id)
    ? body.id
    : (typeof body.messageId === "string" && body.messageId)
      ? body.messageId
      : (typeof body.message_id === "string" && body.message_id)
        ? body.message_id
        : crypto.randomUUID();

  const domain = resendSendingDomain();
  const existingHeaders = (body.headers && typeof body.headers === "object") ? (body.headers as Record<string, string>) : {};
  const headers = {
    "Message-ID": `<${uniqueMessageId}@${domain}>`,
    "X-Entity-Ref-ID": uniqueMessageId,
    ...existingHeaders,
  };

  // Ensure tags array exists and all tags have valid name and value attributes
  const existingTags = Array.isArray(body.tags) ? body.tags : [];
  const validTags = existingTags
    .filter((t: any) => t && typeof t.name === "string" && t.name.trim().length > 0)
    .map((t: any) => ({ name: String(t.name).trim(), value: String(t.value ?? "") }));

  if (!validTags.some((t: any) => t.name === "message_id")) {
    validTags.push({ name: "message_id", value: uniqueMessageId });
  }
  if (!validTags.some((t: any) => t.name === "platform_source")) {
    validTags.push({ name: "platform_source", value: "rentmaikar" });
  }

  const payload = {
    ...body,
    id: uniqueMessageId,
    headers,
    tags: validTags,
    ...(from ? { from } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  let res: Response | null = null;

  if (apiKey) {
    try {
      res = await fetch(resendEmailsUrl(apiKey), {
        method: "POST",
        headers: resendHeaders(apiKey),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

    } catch (e) {
      console.warn("[resend-gateway] Primary Resend fetch failed:", e);
      return new Response(
        JSON.stringify({ error: "Resend delivery request failed" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  } else {
    return new Response(
      JSON.stringify({ error: "Resend is not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  if (res && (res.status === 401 || res.status === 403)) {
    await reportResendAuthFailure({
      functionName: caller,
      status: res.status,
      recipient: null,
      subject: null,
      payload: undefined,
      providerResponse: undefined,
    });
  }

  // If primary Resend succeeded, return response immediately
  if (res && res.ok) {
    return res;
  }

  if (res) {
    return new Response(JSON.stringify({ error: "Resend delivery failed" }), {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        ...(res.headers.get("retry-after")
          ? { "Retry-After": res.headers.get("retry-after")! }
          : {}),
      },
    });
  }

  return new Response(JSON.stringify({ error: "Resend delivery failed" }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
}
