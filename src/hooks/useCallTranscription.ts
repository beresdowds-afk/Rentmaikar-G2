import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { encodeWav } from "@/lib/wav-encoder";
import { toast } from "sonner";

export interface CallTranscriptSegment {
  id?: string;
  segment_index: number;
  transcript_text: string;
  language_code?: string | null;
  audio_storage_path?: string | null;
  created_at?: string;
}

interface Options {
  callId: string | null;
  saveVoiceLog?: boolean;
  languageCode?: string; // ISO-639-1
  segmentSeconds?: number;
  speaker?: string;
}

/**
 * Optional per-call ElevenLabs Scribe STT.
 * Captures the local microphone in fixed WAV windows, ships each to the
 * `voip-call-transcript-log` edge function which stores the transcript
 * (and optionally the audio) tied to the given voip_calls row.
 *
 * The user must opt in — start()/stop() are explicit and mic permission is
 * requested only on start().
 */
export function useCallTranscription({
  callId,
  saveVoiceLog = false,
  languageCode,
  segmentSeconds = 15,
  speaker,
}: Options) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [segments, setSegments] = useState<CallTranscriptSegment[]>([]);
  const [interimError, setInterimError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(48000);
  const intervalRef = useRef<number | null>(null);
  const segIndexRef = useRef<number>(0);
  const windowStartRef = useRef<number>(0);
  const saveVoiceLogRef = useRef<boolean>(saveVoiceLog);

  useEffect(() => {
    saveVoiceLogRef.current = saveVoiceLog;
  }, [saveVoiceLog]);

  const flush = useCallback(async () => {
    if (!callId) return;
    const chunks = bufferRef.current;
    bufferRef.current = [];
    if (chunks.length === 0) return;

    const startedAt = new Date(windowStartRef.current).toISOString();
    const endedAt = new Date().toISOString();
    windowStartRef.current = Date.now();

    const blob = encodeWav(chunks, sampleRateRef.current, 16000);
    if (blob.size < 3000) return; // too short / silent

    const form = new FormData();
    form.append("audio", blob, `segment-${segIndexRef.current}.wav`);
    form.append("callId", callId);
    form.append("segmentIndex", String(segIndexRef.current));
    form.append("saveAudio", saveVoiceLogRef.current ? "true" : "false");
    form.append("segmentStartedAt", startedAt);
    form.append("segmentEndedAt", endedAt);
    if (speaker) form.append("speaker", speaker);
    if (languageCode) form.append("language_code", languageCode);

    const idx = segIndexRef.current;
    segIndexRef.current += 1;

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const url = `${(supabase as unknown as { supabaseUrl: string }).supabaseUrl}/functions/v1/voip-call-transcript-log`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`STT failed (${res.status}): ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      if (data?.text) {
        setSegments((prev) => [
          ...prev,
          {
            id: data.id,
            segment_index: idx,
            transcript_text: data.text,
            language_code: data.language ?? null,
            audio_storage_path: data.audio_storage_path ?? null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setInterimError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      console.error("[useCallTranscription] flush error:", msg);
      setInterimError(msg);
    }
  }, [callId, languageCode, speaker]);

  const stop = useCallback(async () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    try {
      nodeRef.current?.disconnect();
      sourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Final flush
    await flush();
    if (ctxRef.current) {
      try {
        await ctxRef.current.close();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    }
    nodeRef.current = null;
    sourceRef.current = null;
    setIsTranscribing(false);
  }, [flush]);

  const start = useCallback(async () => {
    if (!callId) {
      toast.error("Cannot transcribe: no active call.");
      return;
    }
    if (isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setPermission("granted");
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => {
        const chan = e.inputBuffer.getChannelData(0);
        // Copy since the buffer is reused
        bufferRef.current.push(new Float32Array(chan));
      };
      source.connect(node);
      node.connect(ctx.destination);
      sourceRef.current = source;
      nodeRef.current = node;
      windowStartRef.current = Date.now();
      segIndexRef.current = 0;
      setSegments([]);
      setInterimError(null);
      intervalRef.current = window.setInterval(() => {
        void flush();
      }, Math.max(5, segmentSeconds) * 1000);
      setIsTranscribing(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone unavailable";
      setPermission("denied");
      toast.error(`Cannot start transcription: ${msg}`);
    }
  }, [callId, isTranscribing, segmentSeconds, flush]);

  useEffect(() => {
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isTranscribing, permission, segments, interimError, start, stop };
}
