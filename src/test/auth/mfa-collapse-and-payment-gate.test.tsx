import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  value: {
    user: { id: 'user-1', email: 'driver@example.com' },
    session: { access_token: 'tok', user: { id: 'user-1' } },
    isLoading: false,
    userRole: 'driver' as const,
    userRoles: ['driver'] as const,
    hasAccountTypeConflict: false,
    isRoleLoading: false,
    twoFactorStatus: {
      requires_2fa: true,
      is_setup: false,
      is_mandatory: false,
      has_phone: false,
      preferred_channel: 'authenticator',
      verified: false,
      requires_challenge: false,
      check_failed: true,
      check_error: 'MFA verification is temporarily unavailable. Your session is preserved; please retry.',
      current_level: null as string | null,
      next_level: null as string | null,
    },
    twoFactorVerified: false,
    mfaCheckDismissed: false,
    dismissMfaCheckFailed: vi.fn(),
    restoreMfaCheckPrompt: vi.fn(),
    hasRole: vi.fn(() => true),
    check2FAStatus: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    refreshRoles: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendGoogleSsoAuthEmail: vi.fn(),
  },
}));

const supabaseMocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authMock.value,
}));

vi.mock('@/contexts/RegionContext', () => ({
  useRegion: () => ({ country: 'Nigeria', currency: 'NGN' }),
}));

vi.mock('@/contexts/ImpersonationContext', () => ({
  useImpersonation: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { totp: [], phone: [] }, error: null }),
      },
    },
    rpc: supabaseMocks.rpc,
    functions: { invoke: supabaseMocks.invoke },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
          order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        }),
      }),
    }),
  },
}));

import Auth from '@/pages/Auth';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useDashboardAuthGate } from '@/components/auth/DashboardAuthGate';
import { PaymentMfaGate } from '@/components/payments/PaymentMfaGate';
import { PaymentMethodPicker } from '@/components/payments/PaymentMethodPicker';
import { WithdrawalAuthorizationGate } from '@/components/payments/WithdrawalAuthorizationGate';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function DashboardProbe() {
  const gate = useDashboardAuthGate({ allowedRoles: ['driver'], label: 'Driver Dashboard' });
  if (gate) return <>{gate}</>;
  return <div data-testid="dashboard-content">Driver Session Content</div>;
}

describe('MFA check card collapse & compulsory payment MFA enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.value.twoFactorVerified = false;
    authMock.value.mfaCheckDismissed = false;
    authMock.value.userRole = 'driver';
    authMock.value.twoFactorStatus = {
      requires_2fa: true,
      is_setup: false,
      is_mandatory: false,
      has_phone: false,
      preferred_channel: 'authenticator',
      verified: false,
      requires_challenge: false,
      check_failed: true,
      check_error: 'MFA verification is temporarily unavailable. Your session is preserved; please retry.',
      current_level: null,
      next_level: null,
    };
  });

  it('shows Collapse and Continue without MFA buttons on the MFA failure card and invokes dismissMfaCheckFailed', () => {
    authMock.value.userRole = null as unknown as 'driver';
    render(
      <MemoryRouter initialEntries={['/auth']}>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('mfa-check-failed-card')).toBeInTheDocument();
    expect(screen.getByText('Unable to verify two-factor status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    const collapseBtn = screen.getByRole('button', { name: 'Collapse' });
    fireEvent.click(collapseBtn);
    expect(authMock.value.dismissMfaCheckFailed).toHaveBeenCalledTimes(1);

    const continueBtn = screen.getByRole('button', { name: 'Continue without MFA' });
    fireEvent.click(continueBtn);
    expect(authMock.value.dismissMfaCheckFailed).toHaveBeenCalledTimes(2);
  });

  it('allows continuing non-payment sessions via ProtectedRoute and DashboardAuthGate once collapsed, while blocking before collapse', () => {
    const qc = new QueryClient();

    // Before collapsing: ProtectedRoute redirects to /auth
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/driver/dashboard']}>
          <Routes>
            <Route path="/auth" element={<div data-testid="auth-redirect">Auth Page</div>} />
            <Route
              path="/driver/dashboard"
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <DashboardProbe />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('auth-redirect')).toBeInTheDocument();
    unmount();

    // After collapsing: ProtectedRoute and DashboardAuthGate allow session access
    authMock.value.mfaCheckDismissed = true;
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/driver/dashboard']}>
          <Routes>
            <Route path="/auth" element={<div data-testid="auth-redirect">Auth Page</div>} />
            <Route
              path="/driver/dashboard"
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <DashboardProbe />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
  });

  it('still blocks all payments and withdrawals when session continued without MFA, and allows retrying MFA', () => {
    const qc = new QueryClient();
    authMock.value.mfaCheckDismissed = true;
    authMock.value.twoFactorVerified = false;

    render(
      <QueryClientProvider client={qc}>
        <PaymentMethodPicker country="Nigeria" amount={5000} />
        <WithdrawalAuthorizationGate requestType="owner_payout" amount={100} currency="USD">
          {() => <button>Execute Payout</button>}
        </WithdrawalAuthorizationGate>
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId('payment-method-picker')).not.toBeInTheDocument();
    expect(screen.queryByText('Execute Payout')).not.toBeInTheDocument();
    expect(screen.queryByText('Request authorization')).not.toBeInTheDocument();

    const alerts = screen.getAllByTestId('payment-mfa-required-alert');
    expect(alerts.length).toBe(2);

    fireEvent.click(screen.getAllByTestId('payment-mfa-retry-button')[0]);
    expect(authMock.value.check2FAStatus).toHaveBeenCalledWith('user-1');
  });

  it('still blocks payments at AAL1 even if login twoFactorVerified is true, and unlocks once AAL2 is reached', () => {
    authMock.value.twoFactorVerified = true;
    authMock.value.twoFactorStatus = {
      requires_2fa: false,
      is_setup: false,
      is_mandatory: false,
      has_phone: false,
      preferred_channel: 'authenticator',
      verified: true,
      requires_challenge: false,
      check_failed: false,
      check_error: '',
      current_level: 'aal1',
      next_level: 'aal1',
    };

    const { rerender } = render(
      <PaymentMfaGate>
        <div data-testid="unlocked-payment">Pay Now</div>
      </PaymentMfaGate>,
    );

    expect(screen.queryByTestId('unlocked-payment')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-mfa-setup-gate')).toBeInTheDocument();

    // Verify unlocking at AAL2
    authMock.value.twoFactorStatus = {
      ...authMock.value.twoFactorStatus,
      current_level: 'aal2',
      next_level: 'aal2',
    };

    rerender(
      <PaymentMfaGate>
        <div data-testid="unlocked-payment">Pay Now</div>
      </PaymentMfaGate>,
    );
    expect(screen.getByTestId('unlocked-payment')).toBeInTheDocument();
  });
});
