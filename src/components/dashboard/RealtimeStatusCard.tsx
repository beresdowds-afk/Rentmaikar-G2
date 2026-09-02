import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type ConnState = 'connecting' | 'live' | 'degraded' | 'offline';

interface Props {
  /** Tables to watch for live updates. */
  tables?: string[];
  userId?: string | null;
}

const LABEL: Record<ConnState, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  degraded: 'Reconnecting',
  offline: 'Offline',
};

/**
 * Shows the driver's realtime subscription health so it is obvious when live
 * updates drop and when they recover (e.g. after an EMQX credential rotation).
 */
export function RealtimeStatusCard({
  tables = ['mqtt_telemetry_logs', 'payments', 'training_completions'],
  userId,
}: Props) {
  const [state, setState] = useState<ConnState>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [reconnects, setReconnects] = useState(0);
  const [nonce, setNonce] = useState(0);
  const startedAt = useRef<Date>(new Date());
  const tableKey = useMemo(() => tables.join(','), [tables]);

  useEffect(() => {
    startedAt.current = new Date();
    setState('connecting');
    const channel = supabase.channel(`driver-live-status-${userId ?? 'anon'}-${nonce}`);

    tableKey.split(',').forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        setLastEventAt(new Date());
        setEventCount((c) => c + 1);
      });
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') setState('live');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setState('degraded');
        setReconnects((r) => r + 1);
      } else if (status === 'CLOSED') setState('offline');
    });

    return () => { supabase.removeChannel(channel); };
  }, [tableKey, userId, nonce]);

  const badgeVariant = state === 'live' ? 'default' : state === 'offline' ? 'destructive' : 'secondary';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className={`h-4 w-4 ${state === 'live' ? 'text-primary' : 'text-muted-foreground'}`} />
              Live updates
            </CardTitle>
            <CardDescription>Realtime connection to your rental, payment and telemetry feeds.</CardDescription>
          </div>
          <Badge variant={badgeVariant} className="flex items-center gap-1">
            {state === 'live' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {LABEL[state]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md border p-2">
            <p className="text-lg font-semibold">{eventCount}</p>
            <p className="text-[11px] text-muted-foreground">events received</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-lg font-semibold">
              {lastEventAt ? `${Math.max(0, Math.round((Date.now() - lastEventAt.getTime()) / 1000))}s` : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground">since last update</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-lg font-semibold">{reconnects}</p>
            <p className="text-[11px] text-muted-foreground">reconnects</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Connected since {startedAt.current.toLocaleTimeString()}
          </p>
          <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Reconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default RealtimeStatusCard;
