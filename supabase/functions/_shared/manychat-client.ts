// ManyChat client — Instagram DMs, Facebook Messenger, and outbound campaign
// flows. Stubbed behind MANYCHAT_API_TOKEN so callers can integrate before
// credentials arrive.
//
// Docs: https://api.manychat.com/swagger

const BASE = "https://api.manychat.com/fb";

function token() {
  return Deno.env.get("MANYCHAT_API_TOKEN") || null;
}

async function call(path: string, body?: unknown, method = "POST") {
  const t = token();
  if (!t) return { ok: false as const, reason: "not_configured" as const };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, reason: "provider_error" as const, status: res.status, body: data };
  return { ok: true as const, body: data };
}

export const manychat = {
  isConfigured: () => !!token(),

  sendMessage: (subscriberId: string, text: string) =>
    call(`/sending/sendContent`, {
      subscriber_id: subscriberId,
      data: { version: "v2", content: { messages: [{ type: "text", text }] } },
      message_tag: "ACCOUNT_UPDATE",
    }),

  triggerFlow: (subscriberId: string, flowNs: string) =>
    call(`/sending/sendFlow`, { subscriber_id: subscriberId, flow_ns: flowNs }),

  tagSubscriber: (subscriberId: string, tagName: string) =>
    call(`/subscriber/addTag`, { subscriber_id: subscriberId, tag_name: tagName }),

  getSubscriber: (subscriberId: string) =>
    call(`/subscriber/getInfo?subscriber_id=${encodeURIComponent(subscriberId)}`, undefined, "GET"),
};

export async function verifyManychatSignature(rawBody: string, signatureHeader: string | null) {
  const secret = Deno.env.get("MANYCHAT_WEBHOOK_SECRET");
  if (!secret) return false;
  if (!signatureHeader) return false;
  const provided = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === provided;
}
