import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Headphones,
  Mic,
  RefreshCw,
  Volume2,
  CheckCircle2,
  ShieldAlert,
  VolumeX,
  Radio,
} from 'lucide-react';
import {
  getMicPermissionState,
  requestMicrophoneAccess,
  unlockAudioOutput,
  watchMicPermission,
  type MicPermissionState,
} from '@/lib/media-permissions';

interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface AudioHardwareTesterProps {
  compact?: boolean;
  onReadyChange?: (isReady: boolean) => void;
}

/**
 * Interactive audio hardware diagnostics for the call centre & softphone:
 * pick the input and output device, watch a live microphone level meter,
 * and play a speaker test chime before dialling.
 */
export function AudioHardwareTester({ compact = false, onReadyChange }: AudioHardwareTesterProps) {
  const [inputs, setInputs] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);
  const [inputId, setInputId] = useState<string>('default');
  const [outputId, setOutputId] = useState<string>('default');
  const [level, setLevel] = useState(0);
  const [listening, setListening] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permState, setPermState] = useState<MicPermissionState>('unknown');
  const [isRequestingPerm, setIsRequestingPerm] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopListening = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setListening(false);
    setLevel(0);
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
      const currentPerm = await getMicPermissionState();
      setPermState(currentPerm);
      onReadyChange?.(currentPerm === 'granted');

      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({
            deviceId: d.deviceId || 'default',
            label: d.label || `Microphone ${i + 1}`,
          })),
      );
      setOutputs(
        devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d, i) => ({
            deviceId: d.deviceId || 'default',
            label: d.label || `Speaker ${i + 1}`,
          })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to list audio devices');
    }
  }, [onReadyChange]);

  useEffect(() => {
    void loadDevices();
    const unsub = watchMicPermission((state) => {
      setPermState(state);
      onReadyChange?.(state === 'granted');
      void loadDevices();
    });

    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
    return () => {
      unsub();
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
      stopListening();
    };
  }, [loadDevices, onReadyChange, stopListening]);

  const handleRequestPermission = async () => {
    setIsRequestingPerm(true);
    setError(null);
    try {
      const res = await requestMicrophoneAccess();
      setPermState(res.state);
      onReadyChange?.(res.success);
      if (!res.success) {
        setError(res.error || 'Microphone access denied.');
      } else {
        await loadDevices();
      }
    } finally {
      setIsRequestingPerm(false);
    }
  };

  const startListening = useCallback(async () => {
    setError(null);
    try {
      await unlockAudioOutput();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputId && inputId !== 'default' ? { deviceId: { exact: inputId } } : true,
      });
      streamRef.current = stream;

      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          peak = Math.max(peak, Math.abs(buffer[i] - 128) / 128);
        }
        setLevel(Math.min(100, Math.round(peak * 160)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setListening(true);
      setPermState('granted');
      onReadyChange?.(true);
      void loadDevices();
    } catch (err: unknown) {
      const e = err as Error;
      const isDenied = e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError';
      if (isDenied) setPermState('denied');
      setError(
        isDenied
          ? 'Microphone access blocked. Please click the lock or settings icon in your browser address bar to allow microphone access.'
          : `Microphone unavailable: ${e.message}`,
      );
      stopListening();
    }
  }, [inputId, loadDevices, onReadyChange, stopListening]);

  const playTestTone = useCallback(async () => {
    setError(null);
    setIsPlayingChime(true);
    try {
      await unlockAudioOutput();
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Dual-tone chime (440Hz -> 880Hz pleasant bell)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1046.5, now + 0.15); // C6

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

      osc1.connect(gain);
      osc2.connect(gain);

      // Play through default Web Audio destination
      gain.connect(ctx.destination);

      // Also support setSinkId if browser and element support routing to chosen device
      try {
        const dest = ctx.createMediaStreamDestination();
        gain.connect(dest);
        const el = new Audio();
        el.srcObject = dest.stream;
        const sinkCapable = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
        if (outputId && outputId !== 'default' && typeof sinkCapable.setSinkId === 'function') {
          await sinkCapable.setSinkId(outputId).catch(() => undefined);
        }
        await el.play().catch(() => undefined);
        window.setTimeout(() => {
          el.pause();
          el.srcObject = null;
        }, 1100);
      } catch {
        // Fallback to ctx.destination was already connected
      }

      osc1.start(now);
      osc1.stop(now + 0.5);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.95);

      window.setTimeout(() => {
        void ctx.close().catch(() => undefined);
        setIsPlayingChime(false);
      }, 1100);
    } catch (err: unknown) {
      setIsPlayingChime(false);
      const e = err as Error;
      setError(`Speaker test failed: ${e.message}`);
    }
  }, [outputId]);

  const permissionBadge = (
    <div className="flex items-center gap-1.5">
      {permState === 'granted' ? (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] gap-1 py-0.5">
          <CheckCircle2 className="h-3 w-3" /> Mic Granted
        </Badge>
      ) : permState === 'denied' ? (
        <Badge variant="destructive" className="text-[10px] gap-1 py-0.5">
          <ShieldAlert className="h-3 w-3" /> Mic Blocked
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-[10px] gap-1 py-0.5">
          <Radio className="h-3 w-3 text-amber-500" /> Permission Needed
        </Badge>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3 text-xs shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Headphones className="h-3.5 w-3.5 text-primary" />
            <span>Audio & Mic Diagnostics</span>
          </div>
          {permissionBadge}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Mic Input</Label>
            <Select value={inputId} onValueChange={setInputId}>
              <SelectTrigger className="h-7 text-[11px] bg-background">
                <SelectValue placeholder="Default Mic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" className="text-xs">System Default</SelectItem>
                {inputs
                  .filter((d) => d.deviceId !== 'default')
                  .map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground">Speaker Output</Label>
            <Select value={outputId} onValueChange={setOutputId}>
              <SelectTrigger className="h-7 text-[11px] bg-background">
                <SelectValue placeholder="Default Speaker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" className="text-xs">System Default</SelectItem>
                {outputs
                  .filter((d) => d.deviceId !== 'default')
                  .map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Level meter */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Input Volume Level</span>
            <span className="font-mono">{level}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-75 ${
                level > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${level}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {permState !== 'granted' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRequestingPerm}
              onClick={handleRequestPermission}
              className="h-7 text-[11px] px-2 gap-1 border-primary/40 text-primary"
            >
              <Mic className="h-3 w-3" />
              {isRequestingPerm ? 'Requesting...' : 'Allow Mic'}
            </Button>
          )}

          <Button
            type="button"
            variant={listening ? 'destructive' : 'secondary'}
            size="sm"
            onClick={() => (listening ? stopListening() : void startListening())}
            className="h-7 text-[11px] px-2 gap-1"
          >
            <Mic className="h-3 w-3" />
            {listening ? 'Stop Mic' : 'Test Mic'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPlayingChime}
            onClick={() => void playTestTone()}
            className="h-7 text-[11px] px-2 gap-1"
          >
            <Volume2 className="h-3 w-3" />
            {isPlayingChime ? 'Playing...' : 'Test Speaker'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadDevices()}
            className="h-7 w-7 p-0 ml-auto"
            title="Scan audio devices"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="py-1.5 px-2 text-[11px]">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Headphones className="h-4 w-4 text-primary" />
            Audio Hardware & Telephony Diagnostics
          </CardTitle>
          {permissionBadge}
        </div>
        <CardDescription>
          Verify your headset, microphone level, and speaker output routing before initiating or receiving VoIP calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Microphone Input</Label>
            <Select value={inputId} onValueChange={setInputId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" className="text-xs">System default</SelectItem>
                {inputs
                  .filter((d) => d.deviceId !== 'default')
                  .map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Speaker / Earpiece Output</Label>
            <Select value={outputId} onValueChange={setOutputId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" className="text-xs">System default</SelectItem>
                {outputs
                  .filter((d) => d.deviceId !== 'default')
                  .map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Live level meter */}
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Live Microphone Level</span>
            <span className="font-mono">{level}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-75 ${
                level > 75 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${level}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Speak normally to verify that your voice registers cleanly on the level meter.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {permState !== 'granted' && (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isRequestingPerm}
              onClick={handleRequestPermission}
              className="gap-2 text-xs font-semibold"
            >
              <Mic className="h-3.5 w-3.5" />
              {isRequestingPerm ? 'Requesting Permission...' : 'Grant Microphone Access'}
            </Button>
          )}

          <Button
            type="button"
            variant={listening ? 'destructive' : 'secondary'}
            size="sm"
            className="gap-2 text-xs"
            onClick={() => (listening ? stopListening() : void startListening())}
          >
            <Mic className="h-4 w-4" />
            {listening ? 'Stop Mic Level Test' : 'Test Microphone Level'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPlayingChime}
            className="gap-2 text-xs"
            onClick={() => void playTestTone()}
          >
            <Volume2 className="h-4 w-4" />
            {isPlayingChime ? 'Playing Chime...' : 'Play Speaker Test Chime'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-xs ml-auto"
            onClick={() => void loadDevices()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-scan Devices
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default AudioHardwareTester;
