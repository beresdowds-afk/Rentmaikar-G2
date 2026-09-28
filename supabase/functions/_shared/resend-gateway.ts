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

import { sendPlatformEmail } from "./backend-email-bridge.ts";
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

/**
 * Single transport for every outbound Resend email with SENT.DM fallback.
 * Resend is the primary Global email service provider and SENT.DM is the fallback.
 * Normalises the sender onto the verified domain and keeps the original address
 * as `reply_to` so replies still reach the human mailbox. A 401/403 from Resend
 * is terminal, so it is alerted to the team with the failing recipient and
 * payload excerpt before attempting the SENT.DM fallback.
 * Ensures all outbound emails have valid unique Id and Name attributes.
 */
/**
 * Compatibility transport for ordinary outbound platform email.
 *
 * This function intentionally does NOT call Resend or SENT.DM.
 *
 * It preserves the existing resendSendEmail() contract used by the
 * Supabase Edge Functions while handing actual delivery to the
 * server-side Backend Email Bridge.
 *
 * Delivery path:
 *
 *   Existing producer
 *        ↓
 *   resendSendEmail()
 *        ↓
 *   Backend Email Bridge
 *        ↓
 *   staging.rentmaikar.com/api/functions/send-outbound-email
 *        ↓
 *   Cloud Run emailService
 *        ↓
 *   Resend
 */
export async function resendSendEmail(
  body: ResendBody,
  _legacyResendApiKey?: string | null,
): Promise<Response> {
  const originalFrom =
    typeof body.from === "string" ? body.from : "";

  const rawFrom =
    originalFrom ? resendFrom(originalFrom) : originalFrom;

  const from =
    rawFrom ? ensureSenderName(rawFrom) : rawFrom;

  const replyTo =
    body.reply_to ??
    (
      originalFrom && from !== originalFrom
        ? originalFrom
        : undefined
    );

  // Preserve an existing message ID where possible.
  // Otherwise generate one for tracking and idempotency.
  const uniqueMessageId =
    (typeof body.id === "string" && body.id)
      ? body.id
      : (typeof body.messageId === "string" && body.messageId)
        ? body.messageId
        : (typeof body.message_id === "string" && body.message_id)
          ? body.message_id
          : crypto.randomUUID();

  const domain = resendSendingDomain();

  const existingHeaders =
    body.headers &&
    typeof body.headers === "object"
      ? body.headers as Record<string, string>
      : {};

  const headers = {
    "Message-ID": `<${uniqueMessageId}@${domain}>`,
    "X-Entity-Ref-ID": uniqueMessageId,
    ...existingHeaders,
  };

  const existingTags =
    Array.isArray(body.tags)
      ? body.tags
      : [];

  const validTags = existingTags
    .filter(
      (t: any) =>
        t &&
        typeof t.name === "string" &&
        t.name.trim().length > 0,
    )
    .map((t: any) => ({
      name: String(t.name).trim(),
      value: String(t.value ?? ""),
    }));

  if (
    !validTags.some(
      (t: any) => t.name === "message_id",
    )
  ) {
    validTags.push({
      name: "message_id",
      value: uniqueMessageId,
    });
  }

  if (
    !validTags.some(
      (t: any) => t.name === "platform_source",
    )
  ) {
    validTags.push({
      name: "platform_source",
      value: "rentmaikar",
    });
  }

  const payload = {
    ...body,
    id: uniqueMessageId,
    headers,
    tags: validTags,

    ...(from ? { from } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const correlationId =
    typeof body.correlationId === "string" &&
    body.correlationId.trim()
      ? body.correlationId
      : `resend-adapter-${crypto.randomUUID()}`;

  const idempotencyKey =
    typeof body.idempotencyKey === "string" &&
    body.idempotencyKey.trim()
      ? body.idempotencyKey
      : uniqueMessageId;

  const result = await sendPlatformEmail(
    payload,
    {
      correlationId,
      idempotencyKey,
      platformSource:
        "resend-gateway-compatibility-adapter",
      timeoutMs: 30000,
    },
  );

  const responseBody = {
    ok: result.ok,
    success: result.success,

    ...(result.messageId
      ? { messageId: result.messageId }
      : {}),

    ...(result.data !== undefined
      ? { data: result.data }
      : {}),

    ...(result.error
      ? { error: result.error }
      : {}),

    correlationId: result.correlationId,

    ...(result.ok
      ? { provider: "backend-email-bridge" }
      : {}),
  };

  return new Response(
    JSON.stringify(responseBody),
    {
      status:
        result.ok
          ? 200
          : (result.status || 502),

      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

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

  


