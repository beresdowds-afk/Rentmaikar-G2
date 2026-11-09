import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  getSession: vi.fn(),
  getRole: vi.fn(),
  status: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: typeof mocks.listener) => {
        mocks.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: mocks.getSession,
    },
    from: () => ({ select: () => ({ eq: mocks.getRole }) }),
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));
vi.mock('@/hooks/useAuthTabSync', () => ({
  useAuthTabSync: () => ({ broadcastSession: noop, broadcastSignOut: noop }),
}));
vi.mock('@/lib/backend-bridge', () => ({
  backendBridge: { invokeEdgeFunction: mocks.status },
}));
vi.mock('@/lib/user-provisioning', () => ({
  assignRole: vi.fn(),
  verifyProfileExists: vi.fn(),
}));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { assignRole } from '@/lib/user-provisioning';

function noop() {}
function State() {
  const { user, userRole, userRoles, hasRole, hasAccountTypeConflict, twoFactorStatus, twoFactorVerified } = useAuth();
  return <div data-testid="state">{JSON.stringify({
    user: user?.id ?? null,
    role: userRole,
    roles: userRoles,
    legal: hasRole('legal_support'),
    conflict: hasAccountTypeConflict,
    failed: twoFactorStatus?.check_failed ?? false,
    verified: twoFactorVerified,
  })}</div>;
}

const session = {
  access_token: 'token',
  user: { id: 'user-1', email: 'user@example.com', app_metadata: {}, user_metadata: {} },
};

beforeEach(() => {
  mocks.listener = null;
  mocks.getSession.mockImplementation(() => new Promise(() => {}));
  mocks.getRole.mockResolvedValue({ data: [{ role: 'driver' }], error: null });
  mocks.status.mockResolvedValue({ data: { success: true, requires_2fa: false }, error: null });
});

describe('session hydration', () => {
  it('does not recreate a driver role when an administrator removed all roles', async () => {
    mocks.getRole.mockResolvedValue({ data: [], error: null });
    vi.mocked(assignRole).mockClear();
    render(<AuthProvider><State /></AuthProvider>);
    act(() => mocks.listener?.('SIGNED_IN', session));
    await waitFor(() => expect(mocks.getRole).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('"roles":[]'));
    expect(assignRole).not.toHaveBeenCalled();
  });

  it.each([
    'admin', 'admin_assistant', 'driver', 'owner', 'legal_support',
    'iot_support', 'vehicle_support', 'insurance_support',
  ])('hydrates the %s role after sign-in', async (role) => {
    mocks.getRole.mockResolvedValue({ data: [{ role }], error: null });
    render(<AuthProvider><State /></AuthProvider>);
    act(() => mocks.listener?.('SIGNED_IN', session));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain(`"role":"${role}"`));
    expect(screen.getByTestId('state').textContent).toContain(`"roles":["${role}"]`);
  });

  it('hydrates every role and selects a deterministic primary role', async () => {
    mocks.getRole.mockResolvedValue({
      data: [{ role: 'legal_support' }, { role: 'driver' }, { role: 'iot_support' }],
      error: null,
    });
    render(<AuthProvider><State /></AuthProvider>);
    act(() => mocks.listener?.('SIGNED_IN', session));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('"role":"legal_support"'));
    expect(screen.getByTestId('state').textContent).toContain('"legal":true');
    expect(screen.getByTestId('state').textContent).toContain('"roles":["legal_support","driver","iot_support"]');
  });

  it('fails closed for legacy accounts with both account types without hiding staff roles', async () => {
    mocks.getRole.mockResolvedValue({
      data: [{ role: 'owner' }, { role: 'driver' }, { role: 'legal_support' }],
      error: null,
    });
    render(<AuthProvider><State /></AuthProvider>);
    act(() => mocks.listener?.('SIGNED_IN', session));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('"conflict":true'));
    expect(screen.getByTestId('state').textContent).toContain('"roles":["legal_support"]');
  });

  it('keeps a failed MFA status check unverified', async () => {
    mocks.status.mockResolvedValue({ data: null, error: new Error('offline') });
    render(<AuthProvider><State /></AuthProvider>);
    act(() => mocks.listener?.('SIGNED_IN', session));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('"failed":true'));
    expect(screen.getByTestId('state').textContent).toContain('"verified":false');
  });

  it('does not restore roles or MFA state after sign-out when requests finish late', async () => {
    let resolveRole!: (value: unknown) => void;
    let resolveStatus!: (value: unknown) => void;
    mocks.getRole.mockImplementation(() => new Promise(resolve => { resolveRole = resolve; }));
    mocks.status.mockImplementation(() => new Promise(resolve => { resolveStatus = resolve; }));
    render(<AuthProvider><State /></AuthProvider>);
    act(() => mocks.listener?.('SIGNED_IN', session));
    await waitFor(() => expect(resolveRole).toBeDefined());
    act(() => mocks.listener?.('SIGNED_OUT', null));
    await act(async () => {
      resolveRole({ data: [{ role: 'admin' }], error: null });
      resolveStatus({ data: { success: true, requires_2fa: false }, error: null });
    });
    expect(screen.getByTestId('state').textContent).toBe(
      '{"user":null,"role":null,"roles":[],"legal":false,"conflict":false,"failed":false,"verified":false}',
    );
  });
});
