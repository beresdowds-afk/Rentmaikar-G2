import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

type EventRow = {
  id: string;
  created_at: string;
  channel: string;
  provider: string;
  region: string | null;
  recipient: string | null;
  sender: string | null;
  event_type: string;
  error_code: string | null;
  error_message: string | null;
  user_id: string | null;
  provider_message_id: string | null;
  template_name: string | null;
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  delivered: 'default',
  read: 'default',
  sent: 'secondary',
  queued: 'outline',
  accepted: 'outline',
  failed: 'destructive',
  undelivered: 'destructive',
  blocked: 'destructive',
  error: 'destructive',
};

const statusOf = (r: EventRow) => {
  const t = (r.event_type || '').toLowerCase().replace(/^message[._]/, '');
  if (r.error_code || r.error_message) return t.includes('fail') || t.includes('undeliver') ? t : 'failed';
  return t || 'unknown';
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/**
 * Outbound SMS/WhatsApp delivery log — every provider status update and
 * error, filterable by date range, user and destination number.
 */
export const OutboundDeliveryLogPanel = () => {
  const [channel, setChannel] = useState('all');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState(daysAgoISO(7));
  const [to, setTo] = useState(todayISO());
  const [destination, setDestination] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['outbound-delivery-log', channel, from, to],
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('messaging_events')
        .select(
          'id, created_at, channel, provider, region, recipient, sender, event_type, error_code, error_message, user_id, provider_message_id, template_name',
        )
        .eq('direction', 'outbound')
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(500);
      if (channel === 'all') q = q.in('channel', ['sms', 'whatsapp']);
      else q = q.eq('channel', channel);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  // Resolve user names/emails for the rows in view.
  useEffect(() => {
    const ids = Array.from(new Set((data ?? []).map((r) => r.user_id).filter(Boolean))) as string[];
    const missing = ids.filter((id) => !(id in names));
    if (!missing.length) return;
    (async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', missing.slice(0, 200));
      if (!profiles?.length) return;
      setNames((prev) => ({
        ...prev,
        ...Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.email || p.id])),
      }));
    })();
  }, [data, names]);

  const rows = useMemo(() => {
    const dest = destination.replace(/[\s()-]/g, '').toLowerCase();
    const user = userQuery.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (status !== 'all' && statusOf(r) !== status) return false;
      if (dest && !(r.recipient ?? '').replace(/[\s()-]/g, '').toLowerCase().includes(dest)) return false;
      if (user) {
        const label = `${r.user_id ?? ''} ${names[r.user_id ?? ''] ?? ''}`.toLowerCase();
        if (!label.includes(user)) return false;
      }
      return true;
    });
  }, [data, status, destination, userQuery, names]);

  const summary = useMemo(() => {
    const acc = { total: rows.length, delivered: 0, failed: 0 };
    rows.forEach((r) => {
      const s = statusOf(r);
      if (s === 'delivered' || s === 'read') acc.delivered += 1;
      if (STATUS_VARIANT[s] === 'destructive') acc.failed += 1;
    });
    return acc;
  }, [rows]);

  const exportCsv = () => {
    if (!rows.length) {
      toast.error('Nothing to export');
      return;
    }
    const header = ['Time', 'Channel', 'Provider', 'Region', 'Destination', 'User', 'Status', 'Error code', 'Error message', 'Provider message ID'];
    const body = rows.map((r) => [
      r.created_at,
      r.channel,
      r.provider,
      r.region ?? '',
      r.recipient ?? '',
      names[r.user_id ?? ''] ?? r.user_id ?? '',
      statusOf(r),
      r.error_code ?? '',
      r.error_message ?? '',
      r.provider_message_id ?? '',
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sms-whatsapp-delivery-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            SMS &amp; WhatsApp Delivery Log
          </CardTitle>
          <CardDescription>
            Provider delivery statuses and errors for outbound messages — filter by date, user or destination.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5 mr-1" />
            CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">SMS + WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="undelivered">Undelivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Destination</Label>
            <Input placeholder="+234…" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">User</Label>
            <Input placeholder="Name, email or ID" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{summary.total} messages</Badge>
          <Badge variant="default">{summary.delivered} delivered</Badge>
          <Badge variant="destructive">{summary.failed} failed</Badge>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No outbound SMS or WhatsApp events for these filters.
          </p>
        ) : (
          <ScrollArea className="h-96 rounded-md border border-border">
            <div className="divide-y divide-border">
              {rows.map((r) => {
                const s = statusOf(r);
                return (
                  <div key={r.id} className="p-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANT[s] ?? 'secondary'} className="text-[10px] uppercase">{s}</Badge>
                      <Badge variant="outline" className="text-[10px]">{r.channel}</Badge>
                      <span className="text-muted-foreground">via {r.provider}</span>
                      {r.region && <span className="text-muted-foreground">{r.region}</span>}
                      <span className="font-mono">{r.recipient ?? '—'}</span>
                      <span className="text-muted-foreground ml-auto">
                        {format(new Date(r.created_at), 'dd MMM yyyy HH:mm')}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground break-words">
                      {names[r.user_id ?? ''] ?? (r.user_id ? r.user_id : 'Unlinked recipient')}
                      {r.template_name ? ` · ${r.template_name}` : ''}
                      {r.provider_message_id ? ` · ${r.provider_message_id}` : ''}
                    </p>
                    {(r.error_code || r.error_message) && (
                      <p className="mt-1 text-destructive break-words">
                        {r.error_code ? `[${r.error_code}] ` : ''}{r.error_message ?? 'Provider error'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default OutboundDeliveryLogPanel;
