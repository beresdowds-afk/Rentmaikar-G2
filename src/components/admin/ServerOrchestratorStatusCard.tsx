import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, ServerCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface RunRow {
  id: string;
  source: string;
  provider: string | null;
  devices_seen: number;
  events_processed: number;
  analytics_emitted: number;
  broker_reachable: boolean;
  degraded_reason: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface StateRow {
  vehicle_id: string;
  speed: number | null;
  ignition: boolean | null;
  battery: number | null;
  last_source: string | null;
  last_event_at: string | null;
  updated_at: string;
}

export function ServerOrchestratorStatusCard() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [states, setStates] = useState<StateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: runData }, { data: stateData }] = await Promise.all([
      supabase
        .from('telemetry_ingest_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('vehicle_telemetry_state')
        .select('vehicle_id, speed, ignition, battery, last_source, last_event_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(8),
    ]);
    setRuns((runData as RunRow[]) ?? []);
    setStates((stateData as StateRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('server-orchestrator-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicle_telemetry_state' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const last = runs[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ServerCog className="h-5 w-5" />
            Server-side orchestrator
          </CardTitle>
          <CardDescription>
            Telemetry is reduced, scored and stored by the backend every minute — no browser tab
            required.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={last?.broker_reachable ? 'default' : 'secondary'}>
            {last?.broker_reachable ? 'Ingestion worker healthy' : 'Worker degraded'}
          </Badge>
          {last && (
            <Badge variant="outline">
              last run {formatDistanceToNow(new Date(last.created_at), { addSuffix: true })}
            </Badge>
          )}
          {last?.degraded_reason && (
            <Badge variant="outline" className="font-mono">
              {last.degraded_reason}
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Recent ingestion runs</p>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                >
                  <span className="font-mono">{r.source}</span>
                  <span className="text-muted-foreground">
                    {r.devices_seen} devices · {r.events_processed} events · {r.analytics_emitted}{' '}
                    analytics
                  </span>
                  <span className="text-muted-foreground">
                    {r.duration_ms ?? 0}ms ·{' '}
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Latest vehicle state</p>
          {states.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicle state stored yet.</p>
          ) : (
            <div className="space-y-1">
              {states.map((s) => (
                <div
                  key={s.vehicle_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                >
                  <span className="font-mono">{s.vehicle_id.slice(0, 8)}…</span>
                  <span className="text-muted-foreground">
                    {s.speed ?? '—'} km/h · ignition {s.ignition ? 'on' : 'off'} · battery{' '}
                    {s.battery ?? '—'}
                  </span>
                  <span className="text-muted-foreground">
                    {s.last_source ?? '—'} ·{' '}
                    {formatDistanceToNow(new Date(s.last_event_at ?? s.updated_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ServerOrchestratorStatusCard;
