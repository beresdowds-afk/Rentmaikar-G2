import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCENT_PERSONAS,
  DEFAULT_ACCENT_SETTINGS,
  type AccentAgentSettings,
  type AccentAgentStatus,
  type AccentPersonaId,
  type AccentTurn,
} from '@/types/accent-conversion';
import { normalizeToAmerican, isSpeakableClause } from '@/lib/accent-conversion/normalizer';
import { AccentAudioEngine } from '@/lib/accent-conversion/audio-engine';
import { logAudioEvent } from '@/lib/audio-diagnostics';

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null;
}

export interface UseAccentConversionAgentOptions {
  /** Called with true while the converted voice speaks, so the raw mic can be ducked. */
  onDuckMicrophone?: (ducked: boolean) => void;
  /** Selected audio output device for the converted voice. */
  sinkId?: string | null;
  callId?: string | null;
}

export function useAccentConversionAgent(options: UseAccentConversionAgentOptions = {}) {
  const { onDuckMicrophone, sinkId = null, callId = null } = options;

  const [settings, setSettings] = useState<AccentAgentSettings>(DEFAULT_ACCENT_SETTINGS);
  const [status, setStatus] = useState<AccentAgentStatus>('idle');
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<AccentTurn[]>([]);
  const [interim, setInterim] = useState('');
  const [level, setLevel] = useState(0);

  const engineRef = useRef<AccentAudioEngine | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const supported = useMemo(() => Boolean(getRecognitionCtor()), []);
  const persona = useMemo(
    () => ACCENT_PERSONAS.find((p) => p.id === settings.personaId) ?? ACCENT_PERSONAS[0],
    [settings.personaId],
  );

  const getEngine = () => {
    if (!engineRef.current) engineRef.current = new AccentAudioEngine();
    return engineRef.current;
  };

  const teardownAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  /** Hard stop — used by both the user control and every safety fallback. */
  const stop = useCallback((reason?: string, asError = false) => {
    activeRef.current = false;
    setIsActive(false);
    try {
      recognitionRef.current?.abort();
    } catch {
      /* recognition already torn down */
    }
    recognitionRef.current = null;
    engineRef.current?.stop();
    onDuckMicrophone?.(false);
    teardownAudio();
    setInterim('');
    if (asError && reason) {
      setError(reason);
      setStatus('error');
      logAudioEvent('routing', `Accent agent paused: ${reason}`, { level: 'warn', detail: { callId } });
    } else {
      setStatus('idle');
    }
  }, [callId, onDuckMicrophone, teardownAudio]);

  /** Synthesise one utterance and log it in the HUD feed. */
  const convertAndSpeak = useCallback(async (spoken: string) => {
    const trimmed = spoken.trim();
    if (!trimmed) return;
    const { text: converted, replacements } = normalizeToAmerican(trimmed);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTurns((prev) => [
      ...prev.slice(-40),
      { id, at: Date.now(), spoken: trimmed, converted, replacements, status: 'converting' },
    ]);
    setStatus('converting');

    const current = settingsRef.current;
    const voice = ACCENT_PERSONAS.find((p) => p.id === current.personaId) ?? ACCENT_PERSONAS[0];

    if (current.duckMicrophone) onDuckMicrophone?.(true);
    setStatus('speaking');
    try {
      await getEngine().speak(converted, {
        voiceId: voice.voiceId,
        speechRate: current.speechRate,
        volume: current.monitorVolume,
        sinkId,
      });
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'spoken' } : t)));
      if (activeRef.current) setStatus('listening');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Voice conversion failed';
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'failed', error: msg } : t)));
      // Safety fallback: a streaming/synthesis failure pauses conversion so the
      // admin's own voice keeps the call going.
      stop(msg, true);
    } finally {
      if (current.duckMicrophone) onDuckMicrophone?.(false);
    }
  }, [onDuckMicrophone, sinkId, stop]);

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(1, avg / 128));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* metering is cosmetic */
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('Live speech capture is not supported in this browser. Use Chrome or Edge.');
      setStatus('error');
      return;
    }

    // Safety: conversion never starts without an explicit microphone grant.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError('Microphone permission is required for accent conversion. Allow access and try again.');
      setStatus('error');
      logAudioEvent('permission', 'Accent agent denied microphone access', { level: 'error', detail: { callId } });
      return;
    }
    streamRef.current = stream;
    startMeter(stream);

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim(interimText);
      if (finalText && isSpeakableClause(finalText, settingsRef.current.clauseStreaming)) {
        void convertAndSpeak(finalText);
      }
    };

    recognition.onerror = (event: any) => {
      const code = event?.error as string | undefined;
      if (code === 'no-speech' || code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        stop('Microphone permission was revoked — accent conversion paused.', true);
        return;
      }
      stop(`Speech capture error (${code ?? 'unknown'}) — accent conversion paused.`, true);
    };

    recognition.onend = () => {
      // Auto-restart while active; a repeated immediate end surfaces as an error.
      if (!activeRef.current) return;
      try {
        recognition.start();
      } catch {
        stop('Speech capture stopped unexpectedly — accent conversion paused.', true);
      }
    };

    recognitionRef.current = recognition;
    activeRef.current = true;
    setIsActive(true);
    setStatus('listening');
    logAudioEvent('routing', 'Accent conversion agent started', { detail: { callId, persona: settingsRef.current.personaId } });
    try {
      recognition.start();
    } catch {
      stop('Could not start speech capture — accent conversion paused.', true);
    }
  }, [callId, convertAndSpeak, startMeter, stop]);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else void start();
  }, [start, stop]);

  /** Speak a canned phrase in the American voice without going through the mic. */
  const speakPhrase = useCallback(async (text: string) => {
    setError(null);
    await convertAndSpeak(text);
  }, [convertAndSpeak]);

  const updateSettings = useCallback((patch: Partial<AccentAgentSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const setPersona = useCallback((personaId: AccentPersonaId) => {
    updateSettings({ personaId });
  }, [updateSettings]);

  const clearTurns = useCallback(() => setTurns([]), []);

  // Pause automatically if the device revokes microphone permission mid-call.
  useEffect(() => {
    if (!isActive || typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let cancelled = false;
    let permission: PermissionStatus | null = null;
    const onChange = () => {
      if (permission && permission.state === 'denied') {
        stop('Microphone permission was revoked — accent conversion paused.', true);
      }
    };
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((res) => {
        if (cancelled) return;
        permission = res;
        res.addEventListener('change', onChange);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      permission?.removeEventListener('change', onChange);
    };
  }, [isActive, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    supported,
    isActive,
    status,
    error,
    turns,
    interim,
    level,
    settings,
    persona,
    personas: ACCENT_PERSONAS,
    start,
    stop: () => stop(),
    toggle,
    speakPhrase,
    updateSettings,
    setPersona,
    clearTurns,
  };
}

export type AccentConversionAgent = ReturnType<typeof useAccentConversionAgent>;
