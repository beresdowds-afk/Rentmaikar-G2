import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, PhoneOff, Users, Mic, MicOff, Volume2, VolumeX, Circle, FileText, Loader2, Bluetooth, Headphones, ShieldAlert, Sparkles } from 'lucide-react';
import type { VoIPCall } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';
import { useCallTranscription } from '@/hooks/useCallTranscription';
import { useRegion } from '@/contexts/RegionContext';
import { useVoiceDevice } from '@/hooks/useVoiceDevice';
import { useAccentConversionAgent, UseAccentConversionAgentResult } from '@/hooks/useAccentConversionAgent';
import { InCallAccentMorphHUD } from './InCallAccentMorphHUD';
import { toast } from 'sonner';

interface ActiveCallPanelProps {
  call: VoIPCall;
  onEndCall: () => void | Promise<void>;
  voiceDevice?: ReturnType<typeof useVoiceDevice>;
  accentAgent?: UseAccentConversionAgentResult;
}

export const ActiveCallPanel = ({ call, onEndCall, voiceDevice, accentAgent: externalAccentAgent }: ActiveCallPanelProps) => {
  const [duration, setDuration] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [fallbackMuted, setFallbackMuted] = useState(false);
  const [fallbackSpeaker, setFallbackSpeaker] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [saveVoiceLog, setSaveVoiceLog] = useState(false);
  const [showAccentMorphHUD, setShowAccentMorphHUD] = useState(true);
  const { country } = useRegion();

  const internalAccentAgent = useAccentConversionAgent();
  const accentAgent = externalAccentAgent || internalAccentAgent;

  // If accent conversion agent is speaking and mic ducking is enabled, suppress raw mic
  const isDucked = accentAgent.duckMic;
  const isMuted = isDucked || (voiceDevice ? voiceDevice.isMuted : fallbackMuted);
  const isSpeakerOn = voiceDevice ? voiceDevice.isSpeakerphone : fallbackSpeaker;

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

  const handleToggleMute = () => {
    if (voiceDevice) {
      voiceDevice.toggleMute();
      toast.info(voiceDevice.isMuted ? 'Microphone unmuted' : 'Microphone muted');
    } else {
      setFallbackMuted(!fallbackMuted);
    }
  };

  const handleToggleSpeaker = async () => {
    if (voiceDevice) {
      await voiceDevice.toggleSpeakerphone();
    } else {
      setFallbackSpeaker(!fallbackSpeaker);
    }
  };

  const handleEndCall = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      if (voiceDevice && (voiceDevice.status === 'on-call' || voiceDevice.status === 'connecting')) {
        voiceDevice.hangUp();
      }
      await onEndCall();
      toast.success('Call terminated successfully');
    } catch (e: any) {
      toast.error('Call ended with error: ' + (e?.message || 'Check connection'));
    } finally {
      setIsEnding(false);
    }
  };

  const statusColors: Record<string, string> = {
    ringing: 'bg-yellow-500',
    'in-progress': 'bg-green-500',
  };

  return (
    <Card className="border-2 border-red-500/40 bg-gradient-to-r from-red-500/5 via-green-500/5 to-transparent shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Call Status Icon */}
            <div className="relative">
              <div className={`p-3 rounded-full ${call.status === 'in-progress' ? 'bg-green-500' : 'bg-yellow-500'} text-white shadow-sm`}>
                {call.call_type === 'group' ? (
                  <Users className="h-6 w-6" />
                ) : (
                  <Phone className="h-6 w-6" />
                )}
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${call.status === 'in-progress' ? 'bg-green-400' : 'bg-yellow-400'} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${call.status === 'in-progress' ? 'bg-green-500' : 'bg-yellow-500'}`} />
              </span>
            </div>

            {/* Call Info */}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-lg">
                  {call.call_type === 'group' ? 'Conference Call' : 'Active VoIP Call'}
                </span>
                <Badge className={`${statusColors[call.status] || 'bg-green-500'} text-white`}>
                  {call.status === 'ringing' ? 'Ringing...' : 'Connected'}
                </Badge>
                <Badge variant="outline">
                  {call.region === 'USA' ? '🇺🇸' : '🇳🇬'} {call.region}
                </Badge>
                {voiceDevice && (
                  <Badge variant={isMuted ? 'destructive' : 'secondary'} className="text-xs">
                    {isMuted ? (
                      <span className="flex items-center gap-1">
                        <MicOff className="h-3 w-3" /> Mic Muted
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-600 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Mic Active
                      </span>
                    )}
                  </Badge>
                )}
                {voiceDevice?.outputLabel && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    🔊 {voiceDevice.outputLabel}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {call.participants && call.participants.length > 0 ? (
                  call.participants.map((p, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {p.display_name || formatPhoneForDisplay(p.phone_number)}
                    </span>
                  ))
                ) : (
                  <span>Live VoIP audio session</span>
                )}
              </div>
            </div>
          </div>

          {/* Duration & Audio Controls */}
          <div className="flex items-center justify-between lg:justify-end gap-3 flex-wrap">
            {/* Live Duration */}
            <div className="text-2xl font-mono font-bold text-green-600 bg-background px-3 py-1 rounded-md border">
              {formatDuration(duration)}
            </div>

            {/* Hardware Audio Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Microphone hardware mute toggle */}
              <Button
                variant={isMuted ? 'destructive' : 'outline'}
                size="sm"
                onClick={handleToggleMute}
                className="h-9 px-3"
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="h-4 w-4 mr-1.5" /> : <Mic className="h-4 w-4 mr-1.5" />}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </Button>

              {/* Speakerphone / Output destination toggle */}
              <Button
                variant={isSpeakerOn ? 'secondary' : 'outline'}
                size="sm"
                onClick={handleToggleSpeaker}
                className="h-9 px-3"
                title="Toggle speakers on/off"
              >
                {isSpeakerOn ? <Volume2 className="h-4 w-4 mr-1.5 text-blue-600" /> : <VolumeX className="h-4 w-4 mr-1.5" />}
                <span>{isSpeakerOn ? 'Speaker' : 'Earpiece'}</span>
              </Button>

              {/* Output Route Dropdown if VoiceDevice available */}
              {voiceDevice && (
                <Select
                  value={voiceDevice.outputRoute}
                  onValueChange={(v) => voiceDevice.selectOutputRoute(v as any)}
                >
                  <SelectTrigger className="h-9 w-[120px] text-xs">
                    <SelectValue placeholder="Output" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="speaker">🔊 Speakers</SelectItem>
                    <SelectItem value="bluetooth">🎧 Bluetooth</SelectItem>
                    <SelectItem value="earpiece">📱 Earpiece</SelectItem>
                    <SelectItem value="default">⚙️ Default</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Explicit, Prominent CALL END BUTTON */}
              <Button
                variant="destructive"
                size="default"
                onClick={handleEndCall}
                disabled={isEnding}
                id="call-center-end-call-btn"
                className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                title="Terminate active call"
              >
                {isEnding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOff className="h-4 w-4" />
                )}
                <span>End Call</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Extra Call Options Rail (Transcription & Voice Log) */}
        <div className="flex items-center gap-3 pt-2 border-t text-xs flex-wrap">
          {/* Live Transcription Toggle (ElevenLabs Scribe) */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border bg-background">
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

          {/* Voice log toggle */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border bg-background">
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
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border bg-background">
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

          {/* American Accent Conversion Agent Toggle */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border bg-background">
            <Sparkles className={`h-3 w-3 ${accentAgent.isListening ? 'text-indigo-600 animate-spin' : 'text-muted-foreground'}`} />
            <Label htmlFor="accent-morph-toggle" className="text-xs cursor-pointer font-medium">
              🇺🇸 American Accent Agent
            </Label>
            <Switch
              id="accent-morph-toggle"
              checked={accentAgent.isListening}
              onCheckedChange={accentAgent.toggleAgent}
              className="scale-75"
            />
            {accentAgent.isListening && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAccentMorphHUD(!showAccentMorphHUD)}
                className="h-5 px-1.5 text-[10px] text-indigo-600"
              >
                {showAccentMorphHUD ? 'Hide HUD' : 'Show HUD'}
              </Button>
            )}
          </div>

          <span className="ml-auto text-muted-foreground text-[11px] hidden sm:inline">
            Active audio channel using device speakers and microphone
          </span>
        </div>

        {/* Real-time American Accent Morphing HUD */}
        {(accentAgent.isListening || showAccentMorphHUD) && (
          <InCallAccentMorphHUD agent={accentAgent} isCallActive={true} />
        )}

        {/* Live transcript rail */}
        {(transcription.isTranscribing || transcription.segments.length > 0) && (
          <div className="mt-2 p-3 rounded-md border bg-background/60 max-h-40 overflow-y-auto text-sm space-y-1">
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
