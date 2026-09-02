import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useOnboardingProgressReconciliation,
  recordDeepLinkExpectedStage,
} from './useOnboardingProgressReconciliation';

let progress: { data: unknown; refetch: () => Promise<unknown> } = {
  data: null,
  refetch: vi.fn().mockResolvedValue({}),
};

vi.mock('@/hooks/useRegistrationProgress', () => ({
  useRegistrationProgress: () => progress,
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useOnboardingProgressReconciliation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('flags mismatch when server stage differs from deep-link expected stage', async () => {
    recordDeepLinkExpectedStage('documents_submitted');
    progress = {
      data: { stage: 'approved', role: 'driver', authenticated: true },
      refetch: vi.fn().mockResolvedValue({}),
    };
    const events: string[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail.event);
    window.addEventListener('rentmaikar:onboarding-analytics', listener);

    const { result } = renderHook(() => useOnboardingProgressReconciliation(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('mismatch'));
    expect(result.current.expected).toBe('documents_submitted');
    expect(result.current.actual).toBe('approved');
    expect(events).toContain('progress_reconciliation_mismatch');

    act(() => result.current.acknowledge());
    expect(result.current.status).toBe('ok');
    window.removeEventListener('rentmaikar:onboarding-analytics', listener);
  });

  it('reports ok when stages match', async () => {
    recordDeepLinkExpectedStage('account_opened');
    progress = {
      data: { stage: 'account_opened', role: 'owner', authenticated: true },
      refetch: vi.fn().mockResolvedValue({}),
    };
    const { result } = renderHook(() => useOnboardingProgressReconciliation(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ok'));
  });
});
