import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, ListChecks, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

const DECISION_VARIANT: Record<string, 'default' | 'destructive' | 'secondary'> = {
  sent: 'default',
  blocked: 'secondary',
  failed: 'destructive',
};

const REASON_LABELS: Record<string, string> = {
  channel_paused_by_admin: 'Channel paused by admin',
  recipient_opted_out: 'Recipient opted out (STOP)',
  suppressed: 'Address on suppression list',
  accepted_by_provider: 'Accepted by provider',
};

export const OutboundAuditLogPanel = () => {
  const [channel, setChannel] = useState<string>('all');
  const [decision, setDecision] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['outbound-decision-log', channel, decision],
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('outbound_decision_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (channel !== 'all') q = q.eq('channel', channel);
      if (decision !== 'all') q = q.eq('decision', decision);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((r) =>
      [r.recipient_masked, r.reason, r.notification_type, r.provider, r.region, r.function_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [data, search]);

  const exportCsv = () => {
    if (!rows.length) {
      toast.error('Nothing to export');
      return;
    }
    const header = ['Time', 'Channel', 'Region', 'Provider', 'Recipient', 'Type', 'Decision', 'Reason', 'Function', 'Message ID'];
    const body = rows.map((r) => [
      r.created_at,
      r.channel,
      r.region ?? '',
      r.provider ?? '',
      r.recipient_masked ?? '',
      r.notification_type ?? '',
      r.decision,
      r.reason ?? '',
      r.function_name ?? '',
      r.message_id ?? '',
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `outbound-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Outbound Audit Log
          </CardTitle>
          <CardDescription>
            Why every outbound message was sent or blocked — channel pauses, opt-outs, suppression and provider failures.
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
        <div className="flex flex-wrap gap-2">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="call">Calls</SelectItem>
            </SelectContent>
          </Select>
          <Select value={decision} onValueChange={setDecision}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Decision" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search recipient, reason, type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[240px]"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No outbound decisions recorded yet.</p>
        ) : (
          <ScrollArea className="h-80 rounded-md border border-border">
            <div className="divide-y divide-border">
              {rows.map((r) => (
                <div key={r.id} className="p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={DECISION_VARIANT[r.decision] ?? 'secondary'} className="text-[10px] uppercase">
                      {r.decision}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{r.channel}</Badge>
                    {r.region && <span className="text-muted-foreground">{r.region}</span>}
                    {r.provider && <span className="text-muted-foreground">via {r.provider}</span>}
                    <span className="font-mono">{r.recipient_masked ?? '—'}</span>
                    <span className="text-muted-foreground ml-auto">
                      {format(new Date(r.created_at), 'dd MMM HH:mm')}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground break-words">
                    {REASON_LABELS[r.reason ?? ''] ?? r.reason ?? '—'}
                    {r.notification_type ? ` · ${r.notification_type}` : ''}
                    {r.function_name ? ` · ${r.function_name}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default OutboundAuditLogPanel;
