import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, PhoneCall, PhoneOff, Clock, CheckCircle, XCircle, ArrowUpRight } from 'lucide-react';
import { format } from 'date-fns';

interface CallHistoryItem {
  id: string;
  call_type: string;
  region: string;
  status: string;
  direction: string;
  duration_seconds: number | null;
  caller_role: string | null;
  receiver_role: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

interface VoiceCallHistoryProps {
  calls: CallHistoryItem[];
  isLoading: boolean;
  onRefresh: () => void;
  userRole?: string;
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  completed: { icon: CheckCircle, color: 'text-green-500', label: 'Completed' },
  'in-progress': { icon: PhoneCall, color: 'text-blue-500', label: 'In Progress' },
  ringing: { icon: Phone, color: 'text-yellow-500', label: 'Ringing' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  'no-answer': { icon: PhoneOff, color: 'text-orange-500', label: 'No Answer' },
  missed: { icon: PhoneOff, color: 'text-red-400', label: 'Missed' },
  busy: { icon: PhoneOff, color: 'text-yellow-600', label: 'Busy' },
  canceled: { icon: XCircle, color: 'text-muted-foreground', label: 'Canceled' },
  pending: { icon: Clock, color: 'text-muted-foreground', label: 'Pending' },
};

const formatDuration = (seconds: number | null) => {
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const VoiceCallHistory = ({ calls, isLoading, onRefresh, userRole: _userRole }: VoiceCallHistoryProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading call history...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Call History
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Phone className="h-8 w-8 mb-2 opacity-50" />
            <p>No call history yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {calls.map((call) => {
                const config = statusConfig[call.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                
                return (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full bg-muted`}>
                        <StatusIcon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {call.direction === 'outbound' ? 'Outgoing' : 'Incoming'} Call
                          </span>
                          {call.direction === 'outbound' && (
                            <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{format(new Date(call.created_at), 'MMM d, h:mm a')}</span>
                          {call.caller_role && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {call.caller_role} → {call.receiver_role}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <Badge variant="secondary" className="text-xs">
                          {call.region}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDuration(call.duration_seconds)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${config.color}`}
                      >
                        {config.label}
                      </Badge>
                    </div>
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
