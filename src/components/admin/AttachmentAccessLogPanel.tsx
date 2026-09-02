import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import type { AttachmentAccessLogRow } from '@/lib/inbox-attachment-audit';

const ACTION_LABELS: Record<string, string> = {
  view: 'Viewed',
  preview: 'Previewed',
  download: 'Downloaded',
  open_external: 'Opened in new tab',
  ocr: 'Text extracted (OCR)',
};

const actionVariant = (action: string) =>
  action === 'download' ? 'default' : action === 'ocr' ? 'secondary' : 'outline';

export const AttachmentAccessLogPanel = ({ conversationId = null }: { conversationId?: string | null }) => {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>('all');
  const [range, setRange] = useState<string>('7');

  const since = useMemo(() => {
    if (range === 'all') return null;
    const d = new Date();
    d.setDate(d.getDate() - Number(range));
    return d.toISOString();
  }, [range]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['inbox-attachment-access-log', conversationId, action, since],
    queryFn: async () => {
      let query = supabase
        .from('inbox_attachment_access_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (conversationId) query = query.eq('conversation_id', conversationId);
      if (action !== 'all') query = query.eq('action', action);
      if (since) query = query.gte('created_at', since);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AttachmentAccessLogRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.filename.toLowerCase().includes(term) ||
        (r.user_email ?? '').toLowerCase().includes(term),
    );
  }, [data, search]);

  useEffect(() => {
    const channel = supabase
      .channel('attachment-access-log')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_attachment_access_log' },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const exportCsv = () => {
    const header = ['Timestamp', 'User', 'Action', 'File', 'Type', 'Conversation', 'Succeeded', 'Error'];
    const lines = rows.map((r) =>
      [
        r.created_at,
        r.user_email ?? r.user_id,
        ACTION_LABELS[r.action] ?? r.action,
        r.filename,
        r.content_type ?? '',
        r.conversation_id ?? '',
        r.succeeded ? 'yes' : 'no',
        r.error ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attachment-access-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Attachment access log
          </CardTitle>
          <CardDescription>
            Every view, download and OCR scan of inbox attachments, with the staff member who did it.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search file or staff email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No attachment access recorded yet.</p>
        ) : (
          <div className="max-h-[520px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(r.created_at), 'dd MMM yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="text-xs">{r.user_email ?? r.user_id}</TableCell>
                    <TableCell>
                      <Badge variant={actionVariant(r.action) as 'default' | 'secondary' | 'outline'} className="text-[10px]">
                        {ACTION_LABELS[r.action] ?? r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs" title={r.filename}>
                      {r.filename}
                      {r.content_type && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({r.content_type})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.succeeded ? (
                        <span className="text-emerald-600">OK</span>
                      ) : (
                        <span className="text-destructive" title={r.error ?? ''}>Failed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AttachmentAccessLogPanel;
