/**
 * Resend native inbound email ("email.received" webhook events).
 *
 * Unlike the Cloudflare email-router payload (full parsed message in one POST),
 * Resend's inbound event only carries metadata plus an `email_id`; the body and
 * attachments must be fetched from the receiving API:
 *   GET /emails/receiving/{email_id}              -> full message (text/html)
 *   GET /emails/receiving/{email_id}/attachments  -> attachment download URLs
 *
 * Both endpoints honour the same auth as sends, so we reuse the shared
 * resend-gateway helpers (direct `re_` key vs Lovable connector gateway).
 */

import { resendBaseUrl, resendHeaders } from "./resend-gateway.ts";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

export interface NormalisedInboundEmail {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  messageId?: string;
  headers: Record<string, string>;
  attachments: {
    filename: string;
    contentType: string;
    size: number;
    content: string; // base64
  }[];
  source: string;
}

/** True when the payload is a Resend native inbound event. */
export function isResendInboundEvent(payload: unknown): boolean {
  const p = payload as { type?: string; data?: { email_id?: string } } | null;
  return !!p && p.type === "email.received" && typeof p.data?.email_id === "string";
}

const b64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return btoa(out);
};

async function downloadAttachment(
  baseUrl: string,
  headers: Record<string, string>,
  emailId: string,
  attachmentId: string,
): Promise<ArrayBuffer | null> {
  const res = await fetch(`${baseUrl}/emails/receiving/${emailId}/attachments/${attachmentId}`, {
    headers,
  });
  if (!res.ok) {
    console.error(`attachment download failed [${res.status}]`, attachmentId);
    return null;
  }
  const buf = await res.arrayBuffer();
  return buf.byteLength > MAX_ATTACHMENT_BYTES ? null : buf;
}

interface ReceivingAttachmentMeta {
  id: string;
  filename?: string;
  content_type?: string;
  size?: number;
  download_url?: string;
}

/**
 * Fetch and normalise a Resend inbound email into the same flat shape the
 * Cloudflare email-router posts, so downstream handling is identical.
 */
export async function fetchResendInboundEmail(emailId: string): Promise<NormalisedInboundEmail> {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  const baseUrl = resendBaseUrl(key);
  const headers = resendHeaders(key);

  const res = await fetch(`${baseUrl}/emails/receiving/${emailId}`, { headers });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to fetch inbound email ${emailId}: ${res.status} ${detail}`);
  }
  const email = await res.json();

  const to: string[] = Array.isArray(email.to) ? email.to : email.to ? [email.to] : [];
  const cc: string[] = Array.isArray(email.cc) ? email.cc : email.cc ? [email.cc] : [];

  // Attachments: metadata may be inline on the email or need the list endpoint.
  let metas: ReceivingAttachmentMeta[] = Array.isArray(email.attachments) ? email.attachments : [];
  if (!metas.length) {
    const listRes = await fetch(`${baseUrl}/emails/receiving/${emailId}/attachments`, { headers });
    if (listRes.ok) {
      const list = await listRes.json();
      metas = Array.isArray(list?.data) ? list.data : [];
    }
  }

  const attachments = [];
  for (const meta of metas.slice(0, MAX_ATTACHMENTS)) {
    let buf: ArrayBuffer | null = null;
    if (meta.download_url) {
      const dl = await fetch(meta.download_url);
      if (dl.ok) {
        const b = await dl.arrayBuffer();
        buf = b.byteLength > MAX_ATTACHMENT_BYTES ? null : b;
      }
    } else if (meta.id) {
      buf = await downloadAttachment(baseUrl, headers, emailId, meta.id);
    }
    if (!buf) continue;
    attachments.push({
      filename: meta.filename || "attachment",
      contentType: meta.content_type || "application/octet-stream",
      size: buf.byteLength,
      content: b64(buf),
    });
  }

  const headersObj: Record<string, string> = {};
  if (Array.isArray(email.headers)) {
    for (const h of email.headers) {
      if (h?.name) headersObj[String(h.name).toLowerCase()] = String(h.value ?? "");
    }
  } else if (email.headers && typeof email.headers === "object") {
    for (const [k, v] of Object.entries(email.headers)) {
      headersObj[k.toLowerCase()] = String(v);
    }
  }

  return {
    from: typeof email.from === "string" ? email.from : "",
    to,
    cc,
    subject: email.subject || "(no subject)",
    text: email.text || "",
    html: email.html || "",
    messageId: email.message_id || emailId,
    headers: headersObj,
    attachments,
    source: "resend-inbound",
  };
}
