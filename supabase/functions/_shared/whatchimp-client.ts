// Whatchimp WhatsApp client — Meta Business Cloud API partner.
// Stubbed behind secrets so the send-inbox-reply and send-sms-notification
// routers can safely reference it before credentials arrive.
//
// Env: WHATCHIMP_API_KEY, WHATCHIMP_PHONE_NUMBER_ID, WHATCHIMP_API_BASE (optional)

interface SendArgs {
  to: string;                 // E.164 e.g. +15551234567
  body?: string;
  templateName?: string;
  templateLang?: string;
  templateParams?: string[];
  mediaUrl?: string;
  mediaType?: "image" | "document" | "audio" | "video";
}

function creds() {
  const apiKey = Deno.env.get("WHATCHIMP_API_KEY");
  const phoneNumberId = Deno.env.get("WHATCHIMP_PHONE_NUMBER_ID");
  if (!apiKey || !phoneNumberId) return null;
  const base = Deno.env.get("WHATCHIMP_API_BASE") || "https://api.whatchimp.com/v1";
  return { apiKey, phoneNumberId, base };
}

export const whatchimp = {
  isConfigured: () => !!creds(),

  async sendMessage(args: SendArgs) {
    const c = creds();
    if (!c) return { ok: false as const, reason: "not_configured" as const };

    let payload: Record<string, unknown>;
    if (args.templateName) {
      payload = {
        messaging_product: "whatsapp",
        to: args.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: args.templateName,
          language: { code: args.templateLang || "en_US" },
          components: args.templateParams?.length
            ? [{
                type: "body",
                parameters: args.templateParams.map((t) => ({ type: "text", text: t })),
              }]
            : [],
        },
      };
    } else if (args.mediaUrl) {
      payload = {
        messaging_product: "whatsapp",
        to: args.to.replace(/^\+/, ""),
        type: args.mediaType || "image",
        [args.mediaType || "image"]: { link: args.mediaUrl, caption: args.body },
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        to: args.to.replace(/^\+/, ""),
        type: "text",
        text: { body: args.body || "" },
      };
    }

    const res = await fetch(`${c.base}/${c.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false as const, reason: "provider_error" as const, status: res.status, body };
    }
    const messageId = (body?.messages?.[0]?.id as string) || `whatchimp_${Date.now()}`;
    return { ok: true as const, messageId, body };
  },
};

// Verify inbound webhook HMAC (Meta-style x-hub-signature-256)
export async function verifyWhatchimpSignature(rawBody: string, signatureHeader: string | null) {
  const secret = Deno.env.get("WHATCHIMP_WEBHOOK_SECRET");
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
