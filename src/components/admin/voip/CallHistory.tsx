import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, RefreshCw, Phone, Users, PhoneIncoming, PhoneOutgoing, Loader2, Play, Volume2, FileText } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import type { VoIPCall, CallRegion } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';
import { RecordingPlaybackModal } from './RecordingPlaybackModal';
import { CallTranscriptDialog } from './CallTranscriptDialog';


interface CallHistoryProps {
  calls: VoIPCall[];
  onRefresh: () => void;
  isLoading: boolean;
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

const recordingStatusIcons: Record<string, { icon: typeof Volume2; color: string }> = {
  ready: { icon: Play, color: 'text-green-500' },
  processing: { icon: Loader2, color: 'text-yellow-500' },
  recording: { icon: Volume2, color: 'text-red-500' },
};

export const CallHistory = ({ calls, onRefresh, isLoading }: CallHistoryProps) => {
  const [regionFilter, setRegionFilter] = useState<CallRegion | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'individual' | 'group'>('all');
  const [selectedCall, setSelectedCall] = useState<VoIPCall | null>(null);
  const [isPlaybackOpen, setIsPlaybackOpen] = useState(false);
  const [transcriptCall, setTranscriptCall] = useState<VoIPCall | null>(null);


  const filteredCalls = calls.filter(call => {
    if (regionFilter !== 'all' && call.region !== regionFilter) return false;
    if (typeFilter !== 'all' && call.call_type !== typeFilter) return false;
    return true;
  });

  const formatDuration = (seconds: number) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Call History
            </CardTitle>
            <CardDescription>
              View all past and ongoing calls
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-4">
          <Select value={regionFilter} onValueChange={(v) => setRegionFilter(v as CallRegion | 'all')}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              <SelectItem value="USA">🇺🇸 USA</SelectItem>
              <SelectItem value="Nigeria">🇳🇬 Nigeria</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | 'individual' | 'group')}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Call Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="group">Group</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Participants</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Recording</TableHead>
                <TableHead>Date/Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCalls.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No calls found
                  </TableCell>
                </TableRow>
              ) : (
                filteredCalls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {call.call_type === 'individual' ? (
                          <Phone className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Users className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="capitalize">{call.call_type}</span>
                        {call.direction === 'inbound' ? (
                          <PhoneIncoming className="h-3 w-3 text-green-500" />
                        ) : (
                          <PhoneOutgoing className="h-3 w-3 text-blue-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {call.region === 'USA' ? '🇺🇸' : '🇳🇬'} {call.region}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {call.participants?.slice(0, 3).map((p, i) => (
                          <span key={i} className="text-sm">
                            {p.display_name || formatPhoneForDisplay(p.phone_number)}
                          </span>
                        ))}
                        {(call.participants?.length || 0) > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{(call.participants?.length || 0) - 3} more
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[call.status]} text-white`}>
                        {call.status.replace('-', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(call as any)?.recording_status === 'ready' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCall(call);
                              setIsPlaybackOpen(true);
                            }}
                            className="text-green-600 hover:text-green-700"
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Play
                          </Button>
                        ) : (call as any)?.recording_status === 'processing' ? (
                          <span className="flex items-center gap-1 text-yellow-600 text-sm">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Processing
                          </span>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTranscriptCall(call)}
                          title="View transcript"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">
                        {format(new Date(call.created_at), 'MMM d, yyyy')}
                        <br />
                        <span className="text-muted-foreground">
                          {format(new Date(call.created_at), 'h:mm a')}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Recording Playback Modal */}
        <RecordingPlaybackModal
          call={selectedCall}
          isOpen={isPlaybackOpen}
          onClose={() => {
            setIsPlaybackOpen(false);
            setSelectedCall(null);
          }}
        />

        {/* Transcript Dialog */}
        <CallTranscriptDialog
          call={transcriptCall}
          isOpen={!!transcriptCall}
          onClose={() => setTranscriptCall(null)}
        />

      </CardContent>
    </Card>
  );
};
