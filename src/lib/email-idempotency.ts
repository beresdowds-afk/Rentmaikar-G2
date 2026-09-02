/**
 * Stable idempotency keys for user-triggered "resend email" actions.
 *
 * The same logical request (e.g. "resend my verification email") keeps the
 * same key for a short window, so double-clicks or retries collapse into a
 * single outbound email server-side. The key rotates once the window elapses
 * so a deliberate later retry still sends.
 */

const WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const STORAGE_PREFIX = "rmk_email_idem:";

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface StoredKey {
  key: string;
  at: number;
}

/** Returns a key that is stable for `WINDOW_MS` per purpose+identifier. */
export function emailIdempotencyKey(purpose: string, identifier?: string | null): string {
  const slot = `${STORAGE_PREFIX}${purpose}:${(identifier ?? "anon").toLowerCase()}`;
  try {
    const raw = sessionStorage.getItem(slot);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredKey;
      if (parsed?.key && Date.now() - parsed.at < WINDOW_MS) return parsed.key;
    }
  } catch {
    /* storage unavailable — fall through to a fresh key */
  }
  const key = `${purpose}-${randomId()}`;
  try {
    sessionStorage.setItem(slot, JSON.stringify({ key, at: Date.now() } satisfies StoredKey));
  } catch {
    /* ignore */
  }
  return key;
}

/** Drop the stored key so the next click is treated as a brand new request. */
export function resetEmailIdempotencyKey(purpose: string, identifier?: string | null): void {
  try {
    sessionStorage.removeItem(
      `${STORAGE_PREFIX}${purpose}:${(identifier ?? "anon").toLowerCase()}`,
    );
  } catch {
    /* ignore */
  }
}

/** Convenience: headers object for supabase.functions.invoke. */
export function idempotencyHeaders(
  purpose: string,
  identifier?: string | null,
): Record<string, string> {
  return { "Idempotency-Key": emailIdempotencyKey(purpose, identifier) };
}
