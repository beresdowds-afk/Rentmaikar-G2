import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Briefcase, ClipboardList, Loader2, PhoneIncoming, PhoneOutgoing, RefreshCw, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface CallLogRow {
  id: string;
  call_sid: string | null;
  status: string;
  direction: string | null;
  region: string | null;
  call_type: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  initiated_by: string | null;
  answered_by: string | null;
  receiver_id: string | null;
  case_id: string | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  ringing: 'bg-blue-500',
  'in-progress': 'bg-green-500',
  completed: 'bg-gray-500',
  failed: 'bg-red-500',
  busy: 'bg-orange-500',
  'no-answer': 'bg-purple-500',
  canceled: 'bg-gray-400',
};

const formatDuration = (call: CallLogRow) => {
  let seconds = call.duration_seconds ?? 0;
  if (!seconds && call.started_at && call.ended_at) {
    const diff = Math.round(
      (new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000,
    );
    // Ignore implausible gaps from records that were closed long after the call.
    seconds = diff > 0 && diff < 6 * 60 * 60 ? diff : 0;
  }
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Read-only log of every call handled by the call centre, with the duration,
 * the outcome and the staff member who answered it.
 */
export const CallLogPage = () => {
  const [rows, setRows] = useState<CallLogRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('voip_calls')
      .select(
        'id, call_sid, status, direction, region, call_type, duration_seconds, started_at, ended_at, created_at, initiated_by, answered_by, receiver_id, case_id',
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[CallLogPage] failed to load calls:', error.message);
      setRows([]);
      setIsLoading(false);
      return;
    }

    const calls = (data ?? []) as unknown as CallLogRow[];
    setRows(calls);

    const ids = Array.from(
      new Set(
        calls
          .flatMap((c) => [c.initiated_by, c.answered_by, c.receiver_id])
          .filter((v): v is string => !!v),
      ),
    );

    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
        map[p.id] = p.full_name || p.email || 'Unnamed staff';
      });
      setNames(map);
    } else {
      setNames({});
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clearLog = useCallback(async () => {
    setIsClearing(true);
    const { data, error } = await supabase.rpc('clear_voip_call_log' as never);
    setIsClearing(false);
    if (error) {
      toast.error(error.message || 'Could not clear the call log');
      return;
    }
    toast.success(`Cleared ${data ?? 0} finished call${data === 1 ? '' : 's'} from the log`);
    void load();
  }, [load]);

  const openCase = useCallback(
    async (call: CallLogRow) => {
      if (call.case_id) {
        navigate(`/admin/cases?case=${call.case_id}`);
        return;
      }
      setCreatingFor(call.id);
      const { data, error } = await supabase.rpc('case_for_call', {
        p_call_id: call.id,
        p_subject: undefined,
      } as never);
      setCreatingFor(null);
      if (error || !data) {
        toast.error(error?.message || 'Could not open a case for this call');
        return;
      }
      toast.success('Case opened for this call');
      navigate(`/admin/cases?case=${data as string}`);
    },
    [navigate],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((call) => {
      if (statusFilter !== 'all' && call.status !== statusFilter) return false;
      if (directionFilter !== 'all' && call.direction !== directionFilter) return false;
      if (!term) return true;
      const haystack = [
        call.call_sid ?? '',
        call.region ?? '',
        names[call.answered_by ?? ''] ?? '',
        names[call.initiated_by ?? ''] ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, statusFilter, directionFilter, search, names]);

  const answeredCount = filtered.filter((c) => !!c.answered_by).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Call Log
            </CardTitle>
            <CardDescription>
              Every call with its length, outcome and the staff member who answered
              {filtered.length > 0
              ? ` · ${answeredCount} of ${filtered.length} answered by staff · scroll for more`
              : ''}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isClearing || rows.length === 0}
                  className="gap-2"
                >
                  {isClearing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Clear log
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear the call log?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes every finished call record for good. Calls that are still ringing
                    or connected are kept.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep records</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void clearLog()}>Clear log</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.keys(statusColors).map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace('-', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All directions</SelectItem>
              <SelectItem value="inbound">Incoming</SelectItem>
              <SelectItem value="outbound">Outgoing</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff, region or call reference"
            className="w-full sm:w-[280px]"
          />
        </div>

        <div className="max-h-[26rem] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Date / time</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Answered by</TableHead>
                <TableHead>Started by</TableHead>
                <TableHead>Case</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No calls logged yet
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(call.created_at), 'MMM d, yyyy')}
                      <br />
                      <span className="text-muted-foreground">
                        {format(new Date(call.created_at), 'h:mm a')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 text-sm capitalize">
                        {call.direction === 'inbound' ? (
                          <PhoneIncoming className="h-4 w-4 text-green-500" />
                        ) : (
                          <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                        )}
                        {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{call.region ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatDuration(call)}</TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[call.status] ?? 'bg-gray-400'} text-white`}>
                        {call.status.replace('-', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {call.answered_by ? (
                        names[call.answered_by] ?? 'Staff member'
                      ) : (
                        <span className="text-muted-foreground">Not answered in app</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {call.initiated_by ? (
                        names[call.initiated_by] ?? 'Staff member'
                      ) : (
                        <span className="text-muted-foreground">Caller</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={call.case_id ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => void openCase(call)}
                        disabled={creatingFor === call.id}
                      >
                        {creatingFor === call.id ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Briefcase className="mr-2 h-3 w-3" />
                        )}
                        {call.case_id ? 'View case' : 'Create case'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default CallLogPage;
