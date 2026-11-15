/**
 * Shared Resend Gateway for Supabase Edge Functions.
 *
 * Governing Policy:
 * 1. Resend is Rentmaikar's exclusive outbound email provider.
 * 2. Edge Functions MUST delegate outbound email dispatch through the
 *    authoritative `rentmaikar-backend` email gateway (`/api/functions/send-outbound-email`).
 * 3. Silent provider fallbacks (such as SENT.DM email fallback or native mailers)
 *    are strictly prohibited. SENT.DM remains dedicated exclusively to SMS & WhatsApp.
 */

import {
  delegateToBackendEmail,
  resolveBackendBaseUrl,
} from "./backend-email-client.ts";

export const RESEND_DIRECT_URL = "https://api.resend.com";

export function isDirectResendKey(key?: string | null): boolean {
  return !!key && (key.startsWith("re_") || key.trim().length > 0);
}

export function resendBaseUrl(_key?: string | null): string {
  return RESEND_DIRECT_URL;
}

export function resendEmailsUrl(key?: string | null): string {
  return `${resendBaseUrl(key)}/emails`;
}

export function resendBatchEmailsUrl(key?: string | null): string {
  return `${resendBaseUrl(key)}/emails/batch`;
}

export function resendDomainsUrl(key?: string | null): string {
  return `${resendBaseUrl(key)}/domains`;
}

export const RESEND_ENDPOINT = resendEmailsUrl(null);

export function resendHeaders(key?: string | null): Record<string, string> {
  const resendKey = (key ?? "").trim();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${resendKey}`,
  };
}

export async function verifyDirectResendConnection(): Promise<{
  ok: boolean;
  status: number;
  message: string;
}> {
  const result = await delegateToBackendEmail("email-health", {}, { method: "GET" });
  return {
    ok: result.ok,
    status: result.status,
    message:
      String(result.data?.message || result.data?.error || "") ||
      (result.ok ? "Backend Resend gateway verified" : "Backend Resend gateway unavailable"),
  };
}

export function resendSendingDomain(): string {
  return Deno.env.get("RESEND_SENDING_DOMAIN") || "notify.rentmaikar.com";
}

function parseAddress(value: string): { name?: string; local: string; domain: string } | null {
  const angled = value.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^<>@\s]+)@([^<>@\s]+)>\s*$/);
  if (angled) {
    return { name: angled[1]?.trim() || undefined, local: angled[2], domain: angled[3] };
  }
  const bare = value.match(/^\s*([^<>@\s]+)@([^<>@\s]+)\s*$/);
  if (!bare) return null;
  return { local: bare[1], domain: bare[2] };
}

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

type ResendBody = Record<string, unknown> & {
  from?: string;
  to?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  replyTo?: string | string[];
  idempotencyKey?: string;
  templateName?: string;
};

/**
 * Centralized outbound email transport.
 * Delegates exclusively to `rentmaikar-backend` (`/api/functions/send-outbound-email`),
 * failing closed when backend configuration or Resend delivery fails.
 */
export async function resendSendEmail(body: ResendBody, _key?: string | null): Promise<Response> {
  const originalFrom = typeof body.from === "string" ? body.from : "";
  const rawFrom = originalFrom ? resendFrom(originalFrom) : originalFrom;
  const from = rawFrom ? ensureSenderName(rawFrom) : rawFrom;
  const replyTo =
    body.reply_to ??
    body.replyTo ??
    (originalFrom && from !== originalFrom ? originalFrom : undefined);

  const uniqueMessageId =
    typeof body.id === "string" && body.id
      ? body.id
      : typeof body.messageId === "string" && body.messageId
        ? body.messageId
        : typeof body.message_id === "string" && body.message_id
          ? body.message_id
          : crypto.randomUUID();

  const domain = resendSendingDomain();
  const existingHeaders =
    body.headers && typeof body.headers === "object"
      ? (body.headers as Record<string, string>)
      : {};

  const headers = {
    "Message-ID": `<${uniqueMessageId}@${domain}>`,
    "X-Entity-Ref-ID": uniqueMessageId,
    ...existingHeaders,
  };

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

  const forwardedPayload: Record<string, unknown> = {
    action: "send",
    ...body,
    id: uniqueMessageId,
    from: from || undefined,
    replyTo,
    reply_to: replyTo,
    headers,
    tags: validTags,
    templateName: body.templateName || "edge_delegated",
    metadata: {
      ...(typeof body.metadata === "object" && body.metadata ? body.metadata : {}),
      messageId: uniqueMessageId,
      delegatedVia: resolveBackendBaseUrl(),
    },
  };

  const delegation = await delegateToBackendEmail(
    "send-outbound-email",
    forwardedPayload,
    {
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : uniqueMessageId,
      correlationId: uniqueMessageId,
    },
  );

  const responsePayload = delegation.data && Object.keys(delegation.data).length > 0
    ? delegation.data
    : { ok: delegation.ok, error: delegation.ok ? undefined : "Backend email dispatch failed" };

  const normalizedId =
    (typeof responsePayload.messageId === "string" && responsePayload.messageId) ||
    (typeof responsePayload.id === "string" && responsePayload.id) ||
    uniqueMessageId;

  return new Response(
    JSON.stringify({
      ...responsePayload,
      id: normalizedId,
      messageId: normalizedId,
    }),
    {
      status: delegation.ok ? 200 : Math.max(400, delegation.status || 502),
      headers: { "Content-Type": "application/json" },
    },
  );
}
