import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Headphones, Mic, RefreshCw, Volume2 } from 'lucide-react';

interface DeviceOption {
  deviceId: string;
  label: string;
}

/**
 * Interactive audio hardware diagnostics for the call centre: pick the input
 * and output device, watch a live microphone level meter and play a speaker
 * test chime before dialling.
 */
export function AudioHardwareTester() {
  const [inputs, setInputs] = useState<DeviceOption[]>([]);
  const [outputs, setOutputs] = useState<DeviceOption[]>([]);
  const [inputId, setInputId] = useState<string>('default');
  const [outputId, setOutputId] = useState<string>('default');
  const [level, setLevel] = useState(0);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({ deviceId: d.deviceId || 'default', label: d.label || `Microphone ${i + 1}` })),
      );
      setOutputs(
        devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d, i) => ({ deviceId: d.deviceId || 'default', label: d.label || `Speaker ${i + 1}` })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to list audio devices');
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
      stopListening();
    };
  }, [loadDevices, stopListening]);

  const startListening = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputId && inputId !== 'default' ? { deviceId: { exact: inputId } } : true,
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          peak = Math.max(peak, Math.abs(buffer[i] - 128) / 128);
        }
        setLevel(Math.min(100, Math.round(peak * 140)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setListening(true);
      // Labels only become available once permission is granted.
      void loadDevices();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Microphone unavailable: ${err.message}`
          : 'Microphone unavailable. Allow access in your browser settings.',
      );
      stopListening();
    }
  }, [inputId, loadDevices, stopListening]);

  const playTestTone = useCallback(async () => {
    setError(null);
    try {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      osc.stop(ctx.currentTime + 1);

      const el = new Audio();
      el.srcObject = dest.stream;
      const sinkCapable = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (outputId && outputId !== 'default' && typeof sinkCapable.setSinkId === 'function') {
        await sinkCapable.setSinkId(outputId);
      }
      await el.play();
      window.setTimeout(() => {
        el.pause();
        el.srcObject = null;
        void ctx.close().catch(() => undefined);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? `Speaker test failed: ${err.message}` : 'Speaker test failed');
    }
  }, [outputId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Headphones className="h-4 w-4" />
          Audio hardware tester
        </CardTitle>
        <CardDescription>
          Check your microphone level and speaker routing before placing a call.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Microphone</Label>
            <Select value={inputId} onValueChange={setInputId}>
              <SelectTrigger><SelectValue placeholder="System default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">System default</SelectItem>
                {inputs
                  .filter((d) => d.deviceId !== 'default')
                  .map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>{d.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Speaker / output</Label>
            <Select value={outputId} onValueChange={setOutputId}>
              <SelectTrigger><SelectValue placeholder="System default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">System default</SelectItem>
                {outputs
                  .filter((d) => d.deviceId !== 'default')
                  .map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>{d.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Input level</span>
            <span>{level}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-75"
              style={{ width: `${level}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={listening ? 'destructive' : 'default'}
            size="sm"
            className="gap-2"
            onClick={() => (listening ? stopListening() : void startListening())}
          >
            <Mic className="h-4 w-4" />
            {listening ? 'Stop mic test' : 'Test microphone'}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void playTestTone()}>
            <Volume2 className="h-4 w-4" />
            Play speaker chime
          </Button>
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => void loadDevices()}>
            <RefreshCw className="h-4 w-4" />
            Re-scan devices
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default AudioHardwareTester;
