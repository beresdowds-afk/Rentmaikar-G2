import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runIdempotent,
  getIdempotencyKey,
  releaseIdempotencyKey,
  __resetIdempotentSubmitForTests,
} from './idempotent-submit';

describe('runIdempotent', () => {
  beforeEach(() => {
    __resetIdempotentSubmitForTests();
    sessionStorage.clear();
  });

  it('deduplicates concurrent submissions with the same key', async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'ok';
    });
    const [a, b, c] = await Promise.all([
      runIdempotent('k1', fn),
      runIdempotent('k1', fn),
      runIdempotent('k1', fn),
    ]);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(c).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reuses cached success within the TTL window', async () => {
    const fn = vi.fn(async () => 42);
    const first = await runIdempotent('k2', fn);
    const second = await runIdempotent('k2', fn);
    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows retry after failure (does not cache errors)', async () => {
    const fn = vi
      .fn(async (): Promise<string> => 'unused')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');
    await expect(runIdempotent('k3', fn)).rejects.toThrow('boom');
    const ok = await runIdempotent('k3', fn);
    expect(ok).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('emits a dedup analytics event on cached hit', async () => {
    const spy = vi.fn();
    window.addEventListener('rentmaikar:onboarding-analytics', spy as EventListener);
    const fn = vi.fn(async () => 1);
    await runIdempotent('k4', fn, { portal: 'insurance' });
    await runIdempotent('k4', fn, { portal: 'insurance' });
    const dedup = spy.mock.calls
      .map((c) => (c[0] as CustomEvent).detail)
      .find((d) => d.event === 'portal_cta_dedup_hit');
    expect(dedup).toBeTruthy();
    expect(dedup.portal).toBe('insurance');
  });
});

describe('getIdempotencyKey', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns a stable UUID for the same scope across calls', () => {
    const a = getIdempotencyKey('insurance-checkout');
    const b = getIdempotencyKey('insurance-checkout');
    expect(a).toBe(b);
  });

  it('rotates after release', () => {
    const a = getIdempotencyKey('training-checkout');
    releaseIdempotencyKey('training-checkout');
    const b = getIdempotencyKey('training-checkout');
    expect(a).not.toBe(b);
  });
});
