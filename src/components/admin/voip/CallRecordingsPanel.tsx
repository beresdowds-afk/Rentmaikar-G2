import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, Play, Download, Volume2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { VoIPCall, CallRegion } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';
import { RecordingPlaybackModal } from './RecordingPlaybackModal';

interface CallRecordingsPanelProps {
  calls: VoIPCall[];
  onRefresh: () => void;
  isLoading: boolean;
}

const statusVariant: Record<string, string> = {
  ready: 'bg-green-500',
  processing: 'bg-yellow-500',
  pending: 'bg-yellow-500',
  recording: 'bg-red-500',
  failed: 'bg-red-600',
};

export const CallRecordingsPanel = ({ calls, onRefresh, isLoading }: CallRecordingsPanelProps) => {
  const [regionFilter, setRegionFilter] = useState<CallRegion | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [playbackCall, setPlaybackCall] = useState<VoIPCall | null>(null);
  const { toast } = useToast();

  const recordings = useMemo(() => {
    return calls.filter((call) => {
      const status = (call as unknown as { recording_status?: string }).recording_status || 'none';
      if (status === 'none') return false;
      if (regionFilter !== 'all' && call.region !== regionFilter) return false;
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const haystack = (call.participants || [])
          .map((p) => `${p.display_name || ''} ${p.phone_number || ''}`)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [calls, regionFilter, statusFilter, search]);

  const handleDownload = async (call: VoIPCall) => {
    setDownloadingId(call.id);
    try {
      const { data, error } = await supabase.functions.invoke('get-recording-url', {
        body: { callId: call.id },
      });
      if (error) throw error;
      const link = document.createElement('a');
      link.href = data.url;
      link.download = `call-recording-${call.id}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to download recording';
      toast({ title: 'Download failed', description: message, variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '—';
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Call Recordings
            </CardTitle>
            <CardDescription>Play back or download stored recordings for authorized review.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Search participant name or number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={regionFilter} onValueChange={(v) => setRegionFilter(v as CallRegion | 'all')}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder="Region" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              <SelectItem value="USA">USA</SelectItem>
              <SelectItem value="Nigeria">Nigeria</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Participants</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Recording</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No recordings match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                recordings.map((call) => {
                  const status = (call as unknown as { recording_status?: string }).recording_status || 'none';
                  const isReady = status === 'ready';
                  return (
                    <TableRow key={call.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(call.created_at), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(call.participants || []).map((p, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {p.display_name || formatPhoneForDisplay(p.phone_number)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{call.region}</Badge></TableCell>
                      <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                      <TableCell>
                        <Badge className={`${statusVariant[status] || 'bg-gray-500'} text-white`}>{status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isReady}
                            onClick={() => setPlaybackCall(call)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isReady || downloadingId === call.id}
                            onClick={() => handleDownload(call)}
                          >
                            {downloadingId === call.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <RecordingPlaybackModal
        call={playbackCall}
        isOpen={!!playbackCall}
        onClose={() => setPlaybackCall(null)}
      />
    </Card>
  );
};

export default CallRecordingsPanel;
