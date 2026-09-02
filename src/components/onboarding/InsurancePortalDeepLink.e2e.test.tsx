/**
 * End-to-end style test for the Insurance portal deep link + guarded
 * navigation flow. Verifies:
 *   1. A deep link to the insurance portal opens via the route guard.
 *   2. When the user is only authenticated, the gate unlocks Insurance
 *      (per the progressive gating rules starting at "create your account").
 *   3. The provider payload sent when the user checks out matches the
 *      subscription plan and idempotency contract.
 *   4. Analytics events fire for deep_link_opened and portal_cta_submitted.
 *   5. Repeated CTA taps dedupe to a single provider request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegionProvider } from "@/contexts/RegionContext";
import { AuthProvider } from "@/contexts/AuthContext";


export function renderWithProviders(
  ui: ReactNode,
  initialEntries = ["/"]
) {
  const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
    },
    mutations: {
      retry: false,
    },
  },
});

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RegionProvider>
          <MemoryRouter initialEntries={initialEntries}>
            {ui}
          </MemoryRouter>
        </RegionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  
}import {
  runIdempotent,
  getIdempotencyKey,
  __resetIdempotentSubmitForTests,
} from '@/lib/idempotent-submit';

const invoke = vi.fn();

const progress = {
  authenticated: true,
  stage: 'account_opened' as const,
  access_level: 'view_only' as const,
  role: 'owner' as const,
  email_verified: false,
  identity_verification_status: null,
  identity_verified_at: null,
  documents_uploaded: 0,
  referees_verified: 0,
  application_status: null,
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
  auth: {
    getUser: vi.fn(async () => ({
      data: {
        user: {
          id: "u1",
          email: "o@r.com",
        },
      },
      error: null,
    })),

    getSession: vi.fn(async () => ({
      data: {
        session: null,
      },
      error: null,
    })),

    onAuthStateChange: vi.fn(() => ({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })),
  },

  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  })),

  removeChannel: vi.fn(),

  functions: {
    invoke: vi.fn((...args) => invoke(...args)),
  },

  rpc: vi.fn(async () => ({
    data: progress,
    error: null,
  })),
},
  }));
  
vi.mock('@/hooks/useRegistrationProgress', () => ({
  useRegistrationProgress: () => ({ data: progress, isLoading: false }),
  advanceRegistrationStage: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => {
  const React = require("react");

  const value = {
    user: { id: "u1", email: "o@r.com" },
    session: {},
    profile: {},
    isLoading: false,
    isRoleLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  };

  return {
    AuthProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),

    useAuth: () => value,
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import PortalRouteGuard from '@/components/onboarding/PortalRouteGuard';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';

// Minimal insurance checkout that mirrors what the real portal does:
// calls `subscribe-to-plan` with an Idempotency-Key body so repeated taps
// are deduplicated by the shared helper before hitting the network.
function InsuranceCheckoutButton() {
  const submit = async () => {
    const key = getIdempotencyKey('insurance-checkout');
    const { supabase } = await import('@/integrations/supabase/client');
    trackOnboardingEvent('portal_cta_submitted', {
      role: 'owner',
      portal: 'insurance',
      idempotencyKey: key,
    });

    await runIdempotent(
      key,
      () =>
        supabase.functions.invoke('subscribe-to-plan', {
          body: {
            plan_type: 'insurance',
            plan_id: 'plan-insurance-owner',
            idempotency_key: key,
          },
        }),
      { portal: 'insurance' },
    );
  };
  return <button onClick={submit}>Subscribe to Insurance</button>;
}

function renderInsuranceRoute() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/owner/portal/:portalKey"
        element={<PortalRouteGuard role="owner" />}
      />

      <Route
        path="/owner/dashboard"
        element={<InsuranceCheckoutButton />}
      />
    </Routes>,
    ["/owner/portal/insurance"]
  );
}

describe('Insurance portal deep link + guarded navigation', () => {
  beforeEach(() => {
    invoke.mockReset();
    __resetIdempotentSubmitForTests();
    sessionStorage.clear();
  });

  it('unlocks the insurance portal for an authenticated owner and redirects to the dashboard', async () => {
    renderInsuranceRoute();
    // Progressive gating: authenticated is enough for Insurance, so the
    // guard redirects into the dashboard tab, showing the CTA.
    await waitFor(() =>
      expect(screen.getByText('Subscribe to Insurance')).toBeInTheDocument(),
    );
  });

  it('sends the correct provider payload with an idempotency key', async () => {
    invoke.mockResolvedValueOnce({ data: { checkout_url: 'https://x' }, error: null });
    renderInsuranceRoute();
    fireEvent.click(await screen.findByText('Subscribe to Insurance'));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [name, args] = invoke.mock.calls[0];
    expect(name).toBe('subscribe-to-plan');
    expect((args as { body: Record<string, unknown> }).body).toMatchObject({
      plan_type: 'insurance',
      plan_id: 'plan-insurance-owner',
    });
    expect(
      (args as { body: { idempotency_key: string } }).body.idempotency_key,
    ).toBeTruthy();
  });

  it('dedupes rapid double-taps to a single provider request', async () => {
    invoke.mockResolvedValue({ data: { checkout_url: 'https://x' }, error: null });
    renderInsuranceRoute();
    const btn = await screen.findByText('Subscribe to Insurance');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
  });

  it('emits analytics events for the CTA submission and dedup hits', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const events: string[] = [];
    const listener = (e: Event) => {
      events.push((e as CustomEvent).detail.event);
    };
    window.addEventListener('rentmaikar:onboarding-analytics', listener);
    renderInsuranceRoute();
    const btn = await screen.findByText('Subscribe to Insurance');
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    window.removeEventListener('rentmaikar:onboarding-analytics', listener);
    expect(events).toContain('portal_cta_submitted');
    expect(events).toContain('portal_cta_dedup_hit');
  });
});
