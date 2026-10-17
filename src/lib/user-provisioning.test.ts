import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn(async () => ({ error: null }));
const rpc = vi.fn(async () => ({ data: null, error: { message: 'denied' } }));
const getSession = vi.fn();
const invoke = vi.fn(async () => ({ data: null, error: { message: 'missing' } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => (rpc as any)(...a),
    auth: { getSession: () => getSession() },
    functions: { invoke: (...a: unknown[]) => (invoke as any)(...a) },
    from: () => ({
      upsert,
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    }),
  },
}));

import { assignRole } from './user-provisioning';

describe('assignRole self-assignment guard', () => {
  beforeEach(() => {
    upsert.mockClear();
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  });

  it('never upserts an elevated role onto the caller\'s own account', async () => {
    await expect(assignRole('u1', 'admin' as any)).rejects.toMatchObject({ code: 'ROLE_VERIFICATION_FAILED' });
    expect(upsert).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('allows the direct fallback for admins acting on another user', async () => {
    await expect(assignRole('someone-else', 'legal_support' as any)).rejects.toThrow(/verification failed/i);
    expect(upsert).toHaveBeenCalled();
  });

  it('allows self-service roles to use the fallback', async () => {
    await expect(assignRole('u1', 'driver' as any)).rejects.toThrow(/verification failed/i);
    expect(upsert).toHaveBeenCalled();
  });
});
