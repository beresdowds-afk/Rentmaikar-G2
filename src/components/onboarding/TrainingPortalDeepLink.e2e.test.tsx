/**
 * End-to-end style test for the Driver Training portal deep link + guarded
 * navigation flow. Mirrors the insurance-portal test to verify:
 *   1. A deep link to the training portal opens via the route guard.
 *   2. The gate unlocks for an authenticated driver (progressive gating).
 *   3. The provider payload sent to `subscribe-to-plan` matches the
 *      training subscription contract and carries an idempotency key.
 *   4. Analytics events fire for CTA submission and dedup hits.
 *   5. Repeated CTA taps dedupe to a single provider request and the UI
 *      shows the explicit "Already submitted" state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { __resetIdempotentSubmitForTests } from '@/lib/idempotent-submit';

const invoke = vi.fn();

const progress = {
  authenticated: true,
  stage: 'account_opened' as const,
  access_level: 'view_only' as const,
  role: 'driver' as const,
  email_verified: false,
  identity_verification_status: null,
  identity_verified_at: null,
  documents_uploaded: 0,
  referees_verified: 0,
  application_status: null,
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'd1', email: 'd@r.com' } } }),
    },
    rpc: () => Promise.resolve({ data: progress, error: null }),
  },
}));

vi.mock('@/hooks/useRegistrationProgress', () => ({
  useRegistrationProgress: () => ({ data: progress, isLoading: false }),
  advanceRegistrationStage: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'd1' }, isLoading: false, isRoleLoading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

import PortalRouteGuard from '@/components/onboarding/PortalRouteGuard';
import IdempotentSubmitButton from '@/components/onboarding/IdempotentSubmitButton';

function TrainingCheckoutButton() {
  return (
    <IdempotentSubmitButton
      scope="training-checkout"
      portal="training"
      role="driver"
      onSubmit={async (key) => {
        const { supabase } = await import('@/integrations/supabase/client');
        return supabase.functions.invoke('subscribe-to-plan', {
          body: {
            plan_type: 'training',
            plan_id: 'plan-training-driver',
            idempotency_key: key,
          },
        });
      }}
    >
      Enroll in Training
    </IdempotentSubmitButton>
  );
}

function renderTrainingRoute() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/driver/portal/training']}>
        <Routes>
          <Route path="/driver/portal/:portalKey" element={<PortalRouteGuard role="driver" />} />
          <Route path="/driver/dashboard" element={<TrainingCheckoutButton />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Training portal deep link + guarded navigation', () => {
  beforeEach(() => {
    invoke.mockReset();
    __resetIdempotentSubmitForTests();
    sessionStorage.clear();
  });

  it('unlocks the training portal for an authenticated driver', async () => {
    renderTrainingRoute();
    await waitFor(() =>
      expect(screen.getByText('Enroll in Training')).toBeInTheDocument(),
    );
  });

  it('sends the training subscribe payload with an idempotency key', async () => {
    invoke.mockResolvedValueOnce({ data: { checkout_url: 'https://x' }, error: null });
    renderTrainingRoute();
    fireEvent.click(await screen.findByText('Enroll in Training'));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [name, args] = invoke.mock.calls[0];
    expect(name).toBe('subscribe-to-plan');
    expect((args as { body: Record<string, unknown> }).body).toMatchObject({
      plan_type: 'training',
      plan_id: 'plan-training-driver',
    });
    expect(
      (args as { body: { idempotency_key: string } }).body.idempotency_key,
    ).toBeTruthy();
  });

  it('shows an explicit "Already submitted" state on rapid double-taps', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    renderTrainingRoute();
    const btn = await screen.findByText('Enroll in Training');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('idempotent-dedup-note')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Already submitted/i)).toBeInTheDocument();
  });

  it('emits analytics for the CTA submission and dedup hit', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const events: string[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail.event);
    window.addEventListener('rentmaikar:onboarding-analytics', listener);
    renderTrainingRoute();
    const btn = await screen.findByText('Enroll in Training');
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    window.removeEventListener('rentmaikar:onboarding-analytics', listener);
    expect(events).toContain('portal_cta_submitted');
    expect(events).toContain('portal_cta_dedup_hit');
  });
});
