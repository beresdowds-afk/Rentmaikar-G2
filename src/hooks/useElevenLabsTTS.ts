import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SpeakOptions {
  region?: "US" | "NG";
  voiceId?: string;
  stream?: boolean;
}

/**
 * Hook for generating and playing ElevenLabs TTS audio from anywhere in the app.
 * Uses the `elevenlabs-tts` (buffered) or `elevenlabs-tts-stream` edge functions.
 */
export function useElevenLabsTTS() {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    audioRef.current = null;
    setIsPlaying(false);
  }, []);

  const speak = useCallback(async (text: string, opts: SpeakOptions = {}) => {
    setError(null);
    if (!text.trim()) {
      setError("Text is empty");
      return null;
    }
    stop();
    setIsLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const fnName = opts.stream ? "elevenlabs-tts-stream" : "elevenlabs-tts";
      const url = `https://bwvocmhcledbwqlpcswp.functions.supabase.co/${fnName}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          region: opts.region || "US",
          voiceId: opts.voiceId,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`TTS failed (${res.status}): ${errBody || res.statusText}`);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(objectUrl);
        urlRef.current = null;
      };
      audio.onerror = () => {
        setIsPlaying(false);
        setError("Audio playback error");
      };
      await audio.play();
      return objectUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [stop]);

  return { speak, stop, isLoading, isPlaying, error };
}
