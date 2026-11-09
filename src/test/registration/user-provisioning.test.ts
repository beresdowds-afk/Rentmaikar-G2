import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  roleRows: [{ role: 'owner' as string }],
  profile: { user_id: 'user-1' as string | null } as { user_id: string } | null,
  profileError: null as Error | null,
  getSession: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: {
      getSession: mocks.getSession,
      signUp: mocks.signUp,
      signInWithPassword: mocks.signIn,
    },
    rpc: mocks.rpc,
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.upsert = vi.fn();
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: mocks.profile, error: mocks.profileError }),
      );
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: mocks.roleRows, error: null }).then(resolve);
      return builder;
    }),
  },
}));

import { assignRole, ensureAuthUserForApplicant, verifyProfileExists } from '@/lib/user-provisioning';

const { invoke, rpc, roleRows } = mocks;

describe('account role provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleRows.splice(0, roleRows.length, { role: 'owner' });
    mocks.profile = { user_id: 'user-1' };
    mocks.profileError = null;
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  describe('applicant sign-up', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
      rpc.mockResolvedValue({ data: { registered: false }, error: null });
    });

    it('asks for confirmation before attempting authenticated registration', async () => {
      mocks.signUp.mockResolvedValue({
        data: { user: { id: 'new-user', identities: [{ id: 'identity' }] }, session: null },
        error: null,
      });
      await expect(ensureAuthUserForApplicant({
        email: 'new@example.com', password: 'Password123!', fullName: 'New User', requestedRole: 'owner',
      })).rejects.toMatchObject({ code: 'EMAIL_CONFIRMATION_REQUIRED' });
      expect(invoke).not.toHaveBeenCalled();
    });

    it('preserves non-duplicate 422 errors instead of claiming the account exists', async () => {
      mocks.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { status: 422, message: 'Password is too weak' },
      });
      await expect(ensureAuthUserForApplicant({
        email: 'new@example.com', password: 'Password123!', fullName: 'New User', requestedRole: 'driver',
      })).rejects.toMatchObject({ message: 'Password is too weak' });
      expect(mocks.signIn).not.toHaveBeenCalled();
    });
  });

  it('uses the authorized backend and never writes roles directly from the client', async () => {
    await expect(assignRole('user-1', 'owner', 'owner@example.test')).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledWith('provision-user-account', {
      body: { userId: 'user-1', role: 'owner', email: 'owner@example.test' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the backend refuses provisioning and the role is absent', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Forbidden') });
    roleRows.splice(0, roleRows.length);
    rpc.mockResolvedValue({ data: false, error: null });

    await expect(assignRole('user-1', 'admin')).rejects.toThrow(/Forbidden/);
    expect(invoke).toHaveBeenCalledWith('provision-user-account', {
      body: { userId: 'user-1', role: 'admin', email: undefined },
    });
  });

  it('fails closed when the auth trigger did not create a profile', async () => {
    mocks.profile = null;

    await expect(verifyProfileExists('user-1')).rejects.toThrow(
      /durable profile record was not created/,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces profile lookup errors without attempting client-side recovery', async () => {
    mocks.profileError = new Error('database unavailable');

    await expect(verifyProfileExists('user-1')).rejects.toThrow(
      /Profile verification failed: database unavailable/,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
