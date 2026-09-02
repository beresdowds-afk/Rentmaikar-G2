// Durable, encrypted storage for third-party API session tokens.
//
// Edge function isolates are short lived: an in-memory `sid` disappears on
// every cold start, which made the platform re-authenticate against the
// provider on nearly every request (and burn the provider's login rate
// limit). This module persists the token in `public.provider_api_sessions`,
// encrypted with AES-GCM so the raw session token is never readable in the
// database, and keyed by a fingerprint of the credentials that produced it —
// rotating credentials automatically invalidates the stored session.
//
// Requires PROVIDER_SESSION_KEY (auto-provisioned secret). Nothing throws:
// if storage or crypto is unavailable the caller simply falls back to a fresh
// login.

const TABLE = "provider_api_sessions";

function restCtx() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return {
    url,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    } as Record<string, string>,
  };
}

let cachedKey: CryptoKey | null = null;

async function aesKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  const secret = Deno.env.get("PROVIDER_SESSION_KEY");
  if (!secret) return null;
  // The secret is an arbitrary-length random string; hash it to 32 bytes.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  cachedKey = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cachedKey;
}

const b64 = (buf: Uint8Array) => btoa(String.fromCharCode(...buf));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function encrypt(plaintext: string): Promise<string | null> {
  const key = await aesKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}

async function decrypt(stored: string): Promise<string | null> {
  const key = await aesKey();
  if (!key) return null;
  try {
    const buf = unb64(stored);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf.subarray(0, 12) },
      key,
      buf.subarray(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Stable, non-reversible fingerprint of the credentials behind a session. */
export async function credentialFingerprint(...parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\u0000")));
  return b64(new Uint8Array(digest)).slice(0, 32);
}

export interface StoredSession {
  token: string;
  issuedAt: number;
  expiresAt: number;
}

/** Read the persisted session for a provider, if it is still valid. */
export async function loadSession(
  provider: string,
  fingerprint: string,
): Promise<StoredSession | null> {
  const ctx = restCtx();
  if (!ctx) return null;
  try {
    const res = await fetch(
      `${ctx.url}/rest/v1/${TABLE}?provider=eq.${encodeURIComponent(provider)}&select=session_ciphertext,credential_fingerprint,issued_at,expires_at`,
      { headers: ctx.headers },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    if (row.credential_fingerprint !== fingerprint) return null;
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    const token = await decrypt(String(row.session_ciphertext));
    if (!token) return null;
    return { token, issuedAt: Date.parse(row.issued_at) || Date.now(), expiresAt };
  } catch {
    return null;
  }
}

/** Persist (upsert) a provider session token, encrypted at rest. */
export async function saveSession(
  provider: string,
  fingerprint: string,
  token: string,
  ttlMs: number,
): Promise<void> {
  const ctx = restCtx();
  if (!ctx) return;
  const ciphertext = await encrypt(token);
  if (!ciphertext) return;
  const now = new Date();
  try {
    await fetch(`${ctx.url}/rest/v1/${TABLE}?on_conflict=provider`, {
      method: "POST",
      headers: { ...ctx.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        provider,
        session_ciphertext: ciphertext,
        credential_fingerprint: fingerprint,
        issued_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlMs).toISOString(),
        updated_at: now.toISOString(),
      }),
    });
  } catch {
    // Persisting is best-effort — the in-memory session still works.
  }
}

/** Drop a stored session (provider rejected it, or credentials were rotated). */
export async function clearSession(provider: string): Promise<void> {
  const ctx = restCtx();
  if (!ctx) return;
  try {
    await fetch(`${ctx.url}/rest/v1/${TABLE}?provider=eq.${encodeURIComponent(provider)}`, {
      method: "DELETE",
      headers: { ...ctx.headers, Prefer: "return=minimal" },
    });
  } catch {
    // ignore
  }
}
