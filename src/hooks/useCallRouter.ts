import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { CallQueueItem, CallRegion } from '@/types/voip';
import type {
  AdminReceiver,
  ReceiverStatus,
  RouterConfig,
  RouterLogEntry,
  RouterStats,
  RoutingStrategy,
} from '@/types/callRouter';

// Synthesized distinctive PBX chime for router assignments (880Hz + 660Hz alert)
function playRouterAssignmentChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    // Pleasant dual chime
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(660, now, 0.25);
    playTone(880, now + 0.15, 0.4);
    playTone(1050, now + 0.3, 0.5);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1200);
  } catch (e) {
    console.debug('Unable to play router chime:', e);
  }
}

const DEFAULT_CONFIG: RouterConfig = {
  autoRoutingEnabled: true,
  routingStrategy: 'longest_idle',
  ringTimeoutSeconds: 20,
  soundOnAssignment: true,
  matchRegionFirst: false,
};

const DEFAULT_RECEIVERS: Omit<AdminReceiver, 'isCurrentUser'>[] = [
  {
    id: 'rec-olusola',
    userId: 'admin-olusola-1',
    name: 'Olusola Adebayo (Admin)',
    email: 'adebayoolusola39@gmail.com',
    role: 'admin',
    phone: '+2348012345678',
    status: 'available',
    availableSince: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    lastCallEndedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    totalCallsHandled: 6,
    regionSpecialty: 'All',
    notes: 'Primary Lead Dispatcher',
  },
  {
    id: 'rec-sarah',
    userId: 'admin-sarah-2',
    name: 'Sarah Jenkins',
    email: 'sarah.j@rentmaikar.com',
    role: 'admin_assistant',
    phone: '+14155552671',
    status: 'available',
    availableSince: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    lastCallEndedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    totalCallsHandled: 4,
    regionSpecialty: 'USA',
    notes: 'USA Fleet Inquiries',
  },
  {
    id: 'rec-babajide',
    userId: 'admin-babajide-3',
    name: 'Babajide Cole',
    email: 'b.cole@rentmaikar.com',
    role: 'admin',
    phone: '+2348098765432',
    status: 'available',
    availableSince: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    lastCallEndedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    totalCallsHandled: 8,
    regionSpecialty: 'Nigeria',
    notes: 'Nigeria Operations Specialist',
  },
  {
    id: 'rec-david',
    userId: 'admin-david-4',
    name: 'David Vance',
    email: 'david.v@rentmaikar.com',
    role: 'iot_support',
    phone: '+14155558832',
    status: 'busy',
    availableSince: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    lastCallEndedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    totalCallsHandled: 3,
    regionSpecialty: 'All',
    notes: 'IoT Device Diagnostics',
  },
];

export function useCallRouter(
  queueItems: CallQueueItem[],
  onAnswerCall?: (item: CallQueueItem) => Promise<void>
) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Router configuration
  const [config, setConfig] = useState<RouterConfig>(() => {
    try {
      const stored = localStorage.getItem('rentmaikar:call-router-config');
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch {}
    return DEFAULT_CONFIG;
  });

  // Admin receivers state
  const [receivers, setReceivers] = useState<AdminReceiver[]>(() => {
    try {
      const stored = localStorage.getItem('rentmaikar:call-router-receivers');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return DEFAULT_RECEIVERS.map((r) => ({
      ...r,
      isCurrentUser: user ? r.email.toLowerCase() === user.email?.toLowerCase() : false,
    }));
  });

  // Activity logs
  const [logs, setLogs] = useState<RouterLogEntry[]>(() => {
    try {
      const stored = localStorage.getItem('rentmaikar:call-router-logs');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return [
      {
        id: 'log-seed-1',
        timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
        callId: 'call-prev-1',
        callerName: 'Michael Adeyemi',
        callerRegion: 'Nigeria',
        receiverId: 'rec-olusola',
        receiverName: 'Olusola Adebayo (Admin)',
        action: 'accepted',
        details: 'FIFO Call #1 routed to next available receiver (Idle 15m)',
      },
      {
        id: 'log-seed-2',
        timestamp: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
        callId: 'call-prev-2',
        callerName: 'Emily Carter',
        callerRegion: 'USA',
        receiverId: 'rec-sarah',
        receiverName: 'Sarah Jenkins',
        action: 'accepted',
        details: 'Routed on first-in-first-out basis (Wait time: 00:42)',
      },
    ];
  });

  // Current ringing call targeted at THIS user
  const [incomingRoutedCall, setIncomingRoutedCall] = useState<{
    call: CallQueueItem;
    assignedAt: number;
    timeoutSeconds: number;
    timeoutTimerId?: number;
  } | null>(null);

  // Seconds remaining for current assigned ring
  const [ringCountdown, setRingCountdown] = useState<number>(0);

  // Active in-flight routing lock to avoid race conditions
  const routingLockRef = useRef<boolean>(false);
  const roundRobinIndexRef = useRef<number>(0);

  // Save config to storage
  const updateConfig = useCallback((patch: Partial<RouterConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem('rentmaikar:call-router-config', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Save receivers to storage
  const persistReceivers = useCallback((updated: AdminReceiver[]) => {
    setReceivers(updated);
    try {
      localStorage.setItem('rentmaikar:call-router-receivers', JSON.stringify(updated));
    } catch {}
  }, []);

  // Log action
  const addLog = useCallback(
    (entry: Omit<RouterLogEntry, 'id' | 'timestamp'>) => {
      const newEntry: RouterLogEntry = {
        ...entry,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
      };
      setLogs((prev) => {
        const next = [newEntry, ...prev].slice(0, 50);
        try {
          localStorage.setItem('rentmaikar:call-router-logs', JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    []
  );

  // Synchronize current user into receivers list
  useEffect(() => {
    if (!user) return;
    setReceivers((prev) => {
      const userEmail = (user.email || '').toLowerCase();
      const existingIdx = prev.findIndex(
        (r) => r.userId === user.id || r.email.toLowerCase() === userEmail
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          userId: user.id,
          isCurrentUser: true,
          name: updated[existingIdx].name || user.user_metadata?.full_name || 'Current Admin',
        };
        return updated;
      }

      // Add current user as receiver
      const newReceiver: AdminReceiver = {
        id: `rec-${user.id.slice(0, 8)}`,
        userId: user.id,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin Operator',
        email: user.email || '',
        role: 'admin',
        status: 'available',
        availableSince: new Date().toISOString(),
        lastCallEndedAt: null,
        totalCallsHandled: 0,
        regionSpecialty: 'All',
        isCurrentUser: true,
      };
      return [newReceiver, ...prev];
    });
  }, [user]);

  // Load real admins from Supabase profiles / user_roles if available
  useEffect(() => {
    const fetchAdminProfiles = async () => {
      try {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('role', ['admin', 'admin_assistant', 'legal_support', 'iot_support', 'vehicle_support']);

        if (!roles || roles.length === 0) return;

        const userIds = roles.map((r) => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .in('user_id', userIds);

        if (!profiles || profiles.length === 0) return;

        setReceivers((prev) => {
          const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));
          const currentEmail = (user?.email || '').toLowerCase();

          const fetchedReceivers: AdminReceiver[] = profiles.map((p) => {
            const existing = prev.find((r) => r.userId === p.user_id);
            const isMe = p.user_id === user?.id || (p.email && p.email.toLowerCase() === currentEmail);
            return {
              id: existing?.id || `rec-${p.user_id.slice(0, 8)}`,
              userId: p.user_id,
              name: p.full_name || p.email?.split('@')[0] || 'Admin',
              email: p.email || '',
              role: roleMap.get(p.user_id) || 'admin',
              phone: p.phone || undefined,
              status: existing ? existing.status : 'available',
              availableSince: existing?.availableSince || new Date().toISOString(),
              lastCallEndedAt: existing?.lastCallEndedAt || null,
              totalCallsHandled: existing?.totalCallsHandled || 0,
              regionSpecialty: existing?.regionSpecialty || 'All',
              isCurrentUser: !!isMe,
              notes: existing?.notes,
            };
          });

          // Keep any local seed admins if database has fewer
          const merged = [...fetchedReceivers];
          for (const local of prev) {
            if (!merged.some((m) => m.userId === local.userId || m.email === local.email)) {
              merged.push(local);
            }
          }
          return merged;
        });
      } catch (err) {
        console.debug('Using cached/seeded admin receivers:', err);
      }
    };

    fetchAdminProfiles();
  }, [user]);

  // Current user's receiver record
  const currentUserReceiver = receivers.find((r) => r.isCurrentUser) || receivers[0];

  // Change current user's receiver status
  const setCurrentUserStatus = useCallback(
    (newStatus: ReceiverStatus) => {
      setReceivers((prev) => {
        const updated = prev.map((r) => {
          if (r.isCurrentUser) {
            const statusChanged = r.status !== newStatus;
            return {
              ...r,
              status: newStatus,
              availableSince:
                newStatus === 'available' && statusChanged ? new Date().toISOString() : r.availableSince,
            };
          }
          return r;
        });
        persistReceivers(updated);
        return updated;
      });

      addLog({
        callId: 'status-change',
        callerName: 'System',
        callerRegion: 'USA',
        receiverId: currentUserReceiver?.id || 'me',
        receiverName: currentUserReceiver?.name || 'Current Admin',
        action: 'accepted',
        details: `Operator status changed to ${newStatus.toUpperCase()}`,
      });

      toast({
        title: `Status: ${newStatus.toUpperCase()}`,
        description:
          newStatus === 'available'
            ? 'You are now available in the incoming call receiver pool.'
            : `Receiver status set to ${newStatus}. Incoming calls will route to other available admins.`,
      });
    },
    [currentUserReceiver, persistReceivers, addLog, toast]
  );

  // Update specific receiver's status (admin supervisor override)
  const updateReceiverStatus = useCallback(
    (receiverId: string, status: ReceiverStatus) => {
      setReceivers((prev) => {
        const updated = prev.map((r) => {
          if (r.id === receiverId) {
            const statusChanged = r.status !== status;
            return {
              ...r,
              status,
              availableSince:
                status === 'available' && statusChanged ? new Date().toISOString() : r.availableSince,
            };
          }
          return r;
        });
        persistReceivers(updated);
        return updated;
      });
    },
    [persistReceivers]
  );

  // Determine "Next Available Receiver" according to configured ACD algorithm
  const getNextAvailableReceiver = useCallback(
    (callItem?: CallQueueItem): AdminReceiver | null => {
      let eligible = receivers.filter((r) => r.status === 'available');

      if (eligible.length === 0) return null;

      // Optional regional skill matching
      if (config.matchRegionFirst && callItem?.region) {
        const regionalMatch = eligible.filter(
          (r) => r.regionSpecialty === 'All' || r.regionSpecialty === callItem.region
        );
        if (regionalMatch.length > 0) {
          eligible = regionalMatch;
        }
      }

      // 1. Longest Idle Strategy (Standard Next Available)
      if (config.routingStrategy === 'longest_idle') {
        // Sort by availableSince ascending (earliest available = longest waiting)
        const sorted = [...eligible].sort((a, b) => {
          const timeA = new Date(a.availableSince || 0).getTime();
          const timeB = new Date(b.availableSince || 0).getTime();
          if (timeA !== timeB) return timeA - timeB;
          // Tie-break by lastCallEndedAt
          const lastA = a.lastCallEndedAt ? new Date(a.lastCallEndedAt).getTime() : 0;
          const lastB = b.lastCallEndedAt ? new Date(b.lastCallEndedAt).getTime() : 0;
          return lastA - lastB;
        });
        return sorted[0];
      }

      // 2. Round-Robin Distribution
      if (config.routingStrategy === 'round_robin') {
        const idx = roundRobinIndexRef.current % eligible.length;
        roundRobinIndexRef.current = (roundRobinIndexRef.current + 1) % eligible.length;
        return eligible[idx];
      }

      // 3. Fewest Calls Handled (Load Balancing)
      if (config.routingStrategy === 'fewest_calls') {
        const sorted = [...eligible].sort((a, b) => a.totalCallsHandled - b.totalCallsHandled);
        return sorted[0];
      }

      return eligible[0];
    },
    [receivers, config]
  );

  // Route a specific call to an admin receiver
  const dispatchCall = useCallback(
    async (call: CallQueueItem, receiver: AdminReceiver, isAutomatic = false) => {
      if (routingLockRef.current) return;
      routingLockRef.current = true;

      try {
        // Mark receiver as temporarily assigned / ringing
        setReceivers((prev) => {
          const updated = prev.map((r) => (r.id === receiver.id ? { ...r, assignedQueuedCallId: call.id } : r));
          persistReceivers(updated);
          return updated;
        });

        // Add to audit logs
        addLog({
          callId: call.id,
          callerName: call.callerName,
          callerPhone: call.callerPhone,
          callerRegion: call.region,
          receiverId: receiver.id,
          receiverName: receiver.name,
          action: 'routed',
          details: `${isAutomatic ? 'Auto-routed (FIFO)' : 'Manually dispatched'} to ${receiver.name} (${
            config.routingStrategy === 'longest_idle'
              ? 'Next Available / Longest Idle'
              : config.routingStrategy
          })`,
        });

        // If target receiver is the current user on this browser session
        if (receiver.isCurrentUser) {
          if (config.soundOnAssignment) {
            playRouterAssignmentChime();
          }

          setRingCountdown(config.ringTimeoutSeconds);
          setIncomingRoutedCall({
            call,
            assignedAt: Date.now(),
            timeoutSeconds: config.ringTimeoutSeconds,
          });

          toast({
            title: `📞 Incoming Routed Call (FIFO #1)`,
            description: `${call.callerName} (${call.region}) is ringing on your line.`,
          });
        } else {
          toast({
            title: `Call Routed to ${receiver.name}`,
            description: `FIFO Call from ${call.callerName} assigned on next-available basis.`,
          });
        }
      } finally {
        routingLockRef.current = false;
      }
    },
    [config, persistReceivers, addLog, toast]
  );

  // Route the next First In First Out (FIFO) call in line
  const routeNextFifoCall = useCallback(() => {
    // Filter waiting calls (strict FIFO order is already preserved by useCallQueue: sorted by createdAt ascending)
    const waitingCalls = queueItems.filter((i) => i.status === 'waiting');
    if (waitingCalls.length === 0) {
      toast({
        title: 'Queue is Empty',
        description: 'There are no waiting incoming calls to route.',
      });
      return;
    }

    const nextCall = waitingCalls[0];
    const nextReceiver = getNextAvailableReceiver(nextCall);

    if (!nextReceiver) {
      toast({
        variant: 'destructive',
        title: 'No Available Receivers',
        description: 'All admin receivers are currently busy, in call, or offline.',
      });
      return;
    }

    dispatchCall(nextCall, nextReceiver, false);
  }, [queueItems, getNextAvailableReceiver, dispatchCall, toast]);

  // Answer incoming routed call
  const acceptRoutedCall = useCallback(
    async (call: CallQueueItem) => {
      // Clear ringing state
      setIncomingRoutedCall(null);
      setRingCountdown(0);

      // Mark receiver as in-call and increment calls handled
      setReceivers((prev) => {
        const updated = prev.map((r) => {
          if (r.isCurrentUser) {
            return {
              ...r,
              status: 'in_call' as ReceiverStatus,
              currentCallId: call.id,
              assignedQueuedCallId: null,
              totalCallsHandled: r.totalCallsHandled + 1,
            };
          }
          return r;
        });
        persistReceivers(updated);
        return updated;
      });

      addLog({
        callId: call.id,
        callerName: call.callerName,
        callerPhone: call.callerPhone,
        callerRegion: call.region,
        receiverId: currentUserReceiver?.id || 'me',
        receiverName: currentUserReceiver?.name || 'Current Admin',
        action: 'accepted',
        details: 'Call answered by admin receiver — connected audio session',
      });

      if (onAnswerCall) {
        await onAnswerCall(call);
      }
    },
    [currentUserReceiver, persistReceivers, addLog, onAnswerCall]
  );

  // Decline or Failover to next available receiver
  const declineRoutedCall = useCallback(
    (call: CallQueueItem, reason = 'Operator passed call') => {
      setIncomingRoutedCall(null);
      setRingCountdown(0);

      // Rotate current user to wrap-up or back of line
      setReceivers((prev) => {
        const updated = prev.map((r) => {
          if (r.isCurrentUser) {
            return {
              ...r,
              assignedQueuedCallId: null,
              availableSince: new Date().toISOString(), // resets idle time
            };
          }
          return r;
        });
        persistReceivers(updated);
        return updated;
      });

      addLog({
        callId: call.id,
        callerName: call.callerName,
        callerPhone: call.callerPhone,
        callerRegion: call.region,
        receiverId: currentUserReceiver?.id || 'me',
        receiverName: currentUserReceiver?.name || 'Current Admin',
        action: 'rejected',
        details: reason,
      });

      toast({
        title: 'Call Passed',
        description: 'Re-routing call to next available receiver in queue.',
      });

      // Find NEXT receiver (excluding current user)
      const otherEligible = receivers.filter(
        (r) => r.status === 'available' && !r.isCurrentUser
      );

      if (otherEligible.length > 0) {
        const nextInLine = otherEligible[0];
        dispatchCall(call, nextInLine, true);
      }
    },
    [currentUserReceiver, receivers, persistReceivers, addLog, toast, dispatchCall]
  );

  // Ring timeout countdown timer effect
  useEffect(() => {
    if (!incomingRoutedCall) return;

    const timer = setInterval(() => {
      setRingCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Timed out! Automatically re-route to next available receiver
          if (incomingRoutedCall) {
            declineRoutedCall(
              incomingRoutedCall.call,
              `Ring timeout (${incomingRoutedCall.timeoutSeconds}s) - automatically failed over to next available receiver`
            );
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [incomingRoutedCall, declineRoutedCall]);

  // Automated Call Router Engine Loop
  useEffect(() => {
    if (!config.autoRoutingEnabled) return;

    const interval = setInterval(() => {
      // Find oldest waiting call (FIFO #1)
      const waitingCalls = queueItems.filter(
        (i) => i.status === 'waiting' && !receivers.some((r) => r.assignedQueuedCallId === i.id)
      );

      if (waitingCalls.length === 0) return;

      const oldestCall = waitingCalls[0]; // Strict FIFO: earliest createdAt
      const nextReceiver = getNextAvailableReceiver(oldestCall);

      if (nextReceiver && !nextReceiver.assignedQueuedCallId) {
        dispatchCall(oldestCall, nextReceiver, true);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [config.autoRoutingEnabled, queueItems, receivers, getNextAvailableReceiver, dispatchCall]);

  // Calculate Router statistics
  const stats: RouterStats = {
    totalRoutedToday: logs.filter(
      (l) =>
        ['routed', 'accepted'].includes(l.action) &&
        new Date(l.timestamp).toDateString() === new Date().toDateString()
    ).length,
    activeRingingCount: receivers.filter((r) => r.assignedQueuedCallId).length,
    availableReceiversCount: receivers.filter((r) => r.status === 'available').length,
    busyReceiversCount: receivers.filter((r) => ['busy', 'in_call', 'wrap_up'].includes(r.status))
      .length,
    offlineReceiversCount: receivers.filter((r) => r.status === 'offline').length,
    averageRoutingTimeSeconds: 4,
  };

  // Who is currently next in line to receive the next call
  const nextInLineReceiver = getNextAvailableReceiver(queueItems[0]);

  return {
    config,
    updateConfig,
    receivers,
    currentUserReceiver,
    setCurrentUserStatus,
    updateReceiverStatus,
    getNextAvailableReceiver,
    nextInLineReceiver,
    routeNextFifoCall,
    dispatchCall,
    acceptRoutedCall,
    declineRoutedCall,
    incomingRoutedCall,
    ringCountdown,
    logs,
    stats,
  };
}
