import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Users, Mic, MicOff, PhoneOff, UserMinus } from 'lucide-react';
import type { VoIPCall } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';

interface ConferenceRoomPanelProps {
  activeCalls: VoIPCall[];
  onEndCall: (callId: string) => void;
}

export const ConferenceRoomPanel = ({ activeCalls, onEndCall }: ConferenceRoomPanelProps) => {
  const [mutedParticipants, setMutedParticipants] = useState<Set<string>>(new Set());

  const conferencesCalls = activeCalls.filter(c => c.call_type === 'group');

  const toggleMute = (participantId: string) => {
    setMutedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(participantId)) {
        next.delete(participantId);
      } else {
        next.add(participantId);
      }
      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'ringing': return 'bg-yellow-500';
      case 'pending': return 'bg-blue-500';
      case 'disconnected': return 'bg-gray-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Conference Rooms
        </CardTitle>
        <CardDescription>
          Manage active conference calls and participants
        </CardDescription>
      </CardHeader>
      <CardContent>
        {conferencesCalls.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active conference calls</p>
            <p className="text-sm">Start a group call from the Make Call tab</p>
          </div>
        ) : (
          <div className="space-y-4">
            {conferencesCalls.map((call) => (
              <Card key={call.id} className="border-green-500/30 bg-green-500/5">
                <CardContent className="p-4 space-y-4">
                  {/* Conference Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-green-500 text-white">
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">Conference Call</p>
                        <p className="text-sm text-muted-foreground">
                          {call.participants?.length || 0} participants •{' '}
                          <Badge variant="outline" className="text-xs">
                            {call.region === 'USA' ? '🇺🇸' : '🇳🇬'} {call.region}
                          </Badge>
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onEndCall(call.id)}
                    >
                      <PhoneOff className="h-4 w-4 mr-1" />
                      End All
                    </Button>
                  </div>

                  {/* Participants List */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Participants</Label>
                    <div className="divide-y rounded-lg border">
                      {call.participants?.map((participant) => (
                        <div
                          key={participant.id}
                          className="flex items-center justify-between p-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`h-2 w-2 rounded-full ${getStatusColor(participant.status)}`} />
                            <div>
                              <p className="text-sm font-medium">
                                {participant.display_name || formatPhoneForDisplay(participant.phone_number)}
                              </p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {participant.participant_type} • {participant.status}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant={mutedParticipants.has(participant.id) ? 'destructive' : 'ghost'}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleMute(participant.id)}
                            >
                              {mutedParticipants.has(participant.id) ? (
                                <MicOff className="h-3 w-3" />
                              ) : (
                                <Mic className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Remove participant"
                            >
                              <UserMinus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
