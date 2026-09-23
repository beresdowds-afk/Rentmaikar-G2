import { useEffect, useRef, useState, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AuthSyncMessageType =
  | 'AUTH_SESSION_UPDATE'
  | 'AUTH_SIGNOUT'
  | 'AUTH_PING'
  | 'AUTH_PONG'
  | 'AUTH_REFRESH_STARTED'
  | 'AUTH_REFRESH_COMPLETED';

export interface AuthSyncMessage {
  type: AuthSyncMessageType;
  tabId: string;
  timestamp: number;
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    user: {
      id: string;
      email?: string;
    };
  } | null;
  origin?: string;
}

export interface UseAuthTabSyncOptions {
  /**
   * Current session in this tab
   */
  session?: Session | null;
  /**
   * Called when another tab signs in or refreshes session
   */
  onSessionSynced?: (session: Session) => void;
  /**
   * Called when another tab signs out
   */
  onSignedOut?: () => void;
  /**
   * Whether cross-tab sync is enabled (default true)
   */
  enabled?: boolean;
  /**
   * Optional custom tabId (useful for testing or distinct worker scopes)
   */
  tabId?: string;
}

export interface AuthTabSyncReturn {
  tabId: string;
  isLeader: boolean;
  activeTabsCount: number;
  lastSyncTime: number | null;
  broadcastSession: (session: Session | null, eventType?: 'SIGNED_IN' | 'TOKEN_REFRESHED' | 'USER_UPDATED') => void;
  broadcastSignOut: () => void;
  syncSessionNow: () => Promise<Session | null>;
  acquireRefreshLock: <T>(action: () => Promise<T>) => Promise<T | null>;
}

const BROADCAST_CHANNEL_NAME = 'rentmaikar_auth_tab_sync';
const REFRESH_LOCK_KEY = 'rentmaikar_auth_refresh_lock';
const REFRESH_LOCK_TIMEOUT_MS = 10000; // 10s max lock lease to prevent deadlock if tab crashes

/**
 * Generates a stable unique ID for this browser tab instance
 */
function createTabId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = window.sessionStorage?.getItem('rm_auth_tab_id');
  if (existing) return existing;
  const newId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  try {
    window.sessionStorage?.setItem('rm_auth_tab_id', newId);
  } catch {
    // Non-fatal if sessionStorage is blocked
  }
  return newId;
}

/**
 * Coordinates cross-tab authentication state to prevent users from being logged out
 * when opening multiple tabs or navigating between tabs.
 *
 * Key protections:
 * 1. Synchronizes login/logout events instantaneously across tabs via BroadcastChannel & storage events.
 * 2. Coordinates token refresh via a distributed tab mutex (Web Locks API / localStorage fallback)
 *    so multiple tabs don't concurrently trigger Supabase refresh token rotation (which revokes sessions).
 * 3. Keeps in-memory sessions in sync when background tabs regain focus or visibility.
 */
export function useAuthTabSync(options: UseAuthTabSyncOptions = {}): AuthTabSyncReturn {
  const { session, onSessionSynced, onSignedOut, enabled = true, tabId: customTabId } = options;

  const [tabId] = useState<string>(() => customTabId || createTabId());
  const [activeTabsCount, setActiveTabsCount] = useState<number>(1);
  const [isLeader, setIsLeader] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const knownTabsRef = useRef<Map<string, number>>(new Map());
  const isRefreshingRef = useRef<boolean>(false);
  const onSessionSyncedRef = useRef(onSessionSynced);
  const onSignedOutRef = useRef(onSignedOut);
  const currentSessionRef = useRef<Session | null>(session ?? null);

  // Keep callback refs fresh without causing re-subscriptions
  useEffect(() => {
    onSessionSyncedRef.current = onSessionSynced;
  }, [onSessionSynced]);

  useEffect(() => {
    onSignedOutRef.current = onSignedOut;
  }, [onSignedOut]);

  useEffect(() => {
    currentSessionRef.current = session ?? null;
  }, [session]);

  /**
   * Broadcasts a message to all other open tabs
   */
  const postMessage = useCallback((msg: AuthSyncMessage) => {
    if (typeof window === 'undefined') return;

    if (channelRef.current) {
      try {
        channelRef.current.postMessage(msg);
      } catch (err) {
        console.warn('[AuthTabSync] Failed to post via BroadcastChannel:', err);
      }
    }

    // Fallback/redundancy: also dispatch via localStorage to ensure tabs in non-BroadcastChannel
    // or across slightly different contexts still observe auth events
    try {
      if (msg.type === 'AUTH_SESSION_UPDATE' || msg.type === 'AUTH_SIGNOUT') {
        const payload = JSON.stringify({ ...msg, _t: Date.now() });
        window.localStorage.setItem('rm_auth_tab_sync_event', payload);
      }
    } catch {
      // Storage quota or blocked
    }
  }, []);

  /**
   * Broadcast current session state to other tabs
   */
  const broadcastSession = useCallback(
    (s: Session | null, eventType: 'SIGNED_IN' | 'TOKEN_REFRESHED' | 'USER_UPDATED' = 'SIGNED_IN') => {
      if (!enabled) return;
      if (!s) {
        postMessage({
          type: 'AUTH_SIGNOUT',
          tabId,
          timestamp: Date.now(),
        });
        return;
      }

      postMessage({
        type: 'AUTH_SESSION_UPDATE',
        tabId,
        timestamp: Date.now(),
        session: {
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          expires_at: s.expires_at,
          user: {
            id: s.user.id,
            email: s.user.email,
          },
        },
      });
      setLastSyncTime(Date.now());
    },
    [enabled, postMessage, tabId]
  );

  /**
   * Broadcast explicit sign-out event to all other tabs
   */
  const broadcastSignOut = useCallback(() => {
    postMessage({
      type: 'AUTH_SIGNOUT',
      tabId,
      timestamp: Date.now(),
    });
    setLastSyncTime(Date.now());
  }, [postMessage, tabId]);

  /**
   * Pulls the latest session from Supabase/storage and updates local state if needed
   */
  const syncSessionNow = useCallback(async (): Promise<Session | null> => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        return null;
      }
      if (data.session) {
        setLastSyncTime(Date.now());
        if (onSessionSyncedRef.current) {
          onSessionSyncedRef.current(data.session);
        }
      }
      return data.session;
    } catch (err) {
      console.warn('[AuthTabSync] Error running syncSessionNow:', err);
      return null;
    }
  }, []);

  /**
   * Cross-tab mutex execution: Ensures only ONE tab performs sensitive token operations
   * (e.g. token refresh) at a time, avoiding Supabase's refresh token rotation revocation.
   */
  const acquireRefreshLock = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | null> => {
      if (typeof window === 'undefined') {
        return await action();
      }

      // 1. Modern Web Locks API (supported in all modern browsers)
      if (typeof navigator !== 'undefined' && 'locks' in navigator && (navigator as any).locks?.request) {
        try {
          return await (navigator as any).locks.request(
            REFRESH_LOCK_KEY,
            { ifAvailable: true },
            async (lock: any) => {
              if (!lock) {
                // Another tab is currently refreshing. Wait for its broadcast.
                return null;
              }
              postMessage({ type: 'AUTH_REFRESH_STARTED', tabId, timestamp: Date.now() });
              try {
                const result = await action();
                postMessage({ type: 'AUTH_REFRESH_COMPLETED', tabId, timestamp: Date.now() });
                return result;
              } catch (err) {
                throw err;
              }
            }
          );
        } catch (lockErr) {
          console.warn('[AuthTabSync] Web Locks request failed, falling back to localStorage mutex:', lockErr);
        }
      }

      // 2. Fallback: Atomic-style timestamp mutex in localStorage
      const now = Date.now();
      const rawLock = window.localStorage.getItem(REFRESH_LOCK_KEY);
      if (rawLock) {
        try {
          const parsed = JSON.parse(rawLock);
          if (now - parsed.timestamp < REFRESH_LOCK_TIMEOUT_MS && parsed.tabId !== tabId) {
            // Lock held by another live tab
            return null;
          }
        } catch {
          // Stale or corrupted lock entry, safe to take over
        }
      }

      // Claim lock
      try {
        window.localStorage.setItem(
          REFRESH_LOCK_KEY,
          JSON.stringify({ tabId, timestamp: now })
        );
      } catch {
        // Continue
      }

      postMessage({ type: 'AUTH_REFRESH_STARTED', tabId, timestamp: now });

      try {
        const result = await action();
        postMessage({ type: 'AUTH_REFRESH_COMPLETED', tabId, timestamp: Date.now() });
        return result;
      } finally {
        try {
          const current = window.localStorage.getItem(REFRESH_LOCK_KEY);
          if (current) {
            const parsed = JSON.parse(current);
            if (parsed.tabId === tabId) {
              window.localStorage.removeItem(REFRESH_LOCK_KEY);
            }
          }
        } catch {
          // Ignore
        }
      }
    },
    [postMessage, tabId]
  );

  /**
   * Internal message handler for cross-tab events
   */
  const handleIncomingMessage = useCallback(
    async (msg: AuthSyncMessage) => {
      if (!msg || msg.tabId === tabId) return;

      // Update active tabs tracking
      knownTabsRef.current.set(msg.tabId, Date.now());
      setActiveTabsCount(knownTabsRef.current.size + 1);

      switch (msg.type) {
        case 'AUTH_SESSION_UPDATE': {
          setLastSyncTime(msg.timestamp);

          // If another tab established or refreshed a session:
          if (msg.session) {
            const currentToken = currentSessionRef.current?.access_token;
            // Only re-apply if the incoming token differs to prevent unnecessary re-renders
            if (currentToken !== msg.session.access_token) {
              try {
                // Sync session from storage directly
                const { data } = await supabase.auth.getSession();
                if (data?.session) {
                  currentSessionRef.current = data.session;
                  if (onSessionSyncedRef.current) {
                    onSessionSyncedRef.current(data.session);
                  }
                } else if (msg.session.access_token && msg.session.refresh_token) {
                  // If local storage hadn't finished updating, set directly
                  const { data: setRes } = await supabase.auth.setSession({
                    access_token: msg.session.access_token,
                    refresh_token: msg.session.refresh_token,
                  });
                  if (setRes?.session) {
                    currentSessionRef.current = setRes.session;
                    if (onSessionSyncedRef.current) {
                      onSessionSyncedRef.current(setRes.session);
                    }
                  }
                }
              } catch (err) {
                console.warn('[AuthTabSync] Failed to apply remote session update:', err);
              }
            }
          }
          break;
        }

        case 'AUTH_SIGNOUT': {
          setLastSyncTime(msg.timestamp);
          currentSessionRef.current = null;
          if (onSignedOutRef.current) {
            onSignedOutRef.current();
          }
          break;
        }

        case 'AUTH_PING': {
          // Respond with PONG to announce this tab's presence
          postMessage({
            type: 'AUTH_PONG',
            tabId,
            timestamp: Date.now(),
            session: currentSessionRef.current
              ? {
                  access_token: currentSessionRef.current.access_token,
                  refresh_token: currentSessionRef.current.refresh_token,
                  expires_at: currentSessionRef.current.expires_at,
                  user: {
                    id: currentSessionRef.current.user.id,
                    email: currentSessionRef.current.user.email,
                  },
                }
              : null,
          });
          break;
        }

        case 'AUTH_PONG': {
          // Active tab discovered
          if (msg.session && !currentSessionRef.current) {
            // New tab discovered an existing valid session in an active sibling tab!
            try {
              const { data } = await supabase.auth.getSession();
              if (data?.session) {
                currentSessionRef.current = data.session;
                if (onSessionSyncedRef.current) {
                  onSessionSyncedRef.current(data.session);
                }
              }
            } catch {
              // Ignore
            }
          }
          break;
        }

        case 'AUTH_REFRESH_STARTED': {
          isRefreshingRef.current = true;
          break;
        }

        case 'AUTH_REFRESH_COMPLETED': {
          isRefreshingRef.current = false;
          // Refresh completed in sibling tab: re-sync local session
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
              currentSessionRef.current = data.session;
              if (onSessionSyncedRef.current) {
                onSessionSyncedRef.current(data.session);
              }
            }
          } catch {
            // Ignore
          }
          break;
        }
      }
    },
    [postMessage, tabId]
  );

  // Setup BroadcastChannel and storage event listeners
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // 1. Initialize BroadcastChannel if available
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        channelRef.current = bc;
        bc.onmessage = (event) => {
          if (event?.data) {
            handleIncomingMessage(event.data);
          }
        };
      } catch (err) {
        console.warn('[AuthTabSync] BroadcastChannel unsupported or failed:', err);
      }
    }

    // 2. Storage event listener (captures events from sibling windows/tabs)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'rm_auth_tab_sync_event' && e.newValue) {
        try {
          const parsed: AuthSyncMessage = JSON.parse(e.newValue);
          handleIncomingMessage(parsed);
        } catch {
          // Ignore parse errors
        }
      }

      // Also listen to Supabase's native auth token key changes
      if (e.key && (e.key.startsWith('sb-') || e.key.includes('auth-token'))) {
        if (!e.newValue && e.oldValue) {
          // Auth token was removed in another tab (sign-out)
          if (currentSessionRef.current) {
            currentSessionRef.current = null;
            if (onSignedOutRef.current) {
              onSignedOutRef.current();
            }
          }
        } else if (e.newValue) {
          // Auth token was written or refreshed in another tab
          syncSessionNow();
        }
      }
    };

    window.addEventListener('storage', handleStorage);

    // 3. Tab Visibility & Focus listener: When user switches back to this tab,
    // ensure the session is still active and up-to-date
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncSessionNow();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    }

    // 4. Initial presence broadcast: Announce new tab and request sibling tab status
    postMessage({
      type: 'AUTH_PING',
      tabId,
      timestamp: Date.now(),
    });

    // 5. Periodic cleanup of inactive tabs from tracking map
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 60000; // 60s inactivity
      let changed = false;
      knownTabsRef.current.forEach((lastSeen, tid) => {
        if (lastSeen < cutoff) {
          knownTabsRef.current.delete(tid);
          changed = true;
        }
      });
      if (changed) {
        setActiveTabsCount(knownTabsRef.current.size + 1);
      }

      // Simple leader determination: lexicographically lowest active tabId
      const allTabIds = [tabId, ...Array.from(knownTabsRef.current.keys())].sort();
      setIsLeader(allTabIds[0] === tabId);
    }, 15000);

    return () => {
      clearInterval(cleanupInterval);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      }
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    };
  }, [enabled, handleIncomingMessage, postMessage, syncSessionNow, tabId]);

  return {
    tabId,
    isLeader,
    activeTabsCount,
    lastSyncTime,
    broadcastSession,
    broadcastSignOut,
    syncSessionNow,
    acquireRefreshLock,
  };
}

// Named alias for convenience
export const useAuthSync = useAuthTabSync;
