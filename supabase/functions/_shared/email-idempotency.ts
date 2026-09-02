/**
 * Idempotency for user-triggered "resend email" actions.
 *
 * A double-clicked (or retried) verification / password-reset request carries
 * the same `Idempotency-Key` header. The first request claims the key and
 * actually sends; every replay within the retention window short-circuits and
 * replays the stored response instead of sending a second email.
 *
 * Backed by public.email_idempotency_keys (service-role only).
 */

// deno-lint-ignore no-explicit-any
type Admin = any;

export function readIdempotencyKey(req: Request): string | null {
  const raw =
    req.headers.get("Idempotency-Key") ??
    req.headers.get("idempotency-key") ??
    req.headers.get("X-Idempotency-Key");
  if (!raw) return null;
  const key = raw.trim().slice(0, 200);
  return key.length >= 8 ? key : null;
}

export interface IdempotencyClaim {
  /** True when this request owns the send. */
  fresh: boolean;
  /** Stored response from the original request, when this is a replay. */
  response?: Record<string, unknown> | null;
  key: string | null;
}

/** Try to claim `key` for `purpose`. Never throws — falls back to sending. */
export async function claimEmailIdempotency(
  admin: Admin,
  purpose: string,
  key: string | null,
  recipient?: string | null,
): Promise<IdempotencyClaim> {
  if (!key) return { fresh: true, key: null };

  // Housekeeping: drop expired claims so keys can legitimately be reused.
  await admin
    .from("email_idempotency_keys")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .then(() => undefined, () => undefined);

  const { error } = await admin
    .from("email_idempotency_keys")
    .insert({ purpose, idempotency_key: key, recipient: recipient ?? null });

  if (!error) return { fresh: true, key };

  // 23505 = unique violation -> a previous request already owns this key.
  if ((error as { code?: string }).code === "23505") {
    const { data } = await admin
      .from("email_idempotency_keys")
      .select("response")
      .eq("purpose", purpose)
      .eq("idempotency_key", key)
      .maybeSingle();
    return { fresh: false, response: (data?.response ?? null) as Record<string, unknown> | null, key };
  }

  console.warn("email idempotency claim failed, proceeding:", error);
  return { fresh: true, key };
}

/** Persist the outcome so replays can return the same body. */
export async function recordEmailIdempotencyResult(
  admin: Admin,
  purpose: string,
  key: string | null,
  response: Record<string, unknown>,
): Promise<void> {
  if (!key) return;
  await admin
    .from("email_idempotency_keys")
    .update({ response })
    .eq("purpose", purpose)
    .eq("idempotency_key", key)
    .then(() => undefined, () => undefined);
}

/** Release a claim after a failed send so the user can legitimately retry. */
export async function releaseEmailIdempotency(
  admin: Admin,
  purpose: string,
  key: string | null,
): Promise<void> {
  if (!key) return;
  await admin
    .from("email_idempotency_keys")
    .delete()
    .eq("purpose", purpose)
    .eq("idempotency_key", key)
    .then(() => undefined, () => undefined);
}
