import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

/**
 * Registers (or verifies) the Sent.dm webhook endpoint so SMS/WhatsApp
 * delivery receipts arrive in the admin delivery log.
 */
const SentWebhookControl = () => {
  const [busy, setBusy] = useState<null | 'list' | 'ensure'>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const run = async (action: 'list' | 'ensure') => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke('sent-webhook-config', {
        body: { action },
      });
      if (error) throw error;
      setResult(data as Record<string, unknown>);
      if (action === 'ensure') toast.success('Sent.dm status callback configured');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Request failed';
      setResult({ error: message });
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const url = (result?.canonical_url as string) ?? 'https://staging.rentmaikar.com/api/webhooks/sent';

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Status callback: <code className="text-foreground">{url}</code>
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run('list')}>
            {busy === 'list' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Check'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run('ensure')}>
            {busy === 'ensure' ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5 mr-1" />
            )}
            Register callback + secret
          </Button>
        </div>
      </div>
      {result && typeof result.signing_secret_configured === 'boolean' && (
        <p className="mt-2 text-xs">
          Signing secret:{' '}
          <strong className={result.signing_secret_configured ? 'text-foreground' : 'text-destructive'}>
            {result.signing_secret_configured ? 'registered (SENT_WEBHOOK_SECRET)' : 'missing'}
          </strong>
        </p>
      )}
      {result && (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px] text-muted-foreground">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
};


type ProviderKey = 'sent' | 'twilio' | 'termii' | 'resend';

interface ProviderStat {
  provider: ProviderKey;
  label: string;
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
  blocked: number;
}

interface ErrorRow {
  id: string;
  provider: string;
  channel: string;
  event: string;
  message: string;
  created_at: string;
}

const SINCE_HOURS = 24;

const emptyStat = (provider: ProviderKey, label: string): ProviderStat => ({
  provider,
  label,
  sent: 0,
  delivered: 0,
  failed: 0,
  bounced: 0,
  blocked: 0,
});

const useProviderHealth = () => {
  return useQuery({
    queryKey: ['provider-health', SINCE_HOURS],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - SINCE_HOURS * 3600_000).toISOString();

      const [events, emails, bounces, blocks] = await Promise.all([
        supabase
          .from('messaging_events')
          .select('provider, channel, event_type, error_message, error_code, created_at, id')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('email_logs')
          .select('status, error, created_at, id')
          .gte('created_at', since)
          .limit(1000),
        supabase
          .from('email_bounces')
          .select('id, bounce_type, details, bounced_at')
          .gte('bounced_at', since)
          .limit(500),
        supabase
          .from('outbound_decision_log')
          .select('channel, provider, decision, reason, created_at, id')
          .gte('created_at', since)
          .limit(1000),
      ]);

      const stats: Record<ProviderKey, ProviderStat> = {
        sent: emptyStat('sent', 'Sent.dm (Global SMS / WhatsApp / RCS)'),
        twilio: emptyStat('twilio', 'Twilio (SMS / WhatsApp / Voice)'),
        termii: emptyStat('termii', 'Termii (Nigeria SMS)'),
        resend: emptyStat('resend', 'Resend (Email)'),
      };

      const errors: ErrorRow[] = [];

      for (const e of events.data ?? []) {
        const p = (e.provider ?? '').toLowerCase() as ProviderKey;
        if (p in stats) {
          if (e.event_type === 'sent') stats[p].sent += 1;
          if (e.event_type === 'delivered') stats[p].delivered += 1;
          if (e.event_type === 'failed' || e.event_type === 'undelivered') stats[p].failed += 1;
          if (e.event_type === 'bounced') stats[p].bounced += 1;
        }
        if (e.error_message) {
          errors.push({
            id: e.id,
            provider: e.provider ?? 'unknown',
            channel: e.channel ?? '—',
            event: e.event_type ?? 'error',
            message: `${e.error_code ? `[${e.error_code}] ` : ''}${e.error_message}`,
            created_at: e.created_at,
          });
        }
      }

      for (const l of emails.data ?? []) {
        if (l.status === 'sent' || l.status === 'delivered') stats.resend.sent += 1;
        if (l.status === 'failed') {
          stats.resend.failed += 1;
          if (l.error) {
            errors.push({
              id: l.id,
              provider: 'resend',
              channel: 'email',
              event: 'failed',
              message: l.error,
              created_at: l.created_at,
            });
          }
        }
      }

      stats.resend.bounced += (bounces.data ?? []).length;
      for (const b of bounces.data ?? []) {
        errors.push({
          id: b.id,
          provider: 'resend',
          channel: 'email',
          event: `bounce:${b.bounce_type ?? 'unknown'}`,
          message: typeof b.details === 'string' ? b.details : JSON.stringify(b.details ?? {}),
          created_at: b.bounced_at ?? new Date().toISOString(),
        });
      }

      for (const d of blocks.data ?? []) {
        const p = (d.provider ?? '').toLowerCase() as ProviderKey;
        if (d.decision === 'blocked' && p in stats) stats[p].blocked += 1;
        if (d.decision === 'blocked' && !(p in stats)) {
          // provider unknown at block time (blocked before provider selection)
          if (d.channel === 'email') stats.resend.blocked += 1;
          else stats.twilio.blocked += 1;
        }
      }

      errors.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      return { stats: Object.values(stats), errors: errors.slice(0, 40) };
    },
  });
};

interface SentProbe {
  configured: boolean;
  healthy: boolean;
  sandbox: boolean;
  sender_id: string;
  whatsapp_sender: string | null;
  whatsapp_ready: boolean;
  provider_whatsapp_configured?: boolean;
  enabled_channels: string[];
  latency_ms?: number;
  error?: string;
}

/**
 * Live readiness probe for Sent.dm. `functions.invoke` attaches the signed-in
 * admin's session token, so the edge function authorises the caller correctly.
 */
const useSentProbe = () =>
  useQuery({
    queryKey: ['sent-health'],
    refetchInterval: 120_000,
    queryFn: async (): Promise<SentProbe> => {
      const { data, error } = await supabase.functions.invoke('sent-health');
      if (error) throw error;
      return data as SentProbe;
    },
  });

export const ProviderHealthPanel = () => {
  const { data, isLoading, refetch, isFetching } = useProviderHealth();
  const sentProbe = useSentProbe();

  const health = (s: ProviderStat) => {
    const total = s.sent + s.failed + s.bounced;
    if (total === 0) return { label: 'Idle', variant: 'secondary' as const };
    const errorRate = (s.failed + s.bounced) / total;
    if (errorRate >= 0.25) return { label: 'Degraded', variant: 'destructive' as const };
    if (errorRate > 0) return { label: 'Minor errors', variant: 'outline' as const };
    return { label: 'Healthy', variant: 'default' as const };
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Provider Health
          </CardTitle>
          <CardDescription>
            Delivery, bounce and webhook errors across Sent.dm, Twilio, Termii and Resend over the last {SINCE_HOURS} hours.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            sentProbe.refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Sent.dm gateway readiness</span>
                {sentProbe.isLoading ? (
                  <Badge variant="secondary">Checking…</Badge>
                ) : sentProbe.isError ? (
                  <Badge variant="destructive">Probe failed</Badge>
                ) : sentProbe.data?.healthy ? (
                  <Badge>Connected</Badge>
                ) : (
                  <Badge variant="destructive">
                    {sentProbe.data?.configured ? 'Unreachable' : 'Not configured'}
                  </Badge>
                )}
              </div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <span>
                  WhatsApp:{' '}
                  <strong className={sentProbe.data?.whatsapp_ready ? 'text-foreground' : 'text-destructive'}>
                    {sentProbe.data?.whatsapp_ready ? 'ready' : 'not ready'}
                  </strong>
                  {sentProbe.data?.whatsapp_sender ? ` · ${sentProbe.data.whatsapp_sender}` : ''}
                  {sentProbe.data?.provider_whatsapp_configured === false
                    ? ' · channel not provisioned at Sent.dm'
                    : ''}
                </span>
                <span>
                  Sender ID: <strong className="text-foreground">{sentProbe.data?.sender_id ?? '—'}</strong>
                </span>
                <span>
                  Channels:{' '}
                  <strong className="text-foreground">
                    {sentProbe.data?.enabled_channels?.join(', ') || '—'}
                  </strong>
                </span>
                <span>
                  Mode:{' '}
                  <strong className="text-foreground">
                    {sentProbe.data?.sandbox ? 'sandbox' : 'live'}
                  </strong>
                  {typeof sentProbe.data?.latency_ms === 'number' ? ` · ${sentProbe.data.latency_ms}ms` : ''}
                </span>
                {(sentProbe.data?.error || sentProbe.isError) && (
                  <span className="sm:col-span-2 text-destructive break-words">
                    {sentProbe.data?.error ?? (sentProbe.error as Error)?.message}
                  </span>
                )}
              </div>
              <SentWebhookControl />
            </div>


            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data?.stats.map((s) => {
                const h = health(s);
                return (
                  <div key={s.provider} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{s.label}</span>
                      <Badge variant={h.variant}>{h.label}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      <span>Sent: <strong className="text-foreground">{s.sent}</strong></span>
                      <span>Delivered: <strong className="text-foreground">{s.delivered}</strong></span>
                      <span>Failed: <strong className="text-foreground">{s.failed}</strong></span>
                      <span>Bounced: <strong className="text-foreground">{s.bounced}</strong></span>
                      <span className="col-span-2">Blocked by rules: <strong className="text-foreground">{s.blocked}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                {data?.errors.length ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
                <span className="text-sm font-medium">
                  {data?.errors.length ? `Recent errors (${data.errors.length})` : 'No provider errors recorded'}
                </span>
              </div>
              {!!data?.errors.length && (
                <ScrollArea className="h-56 rounded-md border border-border">
                  <div className="divide-y divide-border">
                    {data.errors.map((e) => (
                      <div key={`${e.id}-${e.event}`} className="p-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase">{e.provider}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{e.channel}</Badge>
                          <span className="text-destructive font-medium">{e.event}</span>
                          <span className="text-muted-foreground ml-auto">
                            {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground break-words">{e.message}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ProviderHealthPanel;
