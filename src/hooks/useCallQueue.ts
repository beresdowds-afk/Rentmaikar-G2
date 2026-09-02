import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { CallQueueItem, CallQueueStats, CallRegion } from '@/types/voip';

interface SimulateCallOptions {
  callerName?: string;
  callerPhone?: string;
  callerRole?: 'driver' | 'owner' | 'customer';
  region?: CallRegion;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  reason?: string;
}

// Web Audio API dual-tone phone chime
function playIncomingRingChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    // Standard telephone cadence: 440Hz + 480Hz
    [440, 480].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Pulse 1
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.35);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);

      // Pulse 2
      gain.gain.setValueAtTime(0, now + 0.5);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.55);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.85);
      gain.gain.linearRampToValueAtTime(0, now + 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.95);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1200);
  } catch (e) {
    console.debug('Audio chime unable to play without gesture:', e);
  }
}

export function useCallQueue() {
  const [items, setItems] = useState<CallQueueItem[]>([]);
  const [simulatedItems, setSimulatedItems] = useState<CallQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('rentmaikar:call-queue-audio-alerts');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const { toast } = useToast();
  const prevCountRef = useRef<number>(0);

  const toggleAudioAlerts = useCallback(() => {
    setAudioAlertsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('rentmaikar:call-queue-audio-alerts', String(next));
      } catch {}
      return next;
    });
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const queueList: CallQueueItem[] = [];

      // 1. Fetch live inbound ringing / pending calls
      const { data: voipCalls } = await supabase
        .from('voip_calls')
        .select('*')
        .eq('direction', 'inbound')
        .in('status', ['pending', 'ringing'])
        .order('created_at', { ascending: true });

      if (voipCalls && voipCalls.length > 0) {
        for (const call of voipCalls) {
          const { data: participants } = await supabase
            .from('voip_call_participants')
            .select('*')
            .eq('call_id', call.id);

          const caller = participants?.find((p) => p.participant_type === 'caller') || participants?.[0];

          queueList.push({
            id: `voip-${call.id}`,
            source: 'inbound_voip',
            rawId: call.id,
            callerName: caller?.display_name || caller?.phone_number || 'Incoming Caller',
            callerPhone: caller?.phone_number,
            callerRole: 'driver',
            region: (call.region as CallRegion) || 'USA',
            reason: 'Live Inbound Audio Call',
            priority: 'urgent',
            status: 'ringing',
            createdAt: call.created_at,
          });
        }
      }

      // 2. Fetch in-app voice call requests
      const { data: voiceReqs } = await supabase
        .from('voice_call_requests')
        .select('*')
        .in('status', ['pending', 'escalated'])
        .order('created_at', { ascending: true });

      if (voiceReqs && voiceReqs.length > 0) {
        for (const req of voiceReqs) {
          let callerName = `${req.requester_role.toUpperCase()} Request`;
          let callerPhone: string | undefined;

          if (req.requester_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, phone, email')
              .eq('user_id', req.requester_id)
              .maybeSingle();

            if (profile?.full_name) callerName = profile.full_name;
            if (profile?.phone) callerPhone = profile.phone;
          }

          queueList.push({
            id: `voice-${req.id}`,
            source: 'voice_request',
            rawId: req.id,
            callerName,
            callerPhone,
            callerRole: req.requester_role || 'driver',
            region: (req.region as CallRegion) || 'USA',
            reason: req.reason || 'Requested in-app voice assistance',
            priority: req.status === 'escalated' ? 'urgent' : 'high',
            status: req.status === 'escalated' ? 'escalated' : 'waiting',
            createdAt: req.created_at,
            targetRole: req.target_role,
          });
        }
      }

      // 3. Fetch phone callback requests
      const { data: callbackReqs } = await supabase
        .from('voip_call_requests')
        .select('*')
        .in('status', ['pending', 'callback_scheduled'])
        .order('created_at', { ascending: true });

      if (callbackReqs && callbackReqs.length > 0) {
        for (const req of callbackReqs) {
          let callerName = req.phone_number;

          if (req.user_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('user_id', req.user_id)
              .maybeSingle();

            if (profile?.full_name) callerName = profile.full_name;
          }

          const priorityMap: Record<string, 'urgent' | 'high' | 'normal' | 'low'> = {
            urgent: 'urgent',
            high: 'high',
            normal: 'normal',
            low: 'low',
          };

          queueList.push({
            id: `callback-${req.id}`,
            source: 'callback_request',
            rawId: req.id,
            callerName,
            callerPhone: req.phone_number,
            callerRole: req.user_type || 'driver',
            region: (req.region as CallRegion) || 'USA',
            reason: req.reason || 'Requested phone callback support',
            priority: priorityMap[req.priority] || 'normal',
            status: req.status === 'callback_scheduled' ? 'waiting' : 'waiting',
            createdAt: req.created_at,
          });
        }
      }

      setItems(queueList);
    } catch (error) {
      console.error('Error fetching call queue:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Combined real items + simulated items, sorted by priority and wait time
  const allQueueItems: CallQueueItem[] = [...items, ...simulatedItems].sort((a, b) => {
    const priorityWeight: Record<string, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };
    const pDiff = (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1);
    if (pDiff !== 0) return pDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Calculate live metrics
  const nowMs = Date.now();
  const waitTimes = allQueueItems.map((item) => Math.max(0, Math.floor((nowMs - new Date(item.createdAt).getTime()) / 1000)));
  const longestWaitSeconds = waitTimes.length > 0 ? Math.max(...waitTimes) : 0;
  const averageWaitSeconds = waitTimes.length > 0 ? Math.round(waitTimes.reduce((acc, v) => acc + v, 0) / waitTimes.length) : 0;

  const queueStats: CallQueueStats = {
    totalWaiting: allQueueItems.length,
    urgentCount: allQueueItems.filter((i) => i.priority === 'urgent' || i.priority === 'high').length,
    averageWaitSeconds,
    longestWaitSeconds,
    usaCount: allQueueItems.filter((i) => i.region === 'USA').length,
    nigeriaCount: allQueueItems.filter((i) => i.region === 'Nigeria').length,
  };

  // Audio alert chime when queue count increases
  useEffect(() => {
    if (allQueueItems.length > prevCountRef.current && prevCountRef.current > 0) {
      if (audioAlertsEnabled) {
        playIncomingRingChime();
      }
    }
    prevCountRef.current = allQueueItems.length;
  }, [allQueueItems.length, audioAlertsEnabled]);

  // Initial load and Realtime subscriptions
  useEffect(() => {
    fetchQueue();

    const channel = supabase
      .channel('call_queue_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voip_calls' }, () => fetchQueue())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_call_requests' }, () => fetchQueue())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voip_call_requests' }, () => fetchQueue())
      .subscribe();

    // Auto-poll fallback every 15 seconds to ensure accurate real-time queue states
    const interval = setInterval(() => {
      fetchQueue();
    }, 15000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchQueue]);

  // Answer call workflow
  const answerCall = async (
    item: CallQueueItem,
    onInitiateOutboundCall?: (
      callType: 'individual',
      region: CallRegion,
      recipients: { phoneNumber: string; displayName?: string; userId?: string }[]
    ) => Promise<any>
  ) => {
    try {
      // If it's a simulated call, remove it and notify
      if (item.id.startsWith('sim-')) {
        setSimulatedItems((prev) => prev.filter((i) => i.id !== item.id));
        toast({
          title: 'Simulated Call Answered',
          description: `Connected to ${item.callerName} (${item.callerPhone || item.region})`,
        });
        if (item.callerPhone && onInitiateOutboundCall) {
          await onInitiateOutboundCall('individual', item.region, [
            { phoneNumber: item.callerPhone, displayName: item.callerName },
          ]);
        }
        return { success: true };
      }

      if (item.source === 'inbound_voip') {
        // Mark call as in-progress
        await supabase
          .from('voip_calls')
          .update({
            status: 'in-progress',
            started_at: new Date().toISOString(),
          })
          .eq('id', item.rawId);

        toast({
          title: 'Call Answered',
          description: `Connected with ${item.callerName}`,
        });
        await fetchQueue();
        return { success: true, callId: item.rawId };
      }

      if (item.source === 'voice_request') {
        const { error } = await supabase.functions.invoke('voice-call-request', {
          body: { action: 'accept', requestId: item.rawId },
        });
        if (error) throw error;

        toast({
          title: 'Voice Request Accepted',
          description: `Call session established with ${item.callerName}`,
        });

        if (item.callerPhone && onInitiateOutboundCall) {
          await onInitiateOutboundCall('individual', item.region, [
            { phoneNumber: item.callerPhone, displayName: item.callerName },
          ]);
        }

        await fetchQueue();
        return { success: true };
      }

      if (item.source === 'callback_request') {
        const { data: { user } } = await supabase.auth.getUser();

        // Update database record to called_back
        await supabase
          .from('voip_call_requests')
          .update({
            status: 'called_back',
            called_back_at: new Date().toISOString(),
            called_back_by: user?.id || null,
          })
          .eq('id', item.rawId);

        toast({
          title: 'Dialing Callback Request',
          description: `Connecting outbound call to ${item.callerName} (${item.callerPhone})...`,
        });

        if (item.callerPhone && onInitiateOutboundCall) {
          await onInitiateOutboundCall('individual', item.region, [
            { phoneNumber: item.callerPhone, displayName: item.callerName },
          ]);
        }

        await fetchQueue();
        return { success: true };
      }
    } catch (error: any) {
      toast({
        title: 'Failed to Answer',
        description: error.message || 'Could not connect to caller',
        variant: 'destructive',
      });
      return { success: false, error };
    }
  };

  // Dismiss / Reject call
  const dismissCall = async (item: CallQueueItem, reason?: string) => {
    try {
      if (item.id.startsWith('sim-')) {
        setSimulatedItems((prev) => prev.filter((i) => i.id !== item.id));
        toast({ title: 'Simulated Call Removed' });
        return;
      }

      if (item.source === 'inbound_voip') {
        await supabase
          .from('voip_calls')
          .update({
            status: 'canceled',
            ended_at: new Date().toISOString(),
          })
          .eq('id', item.rawId);
      } else if (item.source === 'voice_request') {
        await supabase.functions.invoke('voice-call-request', {
          body: { action: 'reject', requestId: item.rawId, reason },
        });
      } else if (item.source === 'callback_request') {
        await supabase
          .from('voip_call_requests')
          .update({
            status: 'canceled',
            admin_notes: reason || 'Dismissed by admin in Call Queue',
          })
          .eq('id', item.rawId);
      }

      toast({
        title: 'Call Removed from Queue',
        description: `Caller ${item.callerName} dismissed.`,
      });
      await fetchQueue();
    } catch (error: any) {
      toast({
        title: 'Error Dismissing Call',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Escalate call priority
  const escalateCall = async (item: CallQueueItem) => {
    try {
      if (item.id.startsWith('sim-')) {
        setSimulatedItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, priority: 'urgent', status: 'escalated' } : i))
        );
        toast({ title: 'Priority Escalated to Urgent' });
        return;
      }

      if (item.source === 'voice_request') {
        await supabase.functions.invoke('voice-call-request', {
          body: { action: 'escalate', requestId: item.rawId },
        });
      } else if (item.source === 'callback_request') {
        await supabase
          .from('voip_call_requests')
          .update({ priority: 'urgent' })
          .eq('id', item.rawId);
      } else if (item.source === 'inbound_voip') {
        toast({ title: 'Call Escalated', description: 'Marked as top priority in queue.' });
      }

      toast({
        title: 'Call Escalated',
        description: `${item.callerName} prioritized as Urgent.`,
      });
      await fetchQueue();
    } catch (error: any) {
      toast({
        title: 'Error Escalating Call',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Simulate an incoming call into the queue
  const simulateInboundCall = async (opts?: SimulateCallOptions) => {
    const region: CallRegion = opts?.region || (Math.random() > 0.5 ? 'USA' : 'Nigeria');
    const isUSA = region === 'USA';

    const defaultNames = isUSA
      ? ['Marcus Vance', 'Sarah Jenkins', 'Tyler Brooks', 'David Reynolds', 'Elena Gomez']
      : ['Babajide Adeleke', 'Chioma Okafor', 'Emeka Nnamdi', 'Folake Balogun', 'Tunde Williams'];

    const randomName = defaultNames[Math.floor(Math.random() * defaultNames.length)];
    const callerName = opts?.callerName || randomName;

    const callerPhone =
      opts?.callerPhone ||
      (isUSA
        ? `+1${Math.floor(2000000000 + Math.random() * 8000000000)}`
        : `+234${Math.floor(7000000000 + Math.random() * 2999999999)}`);

    const reasons = [
      'Urgent roadside vehicle assistance needed',
      'Driver inquiring about weekly payout disbursement',
      'Booking pickup delay reported by customer',
      'Vehicle inspection verification question',
      'Toll charge clarification request',
      'GPS tracker intermittent connection issue',
    ];

    const randomReason = reasons[Math.floor(Math.random() * reasons.length)];
    const priority = opts?.priority || (Math.random() > 0.6 ? 'urgent' : 'normal');

    const simulatedItem: CallQueueItem = {
      id: `sim-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      source: Math.random() > 0.5 ? 'inbound_voip' : 'callback_request',
      rawId: `sim-raw-${Date.now()}`,
      callerName,
      callerPhone,
      callerRole: opts?.callerRole || (Math.random() > 0.5 ? 'driver' : 'owner'),
      region,
      reason: opts?.reason || randomReason,
      priority,
      status: priority === 'urgent' ? 'escalated' : 'waiting',
      createdAt: new Date().toISOString(),
    };

    setSimulatedItems((prev) => [simulatedItem, ...prev]);

    if (audioAlertsEnabled) {
      playIncomingRingChime();
    }

    toast({
      title: 'Incoming Call Simulating',
      description: `${simulatedItem.callerName} (${simulatedItem.region}) added to Call Queue.`,
    });
  };

  const clearAllSimulated = () => {
    setSimulatedItems([]);
    toast({ title: 'Simulated Calls Cleared' });
  };

  return {
    queueItems: allQueueItems,
    queueStats,
    isLoading,
    audioAlertsEnabled,
    toggleAudioAlerts,
    answerCall,
    dismissCall,
    escalateCall,
    simulateInboundCall,
    clearAllSimulated,
    refreshQueue: fetchQueue,
  };
}
