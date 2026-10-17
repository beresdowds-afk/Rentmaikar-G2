import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guardedPasswordSignIn } from './auth-password-sign-in';

const rpc = vi.fn();
const signInWithPassword = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { signInWithPassword: (...args: unknown[]) => signInWithPassword(...args) },
  },
}));

describe('guardedPasswordSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockImplementation((name: string) =>
      name === 'check_auth_rate_limit'
        ? Promise.resolve({ data: true, error: null })
        : Promise.resolve({ data: null, error: null }),
    );
    signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('uses the shared normalized email bucket and audits successful sign-in', async () => {
    await guardedPasswordSignIn(' USER@Example.com ', 'password', 'registration');

    expect(rpc).toHaveBeenCalledWith('check_auth_rate_limit', {
      _identifier: 'signin:user@example.com',
      _endpoint: 'auth.signin',
      _max_requests: 5,
      _window_seconds: 300,
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password',
    });
    expect(rpc).toHaveBeenCalledWith('log_auth_event', expect.objectContaining({
      _event_type: 'sign_in_success',
      _metadata: { source: 'registration' },
    }));
  });

  it('rejects a rate-limited sign-in without calling Supabase Auth', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });

    await expect(guardedPasswordSignIn('user@example.com', 'password'))
      .rejects.toMatchObject({ code: 'AUTH_RATE_LIMITED' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('fails closed when the limiter is unavailable', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('database unavailable') });

    await expect(guardedPasswordSignIn('user@example.com', 'password'))
      .rejects.toMatchObject({ code: 'AUTH_RATE_LIMIT_UNAVAILABLE' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
