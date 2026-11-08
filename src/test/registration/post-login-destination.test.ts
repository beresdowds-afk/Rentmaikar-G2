import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    rpc: mocks.rpc,
  },
}));

import { resolvePostLoginDestination } from '@/lib/post-login-destination';

const { getSession, rpc } = mocks;

describe('post-login destination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
  });

  it('sends an incomplete driver to the driver registration form', async () => {
    rpc.mockResolvedValue({
      data: { authenticated: true, role: 'driver', stage: 'account_opened' },
      error: null,
    });

    await expect(resolvePostLoginDestination('user-1', 'driver')).resolves.toBe('/driver/register');
    expect(rpc).toHaveBeenCalledWith('get_my_registration_progress');
  });

  it('sends an owner waiting for review to the owner dashboard', async () => {
    rpc.mockResolvedValue({
      data: { authenticated: true, role: 'owner', stage: 'verification_pending' },
      error: null,
    });

    await expect(resolvePostLoginDestination('user-1', 'owner')).resolves.toBe('/owner/dashboard');
  });

  it('uses the role home if the session does not match the requested user', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'different-user' } } },
      error: null,
    });

    await expect(resolvePostLoginDestination('user-1', 'driver')).resolves.toBe('/driver/dashboard');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not use progress belonging to a different role', async () => {
    rpc.mockResolvedValue({
      data: { authenticated: true, role: 'owner', stage: 'auth' },
      error: null,
    });

    await expect(resolvePostLoginDestination('user-1', 'driver')).resolves.toBe('/driver/dashboard');
  });

  it('routes staff without querying applicant registration progress', async () => {
    await expect(resolvePostLoginDestination('user-1', 'admin')).resolves.toBe('/admin');
    expect(rpc).not.toHaveBeenCalled();
  });
});
