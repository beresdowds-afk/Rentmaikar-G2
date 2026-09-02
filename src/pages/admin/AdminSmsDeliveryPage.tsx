import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Inbox, Loader2, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import Seo from '@/components/seo/Seo';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LiveSmsTestPanel from '@/components/admin/LiveSmsTestPanel';

interface SmsStats {
  queued?: number;
  sent?: number;
  delivered?: number;
  failed?: number;
  bounced?: number;
  complained?: number;
  total?: number;
  dlq?: number;
  dlq_paused?: number;
}

interface DlqRow {
  id: string;
  channel: string;
  recipient_phone: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  paused: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface FailureEvent {
  id: string;
  created_at: string;
  channel: string;
  provider: string;
  event_type: string;
  recipient: string | null;
  error_message: string | null;
}

const STAT_CARDS: { key: keyof SmsStats; label: string; tone: string }[] = [
  { key: 'queued', label: 'Queued', tone: 'text-muted-foreground' },
  { key: 'sent', label: 'Sent', tone: 'text-primary' },
  { key: 'delivered', label: 'Delivered', tone: 'text-emerald-500' },
  { key: 'failed', label: 'Failed', tone: 'text-destructive' },
  { key: 'bounced', label: 'Blocked', tone: 'text-amber-500' },
  { key: 'complained', label: 'Opt-outs', tone: 'text-amber-500' },
  { key: 'dlq', label: 'In DLQ', tone: 'text-destructive' },
  { key: 'dlq_paused', label: 'DLQ paused', tone: 'text-destructive' },
];

/** SMS / WhatsApp delivery monitoring: counts, failures and the retry queue. */
export default function AdminSmsDeliveryPage() {
  const [stats, setStats] = useState<SmsStats>({});
  const [dlq, setDlq] = useState<DlqRow[]>([]);
  const [failures, setFailures] = useState<FailureEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsRes, dlqRes, failRes] = await Promise.all([
        supabase.rpc('sms_delivery_stats' as never, { _hours: 24 } as never),
        (supabase as never as typeof supabase)
          .from('sms_dlq_retry_state' as never)
          .select('id, channel, recipient_phone, attempts, last_error, next_attempt_at, paused, resolved_at, created_at')
          .is('resolved_at', null)
          .order('next_attempt_at', { ascending: true })
          .limit(100),
        supabase
          .from('messaging_events')
          .select('id, created_at, channel, provider, event_type, recipient, error_message')
          .in('channel', ['sms', 'whatsapp'])
          .in('event_type', ['failed', 'rejected', 'blocked', 'opted_out'])
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (statsRes.error) throw statsRes.error;
      setStats((statsRes.data as unknown as SmsStats) ?? {});
      setDlq(((dlqRes.data as unknown) as DlqRow[]) ?? []);
      setFailures(((failRes.data as unknown) as FailureEvent[]) ?? []);
    } catch (err) {
      console.error('Failed to load SMS delivery data:', err);
      toast.error('Could not load SMS delivery data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reprocess = async () => {
    setIsWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('reprocess-sms-dlq', { body: {} });
      if (error) throw error;
      const r = data as { dead_lettered?: number; resolved?: number; requeued?: number; paused?: number };
      toast.success(
        `Sweep done — ${r?.dead_lettered ?? 0} dead-lettered, ${r?.resolved ?? 0} resent, ${r?.requeued ?? 0} re-queued`,
      );
      await load();
    } catch (err) {
      console.error('Reprocess failed:', err);
      toast.error(err instanceof Error ? err.message : 'Reprocess failed');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <Seo
        title="SMS Delivery Monitoring | Rentmaikar Admin"
        description="Queued, sent, failed and dead-lettered SMS and WhatsApp messages with provider errors and a reprocess worker."
        path="/admin/sms-delivery"
      />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Send className="h-6 w-6 text-primary" /> SMS Delivery
          </h1>
          <p className="text-sm text-muted-foreground">
            Delivery, bounce and opt-out events for SMS and WhatsApp over the last 24 hours.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => void reprocess()} disabled={isWorking}>
            {isWorking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Reprocess stuck messages
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STAT_CARDS.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-2xl font-semibold ${c.tone}`}>{stats[c.key] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <LiveSmsTestPanel onSent={load} />



      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4" /> Dead-letter queue
            {stats.dlq_paused ? (
              <Badge variant="destructive">{stats.dlq_paused} paused</Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Stuck or rejected messages awaiting an automatic retry with exponential backoff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dlq.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing queued.</p>
          ) : (
            <ScrollArea className="max-h-[40vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destination</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Next attempt</TableHead>
                    <TableHead>Last error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dlq.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.recipient_phone}</TableCell>
                      <TableCell className="uppercase text-xs">{r.channel}</TableCell>
                      <TableCell>
                        <Badge variant={r.paused ? 'destructive' : 'secondary'}>
                          {r.attempts}
                          {r.paused ? ' · paused' : ''}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(r.next_attempt_at), 'dd MMM HH:mm')}
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-xs text-muted-foreground">
                        {r.last_error ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" /> Recent provider failures
          </CardTitle>
          <CardDescription>Failures, rejections, blocks and opt-outs reported by providers.</CardDescription>
        </CardHeader>
        <CardContent>
          {failures.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No failures reported recently.
            </p>
          ) : (
            <ScrollArea className="max-h-[40vh]">
              <ul className="space-y-2">
                {failures.map((f) => (
                  <li key={f.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive" className="uppercase">
                        {f.event_type}
                      </Badge>
                      <span className="uppercase text-xs text-muted-foreground">
                        {f.channel} · {f.provider}
                      </span>
                      <span className="font-mono text-xs">{f.recipient ?? '—'}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {format(new Date(f.created_at), 'dd MMM HH:mm')}
                      </span>
                    </div>
                    {f.error_message && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                        {f.error_message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
