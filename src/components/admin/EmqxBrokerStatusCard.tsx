import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Server, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface State {
  loading: boolean;
  stats: Record<string, number> | null;
  unavailable: { reason: string; hint: string } | null;
  config: Record<string, unknown> | null;
}

const METRICS: { key: string; label: string }[] = [
  { key: 'connections.count', label: 'Connections' },
  { key: 'sessions.count', label: 'Sessions' },
  { key: 'subscriptions.count', label: 'Subscriptions' },
  { key: 'topics.count', label: 'Topics' },
];

export function EmqxBrokerStatusCard() {
  const [state, setState] = useState<State>({ loading: true, stats: null, unavailable: null, config: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const { data, error } = await supabase.functions.invoke('emqx-monitoring', { body: { action: 'stats' } });
      if (error) throw new Error(error.message);
      if (data?.unavailable) {
        setState({
          loading: false,
          stats: null,
          config: data.config ?? null,
          unavailable: { reason: data.reason, hint: data.hint },
        });
        return;
      }
      const raw = data?.data?.stats;
      const stats = Array.isArray(raw) ? raw[0] : raw;
      setState({ loading: false, stats: stats ?? null, unavailable: null, config: data?.config ?? null });
    } catch (e) {
      setState({
        loading: false,
        stats: null,
        config: null,
        unavailable: { reason: 'request_failed', hint: (e as Error).message },
      });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Broker live status
          </CardTitle>
          <CardDescription>
            Live figures come from the EMQX management API. Telemetry ingestion is independent of this feed.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={state.loading}>
          <RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking broker…
          </div>
        ) : state.unavailable ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Live broker metrics unavailable</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{state.unavailable.hint}</p>
              <p className="text-xs text-muted-foreground">
                Reason code: <span className="font-mono">{state.unavailable.reason}</span>. Device telemetry,
                immobilisation commands and stored logs are unaffected.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.key} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-xl font-semibold">{state.stats?.[m.key] ?? '—'}</p>
              </div>
            ))}
          </div>
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

export default EmqxBrokerStatusCard;
