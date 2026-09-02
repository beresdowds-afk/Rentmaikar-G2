// Regression tests for `useOnboardingMachine`:
//   1. Refetches (recomputes next step) when a realtime `profiles` change
//      arrives for the current user.
//   2. Refetches when the tab becomes visible again.
//
// We stub `@/integrations/supabase/client` and `@/contexts/AuthContext` so the
// hook runs in isolation without hitting the network.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---- Mocks --------------------------------------------------------------
const h = vi.hoisted(() => {
  const rpcMock = vi.fn();
  const removeChannelMock = vi.fn();
  const capturedHandlers: Record<string, (payload: unknown) => void> = {};
  const authStateHandlers: Array<() => void> = [];
  const makeChannel = () => {
    const chain: any = {
      on: vi.fn((_e: string, cfg: { table: string }, cb: (p: unknown) => void) => {
        capturedHandlers[cfg.table] = cb;
        return chain;
      }),
      subscribe: vi.fn(() => chain),
    };
    return chain;
  };
  return { rpcMock, removeChannelMock, capturedHandlers, authStateHandlers, makeChannel };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpcMock(...args),
    channel: vi.fn(() => h.makeChannel()),
    removeChannel: h.removeChannelMock,
    auth: {
      onAuthStateChange: (cb: () => void) => {
        h.authStateHandlers.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// ---- Helpers ------------------------------------------------------------
function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// Import after mocks so vi.mock takes effect.
import { useOnboardingMachine } from './useOnboardingMachine';

describe('useOnboardingMachine', () => {
  beforeEach(() => {
    for (const k of Object.keys(h.capturedHandlers)) delete h.capturedHandlers[k];
    h.rpcMock.mockReset();
    h.removeChannelMock.mockReset();
    h.authStateHandlers.length = 0;
  });

  it('recomputes next_href when a realtime profile change fires', async () => {
    h.rpcMock
      .mockResolvedValueOnce({
        data: { next_step: 'documents', next_href: '/driver/onboarding?step=documents', percent: 40 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { next_step: 'verification', next_href: '/driver/onboarding?step=verification', percent: 80 },
        error: null,
      });

    const { result } = renderHook(() => useOnboardingMachine(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data?.next_step).toBe('documents'));
    expect(h.rpcMock).toHaveBeenCalledTimes(1);

    // Simulate a realtime UPDATE on public.profiles for this user.
    await act(async () => {
      h.capturedHandlers["profiles"]?.({ eventType: "UPDATE" });
    });

    await waitFor(() => expect(result.current.data?.next_step).toBe('verification'));
    expect(h.rpcMock).toHaveBeenCalledTimes(2);
  });

  it('refetches when the tab becomes visible again', async () => {
    h.rpcMock.mockResolvedValue({ data: { next_step: 'documents', next_href: '/x' }, error: null });
    renderHook(() => useOnboardingMachine(), { wrapper: wrapper() });
    await waitFor(() => expect(h.rpcMock).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(h.rpcMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('tears down the realtime channel on unmount', async () => {
    h.rpcMock.mockResolvedValue({ data: {}, error: null });
    const { unmount } = renderHook(() => useOnboardingMachine(), { wrapper: wrapper() });
    await waitFor(() => expect(h.rpcMock).toHaveBeenCalled());
    unmount();
    expect(h.removeChannelMock).toHaveBeenCalledTimes(1);
  });
});
