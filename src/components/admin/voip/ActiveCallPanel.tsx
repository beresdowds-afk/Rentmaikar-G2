import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Phone,
  PhoneOff,
  PhoneForwarded,
  Users,
  Mic,
  MicOff,
  Volume2,
  Volume1,
  VolumeX,
  Circle,
  FileText,
  Loader2,
  Pause,
  Play,
  MessageSquare,
} from 'lucide-react';
import type { VoIPCall } from '@/types/voip';
import { formatPhoneForDisplay } from '@/types/voip';
import { useCallTranscription } from '@/hooks/useCallTranscription';
import { useRegion } from '@/contexts/RegionContext';
import { InCallAccentMorphHUD } from './InCallAccentMorphHUD';
import type { AccentConversionAgent } from '@/hooks/useAccentConversionAgent';
import { useToast } from '@/hooks/use-toast';

interface ActiveCallPanelProps {
  call: VoIPCall;
  onEndCall: () => void;
  /** Live device state — supplied by the call centre softphone when available. */
  isMuted?: boolean;
  onToggleMute?: () => void;
  isSpeakerOn?: boolean;
  onToggleSpeaker?: () => void;
  speakerVolume?: number;
  onVolumeChange?: (vol: number) => void;
  onTestSound?: () => void;
  /** Live American-accent conversion agent for this call. */
  accentAgent?: AccentConversionAgent;
  onOpenMessageComposer?: (payload: { recipient: string; templateId?: string }) => void;
}

export const ActiveCallPanel = ({
  call,
  onEndCall,
  isMuted: mutedProp,
  onToggleMute,
  isSpeakerOn: speakerProp,
  onToggleSpeaker,
  speakerVolume = 80,
  onVolumeChange,
  onTestSound,
  accentAgent,
  onOpenMessageComposer,
}: ActiveCallPanelProps) => {
  const { toast } = useToast();
  const [duration, setDuration] = useState(0);
  const [localMuted, setLocalMuted] = useState(false);
  const [localSpeakerOn, setLocalSpeakerOn] = useState(true);
  const isMuted = mutedProp ?? localMuted;
  const isSpeakerOn = speakerProp ?? localSpeakerOn;
  const [isRecording, setIsRecording] = useState(false);
  const [saveVoiceLog, setSaveVoiceLog] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('201');
  const [transferType, setTransferType] = useState<'blind' | 'warm'>('blind');
  const [disposition, setDisposition] = useState('Resolved');

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

  const handleToggleHold = () => {
    setIsHeld(!isHeld);
    toast({
      title: isHeld ? 'Call Resumed' : 'Call Placed on Hold',
      description: isHeld
        ? 'Caller reconnected to softphone session.'
        : 'Hold music streaming to caller.',
    });
  };

  const handleExecuteTransfer = () => {
    setIsTransferOpen(false);
    toast({
      title: `${transferType === 'blind' ? 'Blind' : 'Warm'} Transfer Initiated`,
      description: `Transferring active call to Extension ${transferTarget}.`,
    });
  };

  return (
    <Card className="border-green-500 bg-green-500/5 shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Call Status Icon */}
            <div className="relative">
              <div
                className={`p-3 rounded-full ${
                  isHeld
                    ? 'bg-amber-500'
                    : call.status === 'in-progress'
                    ? 'bg-green-500'
                    : 'bg-yellow-500'
                } text-white`}
              >
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
                <Badge className={`${isHeld ? 'bg-amber-500' : statusColors[call.status]} text-white`}>
                  {isHeld ? 'On Hold' : call.status === 'ringing' ? 'Ringing...' : 'In Progress'}
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

          {/* Duration & In-Call Softphone Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-2xl font-mono font-bold text-green-600 mr-2">
              {formatDuration(duration)}
            </div>

            {/* In-Call Speaker Volume Slider */}
            {onVolumeChange && (
              <div className="flex items-center gap-2 bg-background px-2.5 py-1 rounded-md border text-xs">
                {speakerVolume === 0 ? (
                  <VolumeX className="h-3.5 w-3.5 text-destructive" />
                ) : speakerVolume < 40 ? (
                  <Volume1 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-primary" />
                )}
                <Slider
                  value={[speakerVolume]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => onVolumeChange(v[0])}
                  className="w-20 cursor-pointer"
                />
                <span className="font-mono text-[11px] w-7 text-right">{speakerVolume}%</span>
              </div>
            )}

            {/* Hold Button */}
            <Button
              variant={isHeld ? 'default' : 'outline'}
              size="sm"
              className={`gap-1.5 h-8 text-xs ${isHeld ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}
              onClick={handleToggleHold}
            >
              {isHeld ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {isHeld ? 'Resume' : 'Hold'}
            </Button>

            {/* Transfer Button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setIsTransferOpen(true)}
            >
              <PhoneForwarded className="h-3.5 w-3.5" /> Transfer
            </Button>

            {/* Mute Button */}
            <Button
              variant={isMuted ? 'destructive' : 'outline'}
              size="icon"
              className="h-8 w-8"
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              onClick={() => (onToggleMute ? onToggleMute() : setLocalMuted(!isMuted))}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            {/* Speaker Toggle */}
            <Button
              variant={isSpeakerOn ? 'outline' : 'secondary'}
              size="icon"
              className="h-8 w-8"
              aria-label={isSpeakerOn ? 'Switch to earpiece' : 'Switch to speaker'}
              onClick={() => (onToggleSpeaker ? onToggleSpeaker() : setLocalSpeakerOn(!isSpeakerOn))}
            >
              {isSpeakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>

            {/* End Call */}
            <Button variant="destructive" size="sm" onClick={onEndCall} className="h-8 gap-1.5">
              <PhoneOff className="h-3.5 w-3.5" /> End Call
            </Button>
          </div>
        </div>

        {/* Mid-Row: Transcription & Recording Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background">
              {transcription.isTranscribing ? (
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
              ) : (
                <FileText className="h-3 w-3 text-muted-foreground" />
              )}
              <Label htmlFor="transcribe-toggle" className="text-xs cursor-pointer">
                {transcription.isTranscribing ? 'Transcribing' : 'ElevenLabs Scribe'}
              </Label>
              <Switch
                id="transcribe-toggle"
                checked={transcription.isTranscribing}
                onCheckedChange={(on) => (on ? transcription.start() : transcription.stop())}
                className="scale-75"
              />
            </div>

            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background">
              <Circle
                className={`h-3 w-3 ${
                  isRecording ? 'text-red-500 fill-red-500 animate-pulse' : 'text-muted-foreground'
                }`}
              />
              <Label htmlFor="recording-toggle" className="text-xs cursor-pointer">
                {isRecording ? 'Recording Active' : 'Record Audio'}
              </Label>
              <Switch
                id="recording-toggle"
                checked={isRecording}
                onCheckedChange={setIsRecording}
                className="scale-75"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Call Disposition:</span>
            <Select value={disposition} onValueChange={setDisposition}>
              <SelectTrigger className="h-7 text-xs w-44 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Resolved">Resolved / Complete</SelectItem>
                <SelectItem value="Booking Inquiry">Booking Inquiry</SelectItem>
                <SelectItem value="Payment Follow-up">Payment Default Follow-up</SelectItem>
                <SelectItem value="Roadside Breakdown">Roadside Breakdown</SelectItem>
                <SelectItem value="Voicemail Left">Voicemail Left</SelectItem>
                <SelectItem value="Escalated">Escalated to Supervisor</SelectItem>
              </SelectContent>
            </Select>

            {onOpenMessageComposer && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 text-green-600 border-green-500/30 hover:bg-green-500/10"
                onClick={() => {
                  const targetNum = call.participants?.[0]?.phone_number || '+16085489220';
                  onOpenMessageComposer({
                    recipient: targetNum,
                    templateId: 'self_service_menu',
                  });
                }}
              >
                <MessageSquare className="h-3 w-3" /> WhatsApp Follow-Up
              </Button>
            )}
          </div>
        </div>

        {/* Live transcript rail */}
        {(transcription.isTranscribing || transcription.segments.length > 0) && (
          <div className="p-3 rounded-md border bg-background/60 max-h-36 overflow-y-auto text-xs space-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Live transcript · ElevenLabs Scribe
              </span>
            </div>
            {transcription.segments.length === 0 && transcription.isTranscribing && (
              <p className="text-xs text-muted-foreground italic">Listening… first segment arrives after ~15s.</p>
            )}
            {transcription.segments.map((s) => (
              <p key={`${s.segment_index}-${s.id ?? 'x'}`} className="leading-relaxed">
                <span className="text-[10px] text-muted-foreground mr-2 font-mono">#{s.segment_index + 1}</span>
                {s.transcript_text}
              </p>
            ))}
          </div>
        )}

        {/* Real-time American accent conversion HUD */}
        {accentAgent && <InCallAccentMorphHUD agent={accentAgent} />}

        {/* Call Transfer Dialog */}
        <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <PhoneForwarded className="h-5 w-5 text-primary" />
                Transfer Active Call
              </DialogTitle>
              <DialogDescription className="text-xs">
                Seamlessly transfer this caller to an internal extension, staff ring group, or external DID.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Transfer Method</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={transferType === 'blind' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setTransferType('blind')}
                  >
                    Blind Transfer (Immediate)
                  </Button>
                  <Button
                    type="button"
                    variant={transferType === 'warm' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setTransferType('warm')}
                  >
                    Warm Transfer (Consult First)
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Destination Extension or Queue</Label>
                <Select value={transferTarget} onValueChange={setTransferTarget}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="101">Ext 101 - Olusola Adebayo (Admin Lead)</SelectItem>
                    <SelectItem value="102">Ext 102 - Eastforte Operations (Admin Supervisor)</SelectItem>
                    <SelectItem value="201">Ext 201 - Sarah Jenkins (Admin Assistant - Driver Desk)</SelectItem>
                    <SelectItem value="202">Ext 202 - Michael Obi (Admin Assistant - Owner Fleet)</SelectItem>
                    <SelectItem value="203">Ext 203 - Amara Nwosu (Admin Assistant - KYC Desk)</SelectItem>
                    <SelectItem value="301">Ext 301 - David Vance (IoT Roadside Rescue)</SelectItem>
                    <SelectItem value="queue_general">Queue: General Admin Assistant Queue</SelectItem>
                    <SelectItem value="queue_emergency">Queue: Emergency Roadside Rescue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setIsTransferOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleExecuteTransfer}>
                Complete Transfer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
