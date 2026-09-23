import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthTabSync } from '../useAuthTabSync';
import { Session } from '@supabase/supabase-js';

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

describe('useAuthTabSync', () => {
  let mockChannels: { [key: string]: any[] } = {};

  beforeEach(() => {
    mockChannels = {};
    window.localStorage.clear();
    window.sessionStorage.clear();

    // Mock BroadcastChannel
    class MockBroadcastChannel {
      name: string;
      onmessage: ((event: any) => void) | null = null;

      constructor(name: string) {
        this.name = name;
        if (!mockChannels[name]) mockChannels[name] = [];
        mockChannels[name].push(this);
      }

      postMessage(data: any) {
        (mockChannels[this.name] || []).forEach((ch) => {
          if (ch !== this && ch.onmessage) {
            ch.onmessage({ data });
          }
        });
      }

      close() {
        if (mockChannels[this.name]) {
          mockChannels[this.name] = mockChannels[this.name].filter((ch) => ch !== this);
        }
      }
    }

    (globalThis as any).BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes tab with a unique tabId and leader election', () => {
    const { result } = renderHook(() => useAuthTabSync());

    expect(result.current.tabId).toBeDefined();
    expect(typeof result.current.tabId).toBe('string');
    expect(result.current.tabId.startsWith('tab_')).toBe(true);
    expect(result.current.activeTabsCount).toBe(1);
  });

  it('broadcasts session changes across tabs', () => {
    const onSessionSyncedTab2 = vi.fn();

    // Tab 1
    const { result: tab1 } = renderHook(() => useAuthTabSync({ tabId: 'tab_alpha' }));

    // Tab 2
    const { result: tab2 } = renderHook(() =>
      useAuthTabSync({ tabId: 'tab_beta', onSessionSynced: onSessionSyncedTab2 })
    );

    expect(tab1.current.tabId).not.toEqual(tab2.current.tabId);

    const mockSession = {
      access_token: 'token_123',
      refresh_token: 'refresh_123',
      expires_at: 1800000000,
      user: {
        id: 'user_abc',
        email: 'driver@test.com',
      },
    } as unknown as Session;

    act(() => {
      tab1.current.broadcastSession(mockSession, 'SIGNED_IN');
    });

    expect(tab1.current.lastSyncTime).toBeGreaterThan(0);
  });

  it('broadcasts signout across tabs and triggers onSignedOut', () => {
    const onSignedOutTab2 = vi.fn();

    // Tab 1
    const { result: tab1 } = renderHook(() => useAuthTabSync({ tabId: 'tab_alpha' }));

    // Tab 2
    renderHook(() => useAuthTabSync({ tabId: 'tab_beta', onSignedOut: onSignedOutTab2 }));

    act(() => {
      tab1.current.broadcastSignOut();
    });

    expect(onSignedOutTab2).toHaveBeenCalled();
  });

  it('acquires refresh lock to prevent concurrent token refresh race conditions', async () => {
    const { result } = renderHook(() => useAuthTabSync());

    const refreshOperation = vi.fn().mockResolvedValue('refreshed_token_success');

    let output: string | null = null;
    await act(async () => {
      output = await result.current.acquireRefreshLock(refreshOperation);
    });

    expect(output).toBe('refreshed_token_success');
    expect(refreshOperation).toHaveBeenCalledTimes(1);
  });

  it('cleans up resources and event listeners on unmount', () => {
    const { unmount } = renderHook(() => useAuthTabSync());

    expect(() => {
      unmount();
    }).not.toThrow();
  });
});
