import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Activity,
  AlertTriangle,
  Loader2,
  Network,
  RefreshCw,
  Radio,
  Users,
  Hash,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Metric {
  key: string;
  label: string;
  icon: typeof Users;
  hint: string;
}

const LIVE_METRICS: Metric[] = [
  { key: 'connections.count', label: 'Connections', icon: Network, hint: 'Live TCP/TLS client connections' },
  { key: 'sessions.count', label: 'Sessions', icon: Users, hint: 'Active MQTT sessions (incl. persistent)' },
  { key: 'topics.count', label: 'Topics', icon: Hash, hint: 'Distinct topics routed by the broker' },
  { key: 'subscriptions.count', label: 'Subscriptions', icon: Radio, hint: 'Active topic subscriptions' },
];

const PEAKS: { key: string; label: string }[] = [
  { key: 'connections.max', label: 'Peak connections' },
  { key: 'sessions.max', label: 'Peak sessions' },
  { key: 'topics.max', label: 'Peak topics' },
  { key: 'subscriptions.max', label: 'Peak subscriptions' },
];

interface State {
  loading: boolean;
  stats: Record<string, number> | null;
  metrics: Record<string, number> | null;
  unavailable: { reason: string; hint: string } | null;
  derivedNote: string | null;
  config: Record<string, unknown> | null;
  updatedAt: Date | null;
}

const POLL_MS = 10000;

export function EmqxLiveMetricsPanel() {
  const [state, setState] = useState<State>({
    loading: true,
    stats: null,
    metrics: null,
    unavailable: null,
    derivedNote: null,
    config: null,
    updatedAt: null,
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const { data, error } = await supabase.functions.invoke('emqx-monitoring', {
        body: { action: 'stats' },
      });
      if (error) throw new Error(error.message);
      if (data?.unavailable) {
        setState({
          loading: false,
          stats: null,
          metrics: null,
          config: data.config ?? null,
          unavailable: { reason: data.reason, hint: data.hint },
          derivedNote: null,
          updatedAt: new Date(),
        });
        return;
      }
      const rawStats = data?.data?.stats;
      const stats = Array.isArray(rawStats) ? rawStats[0] : rawStats;
      const rawMetrics = data?.data?.metrics;
      const metrics = Array.isArray(rawMetrics) ? rawMetrics[0] : rawMetrics;
      setState({
        loading: false,
        stats: stats ?? null,
        metrics: metrics ?? null,
        unavailable: null,
        derivedNote: data?.data?.derived ? (data.data.derivedNote as string) : null,
        config: data?.config ?? null,
        updatedAt: new Date(),
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        unavailable: { reason: 'request_failed', hint: (e as Error).message },
        updatedAt: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = window.setInterval(load, POLL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [autoRefresh, load]);

  const fmt = (v: number | undefined | null) =>
    typeof v === 'number' ? v.toLocaleString() : '—';

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live broker metrics
          </CardTitle>
          <CardDescription>
            Polled every {POLL_MS / 1000}s from the configured EMQX management endpoint.
            {state.updatedAt && !state.unavailable
              ? ` Updated ${state.updatedAt.toLocaleTimeString()}.`
              : ''}
          </CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="emqx-auto" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="emqx-auto" className="text-xs text-muted-foreground">
              Auto
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={state.loading}>
            <RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.loading && !state.stats && !state.unavailable ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading broker metrics…
          </div>
        ) : state.unavailable ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Live metrics unavailable</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{state.unavailable.hint}</p>
              <p className="text-xs text-muted-foreground">
                Reason code: <span className="font-mono">{state.unavailable.reason}</span>. Device
                telemetry, ingestion and commands are unaffected.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {state.derivedNote && (
              <p className="text-xs text-muted-foreground">{state.derivedNote}</p>
            )}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

              {LIVE_METRICS.map((m) => {
                const Icon = m.icon;
                return (
                  <div key={m.key} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {m.label}
                    </div>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {fmt(state.stats?.[m.key])}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{m.hint}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {PEAKS.map((p) => (
                <div key={p.key} className="rounded-md border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">{p.label}</p>
                  <p className="text-sm font-medium tabular-nums">{fmt(state.stats?.[p.key])}</p>
                </div>
              ))}
            </div>

            {state.metrics && (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-md border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Messages received</p>
                  <p className="text-sm font-medium tabular-nums">
                    {fmt(state.metrics['messages.received'])}
                  </p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Messages sent</p>
                  <p className="text-sm font-medium tabular-nums">
                    {fmt(state.metrics['messages.sent'])}
                  </p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Messages dropped</p>
                  <p className="text-sm font-medium tabular-nums">
                    {fmt(state.metrics['messages.dropped'])}
                  </p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Packets published</p>
                  <p className="text-sm font-medium tabular-nums">
                    {fmt(state.metrics['packets.publish.received'])}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {state.config && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">endpoint: {String(state.config.api_url)}</Badge>
            <Badge variant="outline">
              management: {state.config.management_enabled ? 'enabled' : 'disabled'}
            </Badge>
            <Badge variant="outline">config: {String(state.config.config_source)}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EmqxLiveMetricsPanel;
