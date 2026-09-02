import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, Volume2, VolumeX, Headphones, Bluetooth, CheckCircle2, AlertTriangle, Play, Square, Activity, Loader2 } from 'lucide-react';
import { useVoiceDevice } from '@/hooks/useVoiceDevice';
import { ensureMediaPermissions, unlockAudioOutput } from '@/lib/media-permissions';
import { AudioDiagnosticsPanel } from '@/components/voice/AudioDiagnosticsPanel';
import { toast } from 'sonner';

interface AudioHardwareTesterProps {
  voiceDevice: ReturnType<typeof useVoiceDevice>;
  className?: string;
}

export const AudioHardwareTester = ({ voiceDevice, className = '' }: AudioHardwareTesterProps) => {
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isPlayingTestTone, setIsPlayingTestTone] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);

  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Stop mic testing when unmounting
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const handleRequestMic = async () => {
    setIsRequestingMic(true);
    try {
      const ok = await ensureMediaPermissions();
      await voiceDevice.reinitializeAudio();
      if (ok) {
        toast.success('Microphone access granted');
      } else {
        toast.error('Microphone access was denied or unavailable in your browser.');
      }
    } finally {
      setIsRequestingMic(false);
    }
  };

  const startMicTest = async () => {
    try {
      await ensureMediaPermissions();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsTestingMic(true);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
      toast.info('Microphone test started. Speak to see live sound levels.');
    } catch (e: any) {
      toast.error('Could not access microphone for testing: ' + (e?.message || String(e)));
      setIsTestingMic(false);
    }
  };

  const stopMicTest = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsTestingMic(false);
    setMicLevel(0);
  };

  const playSpeakerTestTone = async () => {
    if (isPlayingTestTone) return;
    setIsPlayingTestTone(true);
    try {
      await unlockAudioOutput();
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();

      // Play pleasant 2-tone melodic chime: C5 (523.25Hz) then G5 (783.99Hz)
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.01, now);
      gain1.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.2);
      gain2.gain.setValueAtTime(0.01, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.25, now + 0.25);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 0.65);

      setTimeout(() => {
        ctx.close().catch(() => {});
        setIsPlayingTestTone(false);
        toast.success('Speaker test chime finished. You should have heard two audio tones.');
      }, 700);
    } catch (e: any) {
      toast.error('Speaker test failed: ' + (e?.message || String(e)));
      setIsPlayingTestTone(false);
    }
  };

  return (
    <Card className={`border-blue-500/20 bg-blue-500/5 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Headphones className="h-4 w-4 text-blue-600" />
              User Device Audio (Speakers & Microphone)
            </CardTitle>
            <CardDescription className="text-xs">
              VoIP calls use your device's physical speakers and microphone. Test and adjust routing below.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={voiceDevice.micPermission === 'granted' ? 'default' : 'secondary'} className="text-xs">
              {voiceDevice.micPermission === 'granted' ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Mic Granted
                </span>
              ) : voiceDevice.micPermission === 'denied' ? (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-400" /> Mic Blocked
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Mic className="h-3 w-3" /> Mic Needs Access
                </span>
              )}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {voiceDevice.outputRoute === 'speaker' ? '🔊 Speakers' : voiceDevice.outputRoute === 'bluetooth' ? '🎧 Bluetooth' : voiceDevice.outputRoute === 'earpiece' ? '📱 Earpiece' : '🔊 System Default'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Microphone Card Section */}
          <div className="rounded-lg border bg-background p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-full ${voiceDevice.micPermission === 'granted' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                  {voiceDevice.micPermission === 'granted' ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">Device Microphone</p>
                  <p className="text-xs text-muted-foreground">Voice input for customer calls</p>
                </div>
              </div>
              {voiceDevice.micPermission !== 'granted' ? (
                <Button size="sm" variant="outline" onClick={handleRequestMic} disabled={isRequestingMic} className="h-8 text-xs">
                  {isRequestingMic ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Mic className="h-3 w-3 mr-1" />}
                  Enable Mic
                </Button>
              ) : (
                <Badge variant="outline" className="text-emerald-600 bg-emerald-50 text-[11px]">Ready</Badge>
              )}
            </div>

            {/* Mic Live Level Indicator */}
            {isTestingMic ? (
              <div className="space-y-1.5 p-2 rounded border bg-muted/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Activity className="h-3 w-3 text-emerald-500 animate-pulse" /> Live Sound Level:
                  </span>
                  <span className="font-mono font-medium">{micLevel}%</span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${Math.max(5, micLevel)}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              {isTestingMic ? (
                <Button size="sm" variant="secondary" onClick={stopMicTest} className="h-8 text-xs flex-1">
                  <Square className="h-3 w-3 mr-1 text-red-500" /> Stop Mic Test
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={startMicTest} className="h-8 text-xs flex-1">
                  <Play className="h-3 w-3 mr-1 text-emerald-500" /> Test Microphone
                </Button>
              )}
              <Button
                size="sm"
                variant={voiceDevice.isMuted ? 'destructive' : 'ghost'}
                onClick={voiceDevice.toggleMute}
                className="h-8 text-xs"
                title={voiceDevice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {voiceDevice.isMuted ? <MicOff className="h-3.5 w-3.5 mr-1" /> : <Mic className="h-3.5 w-3.5 mr-1" />}
                {voiceDevice.isMuted ? 'Muted' : 'Live'}
              </Button>
            </div>
          </div>

          {/* Speaker Card Section */}
          <div className="rounded-lg border bg-background p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-blue-500/10 text-blue-600">
                  <Volume2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Device Speakers</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">{voiceDevice.outputLabel || 'System Output'}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={playSpeakerTestTone}
                disabled={isPlayingTestTone}
                className="h-8 text-xs"
              >
                {isPlayingTestTone ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Volume2 className="h-3 w-3 mr-1 text-blue-500" />}
                Test Speakers
              </Button>
            </div>

            {/* Audio Route Selector */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Audio Output Destination</Label>
              <Select
                value={voiceDevice.outputRoute}
                onValueChange={(val) => voiceDevice.selectOutputRoute(val as any)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select output device" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="speaker">🔊 Loudspeaker / Main Speakers</SelectItem>
                  <SelectItem value="bluetooth">🎧 Bluetooth Headset / Earbuds</SelectItem>
                  <SelectItem value="earpiece">📱 Phone Receiver / Earpiece</SelectItem>
                  <SelectItem value="default">⚙️ System Default Device</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Bluetooth className="h-3 w-3" /> Auto-switch to headset
              </span>
              <Switch
                checked={voiceDevice.preferences.autoSwitchToHeadset}
                onCheckedChange={voiceDevice.setAutoSwitchToHeadset}
                className="scale-75"
              />
            </div>
          </div>
        </div>

        {/* Audio Diagnostics Collapsible */}
        <div className="flex items-center justify-between text-xs pt-1 border-t">
          <Button
            variant="link"
            size="sm"
            onClick={() => setShowDiagnostics(v => !v)}
            className="h-auto p-0 text-xs text-muted-foreground"
          >
            {showDiagnostics ? 'Hide' : 'Show'} detailed audio hardware diagnostics
          </Button>
          <span className="text-[11px] text-muted-foreground">
            WebRTC Twilio Voice Engine Ready
          </span>
        </div>
        {showDiagnostics && (
          <AudioDiagnosticsPanel className="mt-2 pt-2 border-t" />
        )}
      </CardContent>
    </Card>
  );
};
