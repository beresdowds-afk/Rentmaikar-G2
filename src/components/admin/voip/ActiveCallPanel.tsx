import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Phone, PhoneOff, Users, Mic, MicOff, Volume2, VolumeX, Circle, FileText, Loader2 } from 'lucide-react';
import type { VoIPCall } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';
import { useCallTranscription } from '@/hooks/useCallTranscription';
import { useRegion } from '@/contexts/RegionContext';


interface ActiveCallPanelProps {
  call: VoIPCall;
  onEndCall: () => void;
}

export const ActiveCallPanel = ({ call, onEndCall }: ActiveCallPanelProps) => {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [saveVoiceLog, setSaveVoiceLog] = useState(false);
  const { country } = useRegion();
  const transcription = useCallTranscription({
    callId: call.id,
    saveVoiceLog,
    languageCode: call.region === 'Nigeria' || country === 'Nigeria' ? 'en' : 'en',
    speaker: 'caller',
    segmentSeconds: 15,
  });


  useEffect(() => {
    const startTime = call.started_at ? new Date(call.started_at).getTime() : Date.now();
    
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [call.started_at]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const statusColors: Record<string, string> = {
    ringing: 'bg-yellow-500',
    'in-progress': 'bg-green-500',
  };

  return (
    <Card className="border-green-500 bg-green-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Call Status Icon */}
            <div className="relative">
              <div className={`p-3 rounded-full ${call.status === 'in-progress' ? 'bg-green-500' : 'bg-yellow-500'} text-white`}>
                {call.call_type === 'group' ? (
                  <Users className="h-6 w-6" />
                ) : (
                  <Phone className="h-6 w-6" />
                )}
              </div>
              {call.status === 'ringing' && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500" />
                </span>
              )}
            </div>

            {/* Call Info */}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">
                  {call.call_type === 'group' ? 'Conference Call' : 'Voice Call'}
                </span>
                <Badge className={`${statusColors[call.status]} text-white`}>
                  {call.status === 'ringing' ? 'Ringing...' : 'In Progress'}
                </Badge>
                <Badge variant="outline">
                  {call.region === 'USA' ? '🇺🇸' : '🇳🇬'} {call.region}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {call.participants?.map((p, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    {p.display_name || formatPhoneForDisplay(p.phone_number)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Duration & Controls */}
          <div className="flex items-center gap-4">
            {/* Duration */}
            <div className="text-2xl font-mono font-bold text-green-600">
              {formatDuration(duration)}
            </div>

            {/* Call Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Live Transcription Toggle (ElevenLabs Scribe) */}
              <div className="flex items-center gap-1.5 mr-2 px-2 py-1 rounded-md border bg-background">
                {transcription.isTranscribing ? (
                  <Loader2 className="h-3 w-3 text-primary animate-spin" />
                ) : (
                  <FileText className="h-3 w-3 text-muted-foreground" />
                )}
                <Label htmlFor="transcribe-toggle" className="text-xs cursor-pointer">
                  {transcription.isTranscribing ? 'Transcribing' : 'Transcribe'}
                </Label>
                <Switch
                  id="transcribe-toggle"
                  checked={transcription.isTranscribing}
                  onCheckedChange={(on) => (on ? transcription.start() : transcription.stop())}
                  className="scale-75"
                />
              </div>

              {/* Voice log toggle (optional recording of audio segments) */}
              <div className="flex items-center gap-1.5 mr-2 px-2 py-1 rounded-md border bg-background">
                <Circle className={`h-3 w-3 ${saveVoiceLog ? 'text-red-500 fill-red-500 animate-pulse' : 'text-muted-foreground'}`} />
                <Label htmlFor="voice-log-toggle" className="text-xs cursor-pointer">
                  Voice log
                </Label>
                <Switch
                  id="voice-log-toggle"
                  checked={saveVoiceLog}
                  onCheckedChange={setSaveVoiceLog}
                  className="scale-75"
                />
              </div>

              {/* Legacy Recording Toggle (Twilio) */}
              <div className="flex items-center gap-1.5 mr-2 px-2 py-1 rounded-md border bg-background">
                <Circle className={`h-3 w-3 ${isRecording ? 'text-red-500 fill-red-500 animate-pulse' : 'text-muted-foreground'}`} />
                <Label htmlFor="recording-toggle" className="text-xs cursor-pointer">
                  {isRecording ? 'Recording' : 'Record'}
                </Label>
                <Switch
                  id="recording-toggle"
                  checked={isRecording}
                  onCheckedChange={setIsRecording}
                  className="scale-75"
                />
              </div>
              <Button
                variant={isMuted ? 'destructive' : 'outline'}
                size="icon"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button
                variant={isSpeakerOn ? 'outline' : 'secondary'}
                size="icon"
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              >
                {isSpeakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button
                variant="destructive"
                onClick={onEndCall}
                className="ml-2"
              >
                <PhoneOff className="h-4 w-4 mr-2" />
                End Call
              </Button>
            </div>
          </div>
        </div>

        {/* Live transcript rail */}
        {(transcription.isTranscribing || transcription.segments.length > 0) && (
          <div className="mt-4 p-3 rounded-md border bg-background/60 max-h-40 overflow-y-auto text-sm space-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Live transcript · ElevenLabs Scribe
              </span>
              {saveVoiceLog && (
                <Badge variant="outline" className="text-[10px]">
                  <Circle className="h-2 w-2 mr-1 fill-red-500 text-red-500" /> Voice log saving
                </Badge>
              )}
            </div>
            {transcription.segments.length === 0 && transcription.isTranscribing && (
              <p className="text-xs text-muted-foreground italic">Listening… first segment arrives after ~15s.</p>
            )}
            {transcription.segments.map((s) => (
              <p key={`${s.segment_index}-${s.id ?? 'x'}`} className="leading-relaxed">
                <span className="text-[10px] text-muted-foreground mr-2">#{s.segment_index + 1}</span>
                {s.transcript_text}
              </p>
            ))}
            {transcription.interimError && (
              <p className="text-xs text-destructive">{transcription.interimError}</p>
            )}
          </div>
        )}

      </CardContent>
    </Card>

  );
};
