import React, { useState, useEffect } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX, MessageSquare, Clock, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { VoIPCall } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';
import { useCommunicationsHub } from './CommunicationsHubContext';
import { useVoiceDevice } from '@/hooks/useVoiceDevice';

interface HubActiveCallHUDProps {
  call: VoIPCall;
  onEndCall: (callId: string) => Promise<void>;
}

export const HubActiveCallHUD: React.FC<HubActiveCallHUDProps> = ({ call, onEndCall }) => {
  const { openWithRecipient } = useCommunicationsHub();
  const voice = useVoiceDevice();
  const [duration, setDuration] = useState(0);
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    const start = call.started_at ? new Date(call.started_at).getTime() : Date.now();
    const interval = setInterval(() => {
      setDuration(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [call.started_at]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const recipientParticipant =
    call.participants?.find((p) => p.participant_type === 'recipient') || call.participants?.[0];
  const displayName = recipientParticipant?.display_name || recipientParticipant?.phone_number || 'Caller';
  const phoneNumber = recipientParticipant?.phone_number || '';

  const handleEnd = async () => {
    setIsEnding(true);
    try {
      await onEndCall(call.id);
      await voice.hangUp();
    } finally {
      setIsEnding(false);
    }
  };

  const handleFollowUpMessage = () => {
    openWithRecipient({
      name: displayName,
      phone: phoneNumber,
      defaultAction: 'message',
      subject: `Follow-up on Call (${new Date().toLocaleDateString()})`,
    });
  };

  const isMuted = voice.isMuted;
  const isSpeakerOn = voice.isSpeakerphone;

  return (
    <div className="bg-card border border-border/80 rounded-xl p-3.5 shadow-sm space-y-3">
      {/* Call Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-foreground">Active VoIP Call</span>
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-500/30"
          >
            {call.region || 'USA'}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Participant Info */}
      <div className="bg-muted/40 rounded-lg p-2.5 flex items-center justify-between">
        <div>
          <div className="font-medium text-xs text-foreground truncate max-w-[190px]">
            {displayName}
          </div>
          {phoneNumber && (
            <div className="text-[11px] text-muted-foreground font-mono">
              {formatPhoneForDisplay(phoneNumber)}
            </div>
          )}
        </div>
        <div className="text-right">
          <Badge variant="secondary" className="text-[10px] capitalize">
            {call.status || 'in-progress'}
          </Badge>
          <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
            <Headphones className="h-2.5 w-2.5" />
            <span className="truncate max-w-[90px]">{voice.outputLabel}</span>
          </div>
        </div>
      </div>

      {/* Call Controls with real audio device integration */}
      <div className="grid grid-cols-4 gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant={isMuted ? 'destructive' : 'outline'}
          className="h-8 text-xs gap-1.5 px-2"
          onClick={() => voice.toggleMute()}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Mute'}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={!isSpeakerOn ? 'secondary' : 'outline'}
          className="h-8 text-xs gap-1.5 px-2"
          onClick={() => void voice.toggleSpeakerphone()}
          title={isSpeakerOn ? 'Switch to earpiece / headset' : 'Enable speakerphone'}
        >
          {isSpeakerOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{isSpeakerOn ? 'Speaker' : 'Earpiece'}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 px-2"
          onClick={handleFollowUpMessage}
          title="Send follow-up message"
        >
          <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
          <span className="hidden sm:inline">Message</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-8 text-xs gap-1.5 px-2 bg-red-600 hover:bg-red-700 text-white"
          onClick={handleEnd}
          disabled={isEnding}
        >
          <PhoneOff className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{isEnding ? 'Ending...' : 'Hang Up'}</span>
        </Button>
      </div>
    </div>
  );
};
