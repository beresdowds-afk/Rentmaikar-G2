import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type QueueSource = 'live_inbound' | 'voice_app' | 'callback';
export type QueueRegion = 'USA' | 'Nigeria';

export interface QueuedCall {
  id: string;
  /** Underlying row id used by accept/reject actions. */
  recordId: string;
  source: QueueSource;
  region: QueueRegion;
  displayName: string;
  phoneNumber: string | null;
  reason: string | null;
  /** ISO timestamp the caller entered the queue — drives FIFO ordering. */
  queuedAt: string;
  isUrgent: boolean;
  isSimulated?: boolean;
}

const POLL_INTERVAL_MS = 15_000;
const URGENT_AFTER_MS = 3 * 60 * 1000;

const normalizeRegion = (value: string | null | undefined): QueueRegion =>
  (value || '').toLowerCase().startsWith('nig') || value === 'NG' ? 'Nigeria' : 'USA';

/** Dual-tone (440Hz + 480Hz) PBX-style ring chime rendered with the Web Audio API. */
const playChime = () => {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.1);
    gain.connect(ctx.destination);

    [440, 480].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 1.15);
    });

    window.setTimeout(() => void ctx.close().catch(() => undefined), 1500);
  } catch {
    /* audio is best-effort only */
  }
};

export const useCallQueue = () => {
  const [rows, setRows] = useState<QueuedCall[]>([]);
  const [simulated, setSimulated] = useState<QueuedCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const knownIds = useRef<Set<string>>(new Set());
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const fetchQueue = useCallback(async () => {
    try {
      const [inbound, requests] = await Promise.all([
        supabase
          .from('voip_calls')
          .select('id, region, status, direction, call_type, caller_role, created_at')
          .eq('direction', 'inbound')
          .eq('status', 'ringing')
          .order('created_at', { ascending: true })
          .limit(50),
        supabase
          .from('voice_call_requests')
          .select('id, region, status, reason, requester_id, requester_role, target_role, created_at')
          .in('status', ['pending', 'escalated'])
          .order('created_at', { ascending: true })
          .limit(50),
      ]);

      const inboundRows = inbound.data ?? [];
      const requestRows = requests.data ?? [];

      // Resolve caller identity for live inbound calls and in-app requests.
      const callIds = inboundRows.map((c) => c.id);
      const participantsByCall = new Map<string, { display_name: string | null; phone_number: string }>();
      if (callIds.length) {
        const { data: participants } = await supabase
          .from('voip_call_participants')
          .select('call_id, display_name, phone_number')
          .in('call_id', callIds);
        (participants ?? []).forEach((p) => {
          if (!participantsByCall.has(p.call_id)) participantsByCall.set(p.call_id, p);
        });
      }

      const requesterIds = Array.from(new Set(requestRows.map((r) => r.requester_id).filter(Boolean))) as string[];
      const profileById = new Map<string, { full_name: string | null; phone: string | null }>();
      if (requesterIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, phone')
          .in('user_id', requesterIds);
        (profiles ?? []).forEach((p) => profileById.set(p.user_id, { full_name: p.full_name, phone: p.phone }));
      }

      const mapped: QueuedCall[] = [
        ...inboundRows.map((call) => {
          const participant = participantsByCall.get(call.id);
          return {
            id: `voip:${call.id}`,
            recordId: call.id,
            source: 'live_inbound' as QueueSource,
            region: normalizeRegion(call.region),
            displayName: participant?.display_name || participant?.phone_number || 'Unknown caller',
            phoneNumber: participant?.phone_number ?? null,
            reason: call.call_type ? `Inbound ${call.call_type}` : 'Inbound call',
            queuedAt: call.created_at,
            isUrgent: Date.now() - new Date(call.created_at).getTime() > URGENT_AFTER_MS,
          };
        }),
        ...requestRows.map((req) => {
          const profile = req.requester_id ? profileById.get(req.requester_id) : undefined;
          const isCallback = (req.reason || '').toLowerCase().includes('callback');
          return {
            id: `req:${req.id}`,
            recordId: req.id,
            source: (isCallback ? 'callback' : 'voice_app') as QueueSource,
            region: normalizeRegion(req.region),
            displayName: profile?.full_name || `${req.requester_role || 'User'} request`,
            phoneNumber: profile?.phone ?? null,
            reason: req.reason,
            queuedAt: req.created_at,
            isUrgent:
              req.status === 'escalated' ||
              Date.now() - new Date(req.created_at).getTime() > URGENT_AFTER_MS,
          };
        }),
      ];

      // Chime for genuinely new arrivals only.
      const incomingIds = new Set(mapped.map((m) => m.id));
      const hasNew = mapped.some((m) => !knownIds.current.has(m.id));
      knownIds.current = incomingIds;
      if (hasNew && soundRef.current) playChime();

      setRows(mapped);
    } catch (error) {
      console.error('Error loading call queue:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
    const poll = window.setInterval(() => void fetchQueue(), POLL_INTERVAL_MS);
    return () => window.clearInterval(poll);
  }, [fetchQueue]);

  // Realtime listeners with the polling loop above as fallback.
  useEffect(() => {
    const channel = supabase
      .channel('call_queue_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voip_calls' }, () => void fetchQueue())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_call_requests' }, () => void fetchQueue())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchQueue]);

  // Ticking clock for live wait timers.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const queue = useMemo(
    () =>
      [...rows, ...simulated].sort(
        (a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime(),
      ),
    [rows, simulated],
  );

  const waitMs = useCallback((call: QueuedCall) => Math.max(0, now - new Date(call.queuedAt).getTime()), [now]);

  const metrics = useMemo(() => {
    const waits = queue.map((c) => Math.max(0, now - new Date(c.queuedAt).getTime()));
    return {
      waiting: queue.length,
      urgent: queue.filter((c) => c.isUrgent || now - new Date(c.queuedAt).getTime() > URGENT_AFTER_MS).length,
      longestWaitMs: waits.length ? Math.max(...waits) : 0,
      averageWaitMs: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
      usa: queue.filter((c) => c.region === 'USA').length,
      nigeria: queue.filter((c) => c.region === 'Nigeria').length,
    };
  }, [queue, now]);

  /** FIFO router: the caller who has waited longest is always routed next. */
  const nextInLine = queue[0] ?? null;

  const simulateInbound = useCallback((region: QueueRegion, persona: string) => {
    const id = `sim:${crypto.randomUUID()}`;
    setSimulated((prev) => [
      ...prev,
      {
        id,
        recordId: id,
        source: 'live_inbound',
        region,
        displayName: `${persona} (simulated)`,
        phoneNumber: region === 'Nigeria' ? '+2349163072576' : '+16085489220',
        reason: `Simulated inbound ${persona.toLowerCase()} call`,
        queuedAt: new Date().toISOString(),
        isUrgent: false,
        isSimulated: true,
      },
    ]);
    if (soundRef.current) playChime();
  }, []);

  const removeSimulated = useCallback((id: string) => {
    setSimulated((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    queue,
    metrics,
    nextInLine,
    isLoading,
    soundEnabled,
    setSoundEnabled,
    waitMs,
    refresh: fetchQueue,
    simulateInbound,
    removeSimulated,
    playChime,
  };
};
