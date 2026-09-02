/**
 * Client-side idempotency keys for money-moving edge function calls.
 *
 * The key is stable for a logical attempt: the same user + operation +
 * amount/reference combination within a short window reuses the same key, so a
 * double-click or a retry after a flaky network never charges twice. The server
 * (public.payment_idempotency_keys) is the authority — this just supplies the key.
 */

const WINDOW_MS = 2 * 60 * 1000; // attempts collapse within a 2-minute window

function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Build a deterministic idempotency key from an operation name and its inputs.
 */
export function buildIdempotencyKey(operation: string, parts: Record<string, unknown>): string {
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const payload = JSON.stringify(
    Object.keys(parts)
      .sort()
      .map((k) => [k, parts[k] ?? null]),
  );
  return `${operation}:${stableHash(payload)}:${bucket}`;
}

/** Headers to attach to a supabase.functions.invoke call. */
export function idempotencyHeaders(operation: string, parts: Record<string, unknown>): Record<string, string> {
  return { "Idempotency-Key": buildIdempotencyKey(operation, parts) };
}

/** A one-off key for operations with no natural dedupe inputs. */
export function freshIdempotencyKey(operation: string): string {
  return `${operation}:${crypto.randomUUID()}`;
}
