// Shared Svix-style webhook signature verification (Resend / Lovable email events).
//
// Svix signs `${id}.${timestamp}.${body}` with an HMAC-SHA256 key derived from
// the `whsec_<base64>` secret and sends it base64 in `svix-signature`
// (or `webhook-signature`) as a space separated list of `v1,<sig>` entries.
//
// Falls back to a plain HMAC of the raw body so non-Svix style signatures from
// other providers still verify. Fails closed when no secret is configured.

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function hmacBase64(secretBytes: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function secretBytes(secret: string): Uint8Array {
  if (secret.startsWith("whsec_")) {
    const raw = secret.slice(6);
    try {
      return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    } catch {
      return new TextEncoder().encode(raw);
    }
  }
  return new TextEncoder().encode(secret);
}

export async function verifySvixSignature(
  req: Request,
  rawBody: string,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret) return false;

  const header = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature");
  if (!header) return false;

  const id = req.headers.get("svix-id") ?? req.headers.get("webhook-id") ?? "";
  const ts = req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp") ?? "";

  // Reject replays older than 5 minutes when a timestamp is present.
  if (ts) {
    const skew = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(skew) || skew > 300) return false;
  }

  const provided = header
    .split(" ")
    .map((p) => (p.includes(",") ? p.split(",")[1] : p))
    .filter(Boolean);

  const candidates = new Set<string>();
  if (id && ts) candidates.add(await hmacBase64(secretBytes(secret), `${id}.${ts}.${rawBody}`));
  candidates.add(await hmacBase64(secretBytes(secret), rawBody));
  candidates.add(await hmacBase64(new TextEncoder().encode(secret), rawBody));

  return provided.some((sig) => candidates.has(sig));
}
