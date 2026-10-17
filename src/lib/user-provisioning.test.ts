import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn(async () => ({ error: null }));
const rpc = vi.fn<(name?: string, args?: unknown) => Promise<{ data: any; error: any }>>(async () => ({ data: null, error: { message: 'denied' } }));
const getSession = vi.fn();
const signInWithPassword = vi.fn();
let existingRoles: any[] = [];
const invoke = vi.fn(async () => ({ data: null, error: { message: 'missing' } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => (rpc as any)(...a),
    auth: { getSession: () => getSession(), signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) },
    functions: { invoke: (...a: unknown[]) => (invoke as any)(...a) },
    from: () => ({
      upsert,
      select: () => ({ eq: async () => ({ data: existingRoles, error: null }) }),
    }),
  },
}));

import { assignRole } from './user-provisioning';
import { guardedPasswordSignIn } from './auth-password-sign-in';

describe('assignRole self-assignment guard', () => {
  beforeEach(() => {
    upsert.mockClear();
    existingRoles = [];
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  });

  it('never upserts an elevated role onto the caller\'s own account', async () => {
    await expect(assignRole('u1', 'admin' as any)).rejects.toMatchObject({ code: 'ROLE_VERIFICATION_FAILED' });
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

describe('assignRole for elevated roles provisioned server-side (signup trigger)', () => {
  it('succeeds without a client upsert when the server already granted the role', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    existingRoles = [{ role: 'admin' }];
    await expect(assignRole('u1', 'admin' as any)).resolves.toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('guardedPasswordSignIn', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    rpc.mockReset();
  });

  it('does not attempt sign-in when rate limited', async () => {
    rpc.mockImplementation(async (name?: string) => (name === 'check_auth_rate_limit' ? { data: false, error: null } : { data: null, error: null }));
    await expect(guardedPasswordSignIn('a@b.co', 'pw')).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('log_auth_event', expect.objectContaining({ _event_type: 'sign_in_rate_limited' }));
  });

  it('fails closed when the limiter errors', async () => {
    rpc.mockImplementation(async (name?: string) => (name === 'check_auth_rate_limit' ? { data: null, error: { message: 'down' } } : { data: null, error: null }));
    await expect(guardedPasswordSignIn('a@b.co', 'pw')).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in and audits when allowed', async () => {
    rpc.mockImplementation(async () => ({ data: true, error: null }));
    signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const res = await guardedPasswordSignIn('a@b.co', 'pw');
    expect(res.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('log_auth_event', expect.objectContaining({ _event_type: 'sign_in_success' }));
  });
});
