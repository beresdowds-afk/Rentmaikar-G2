// Idempotent submission helper. Ensures repeated CTA taps or refreshes
// cannot create duplicate provider requests.
//
// - `runIdempotent(key, fn)` de-duplicates concurrent calls with the same
//   key by returning the in-flight promise; results are cached briefly so a
//   fast double-tap resolves once. On failure the cache is cleared so the
//   user can legitimately retry.
// - `getIdempotencyKey(scope)` returns a stable UUID for the given scope,
//   persisted in sessionStorage so a refresh mid-submit reuses the same
//   key. Providers can accept it as an `Idempotency-Key` header/body.
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';

interface Entry<T> {
  promise: Promise<T>;
  settledAt?: number;
  value?: T;
  error?: unknown;
}

const inflight = new Map<string, Entry<unknown>>();
const SUCCESS_TTL_MS = 5_000; // brief window to swallow rapid retries

export async function runIdempotent<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { portal?: string } = {},
): Promise<T> {
  const existing = inflight.get(key) as Entry<T> | undefined;
  if (existing) {
    // Concurrent duplicate or within the success-TTL window: return cached.
    if (existing.settledAt) {
      const fresh = Date.now() - existing.settledAt < SUCCESS_TTL_MS;
      if (fresh && 'value' in existing) {
        trackOnboardingEvent('portal_cta_dedup_hit', {
          portal: opts.portal,
          idempotencyKey: key,
          extra: { reason: 'cached_success' },
        });
        return existing.value as T;
      }
      if (!fresh) inflight.delete(key);
    } else {
      trackOnboardingEvent('portal_cta_dedup_hit', {
        portal: opts.portal,
        idempotencyKey: key,
        extra: { reason: 'inflight' },
      });
      return existing.promise;
    }
  }

  const promise = (async () => {
    try {
      const value = await fn();
      const entry = inflight.get(key) as Entry<T> | undefined;
      if (entry) {
        entry.settledAt = Date.now();
        entry.value = value;
      }
      // Auto-evict after TTL so subsequent legitimate submissions run.
      setTimeout(() => inflight.delete(key), SUCCESS_TTL_MS);
      return value;
    } catch (err) {
      inflight.delete(key);
      throw err;
    }
  })();

  inflight.set(key, { promise } as Entry<unknown>);
  return promise;
}

function makeUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

const KEY_PREFIX = 'rentmaikar_idem::';

/** Returns a UUID that stays stable across refreshes for the same `scope`
 *  until `releaseIdempotencyKey(scope)` is called (typically on success). */
export function getIdempotencyKey(scope: string): string {
  try {
    const k = KEY_PREFIX + scope;
    const existing = sessionStorage.getItem(k);
    if (existing) return existing;
    const fresh = makeUuid();
    sessionStorage.setItem(k, fresh);
    return fresh;
  } catch {
    return makeUuid();
  }
}

export function releaseIdempotencyKey(scope: string): void {
  try { sessionStorage.removeItem(KEY_PREFIX + scope); } catch { /* ignore */ }
}

/** Test-only reset. */
export function __resetIdempotentSubmitForTests(): void {
  inflight.clear();
}
