/**
 * Cloudflare Email Routing -> RentMaikar inbound email webhook.
 *
 * Cloudflare Email Routing can only forward to a mailbox or to an Email Worker.
 * This Worker is the "webhook" leg: it parses each message delivered to
 * backend.rentmaikar.com and POSTs a JSON payload to the platform's
 * email-webhook endpoint, signed with the Svix-style scheme the endpoint
 * already verifies (webhook-id / webhook-timestamp / webhook-signature).
 *
 * Bindings (set with `wrangler secret put`):
 *   EMAIL_WEBHOOK_URL   - full https URL of the inbound email function
 *   EMAIL_WEBHOOK_SECRET- same value as RESEND_WEBHOOK_SECRET in the backend
 *   FALLBACK_FORWARD_TO - optional mailbox to forward to when the POST fails
 */

import PostalMime from 'postal-mime';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return btoa(out);
};

const secretBytes = (secret) => {
  if (secret.startsWith('whsec_')) {
    const raw = secret.slice(6);
    try {
      return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    } catch {
      return new TextEncoder().encode(raw);
    }
  }
  return new TextEncoder().encode(secret);
};

async function sign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

function headersToObject(headers) {
  const out = {};
  for (const { key, value } of headers || []) {
    out[String(key).toLowerCase()] = value;
  }
  return out;
}

function mapAttachments(attachments) {
  return (attachments || [])
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => {
      const bytes = a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : a.content;
      if (!bytes || bytes.length > MAX_ATTACHMENT_BYTES) return null;
      return {
        filename: a.filename || 'attachment',
        contentType: a.mimeType || 'application/octet-stream',
        size: bytes.length,
        content: b64(bytes.buffer ?? bytes),
      };
    })
    .filter(Boolean);
}

export default {
  async email(message, env, ctx) {
    const raw = new Response(message.raw);
    const parsed = await PostalMime.parse(await raw.arrayBuffer());

    const payload = {
      from: parsed.from?.name
        ? `${parsed.from.name} <${parsed.from.address}>`
        : parsed.from?.address || message.from,
      to: message.to,
      cc: (parsed.cc || []).map((c) => c.address),
      subject: parsed.subject || '(no subject)',
      text: parsed.text || '',
      html: parsed.html || '',
      messageId: parsed.messageId || message.headers.get('message-id') || crypto.randomUUID(),
      headers: headersToObject(parsed.headers),
      attachments: mapAttachments(parsed.attachments),
      source: 'cloudflare-email-routing',
    };

    const body = JSON.stringify(payload);
    const id = `msg_${crypto.randomUUID()}`;
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = await sign(env.EMAIL_WEBHOOK_SECRET, `${id}.${ts}.${body}`);

    let delivered = false;
    try {
      const res = await fetch(env.EMAIL_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'webhook-id': id,
          'webhook-timestamp': ts,
          'webhook-signature': `v1,${signature}`,
        },
        body,
      });
      delivered = res.ok;
      if (!res.ok) {
        console.error('inbound webhook rejected', res.status, await res.text());
      }
    } catch (err) {
      console.error('inbound webhook error', err);
    }

    if (!delivered && env.FALLBACK_FORWARD_TO) {
      await message.forward(env.FALLBACK_FORWARD_TO);
    }
  },
};
