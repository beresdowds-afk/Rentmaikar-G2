import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  Bluetooth,
  Headphones,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Volume1,
  Volume2,
  VolumeX,
  Play,
} from 'lucide-react';
import type { useVoiceDevice } from '@/hooks/useVoiceDevice';

type VoiceDevice = ReturnType<typeof useVoiceDevice>;

const STATUS_LABEL: Record<string, string> = {
  idle: 'Microphone not enabled',
  initializing: 'Preparing audio…',
  ready: 'Ready to call',
  connecting: 'Connecting…',
  'on-call': 'Connected',
  unavailable: 'Unavailable',
};

/**
 * Always-visible audio controls for the call centre: enable the microphone,
 * mute, switch speaker/earpiece output, control speaker volume, test speaker audio,
 * and hang up. These act on the live browser call session (Twilio Voice SDK),
 * not on local UI state.
 */
export function SoftphoneControls({ voice }: { voice: VoiceDevice }) {
  const {
    status,
    error,
    isMuted,
    micPermission,
    permissionBlocked,
    isSpeakerphone,
    outputLabel,
    headsetConnected,
    speakerVolume,
    setSpeakerVolume,
    testSpeakerSound,
    initialize,
    hangUp,
    toggleMute,
    toggleSpeakerphone,
    reinitializeAudio,
  } = voice;

  const onCall = status === 'on-call' || status === 'connecting';
  const busy = status === 'initializing';
  const audioActive = onCall || status === 'ready';

  return (
    <Card className="border shadow-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        {/* Device Status */}
        <div className="flex items-center gap-3 min-w-[200px]">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                onCall ? 'bg-green-500 animate-pulse' : status === 'ready' ? 'bg-emerald-400' : 'bg-muted-foreground/40'
              }`}
              aria-hidden="true"
            />
          )}
          <div className="leading-tight">
            <p className="text-sm font-medium">{STATUS_LABEL[status] ?? status}</p>
            <p className="text-xs text-muted-foreground">{outputLabel}</p>
          </div>
          {headsetConnected && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Bluetooth className="h-3 w-3" /> Headset
            </Badge>
          )}
        </div>

        {/* Speaker Volume Controls */}
        <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border min-w-[230px] max-w-xs flex-1">
          <button
            type="button"
            onClick={() => setSpeakerVolume(speakerVolume === 0 ? 80 : 0)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title={speakerVolume === 0 ? 'Unmute speaker' : 'Mute speaker'}
            aria-label="Speaker volume mute toggle"
          >
            {speakerVolume === 0 ? (
              <VolumeX className="h-4 w-4 text-destructive" />
            ) : speakerVolume < 40 ? (
              <Volume1 className="h-4 w-4 text-primary" />
            ) : (
              <Volume2 className="h-4 w-4 text-primary" />
            )}
          </button>

          <Slider
            value={[speakerVolume]}
            min={0}
            max={100}
            step={1}
            onValueChange={(val) => setSpeakerVolume(val[0])}
            className="w-24 cursor-pointer"
            aria-label="Speaker Volume"
          />

          <span className="text-xs font-mono font-medium text-muted-foreground w-9 text-right">
            {speakerVolume}%
          </span>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={testSpeakerSound}
            title="Test speaker sound"
          >
            <Play className="h-3 w-3 fill-current" />
          </Button>
        </div>

        {/* Mic & Output Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {status === 'idle' || status === 'unavailable' ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void initialize()}
              disabled={busy || permissionBlocked}
            >
              <Headphones className="h-4 w-4" />
              Enable microphone
            </Button>
          ) : null}

          <Button
            variant={isMuted ? 'destructive' : 'outline'}
            size="icon"
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={isMuted}
            title={onCall ? (isMuted ? 'Unmute microphone' : 'Mute microphone') : 'Start calls muted or unmuted'}
            onClick={toggleMute}
            disabled={!audioActive}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          <Button
            variant={isSpeakerphone ? 'default' : 'outline'}
            size="icon"
            aria-label={isSpeakerphone ? 'Switch to earpiece' : 'Switch to speaker'}
            aria-pressed={isSpeakerphone}
            title={isSpeakerphone ? 'Switch to earpiece' : 'Switch to speaker'}
            onClick={() => void toggleSpeakerphone()}
            disabled={busy}
          >
            {isSpeakerphone ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>

          <Button
            variant="outline"
            size="icon"
            aria-label="Re-check audio devices"
            onClick={() => void reinitializeAudio()}
            disabled={busy}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button variant="destructive" size="sm" className="gap-2" onClick={hangUp} disabled={!audioActive}>
            <PhoneOff className="h-4 w-4" />
            End call
          </Button>
        </div>

        {(permissionBlocked || micPermission === 'denied') && (
          <Alert variant="destructive" className="w-full">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Microphone access is blocked. Allow it in your browser's site settings, then press the refresh
              button to re-check.
            </AlertDescription>
          </Alert>
        )}

        {error && !permissionBlocked && (
          <Alert variant="destructive" className="w-full">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default SoftphoneControls;
