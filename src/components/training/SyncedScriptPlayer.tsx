import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, StopCircle, Volume2, Mic } from "lucide-react";
import { toast } from "sonner";
import { useRegion } from "@/contexts/RegionContext";

interface SyncedScriptPlayerProps {
  script: string;
}

interface WordSpan {
  word: string;
  charStart: number;
  charEnd: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SyncedScriptPlayer = ({ script }: SyncedScriptPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1);
  const [useElevenLabs, setUseElevenLabs] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { country: regionCountry } = useRegion();
  const elevenRegion = regionCountry === "Nigeria" ? "NG" : "US";
  const voiceLabel = "🎓 Kevin — Career & Life Coach (ElevenLabs)";

  // Build word spans from the script
  const wordSpans: WordSpan[] = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(script)) !== null) {
    wordSpans.push({
      word: match[0],
      charStart: match.index,
      charEnd: match.index + match[0].length,
    });
  }

  const clearWordTimers = useCallback(() => {
    wordTimersRef.current.forEach(clearTimeout);
    wordTimersRef.current = [];
  }, []);

  const stopAll = useCallback(() => {
    // Stop ElevenLabs audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    // Stop browser TTS
    window.speechSynthesis?.cancel();
    clearWordTimers();
    setIsPlaying(false);
    setIsPaused(false);
    setActiveWordIdx(-1);
    setIsLoading(false);
  }, [clearWordTimers]);

  // Simulate word-by-word highlighting over audio duration
  const scheduleWordHighlights = useCallback(
    (durationMs: number) => {
      clearWordTimers();
      if (wordSpans.length === 0) return;
      const msPerWord = durationMs / wordSpans.length;
      wordSpans.forEach((_, idx) => {
        const timer = setTimeout(() => {
          setActiveWordIdx(idx);
          const el = document.getElementById(`word-el-${idx}`);
          if (el && containerRef.current) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }, idx * msPerWord);
        wordTimersRef.current.push(timer);
      });
      // Clear at end
      const endTimer = setTimeout(() => {
        setActiveWordIdx(-1);
      }, durationMs + 100);
      wordTimersRef.current.push(endTimer);
    },
    [wordSpans, clearWordTimers]
  );

  const playWithElevenLabs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ text: script, region: elevenRegion }),
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        const durationMs = audio.duration * 1000;
        scheduleWordHighlights(durationMs);
      };

      audio.onended = () => {
        clearWordTimers();
        setIsPlaying(false);
        setIsPaused(false);
        setActiveWordIdx(-1);
        URL.revokeObjectURL(url);
      };

      audio.onerror = () => {
        toast.error("Audio playback error. Falling back to browser TTS.");
        setUseElevenLabs(false);
        stopAll();
        playWithBrowserTTS();
      };

      await audio.play();
      setIsPlaying(true);
      setIsPaused(false);
    } catch (err) {
      console.error("[ElevenLabs TTS] Error:", err);
      toast.warning("ElevenLabs unavailable — using browser voice.");
      setUseElevenLabs(false);
      playWithBrowserTTS();
    } finally {
      setIsLoading(false);
    }
  }, [script, elevenRegion, scheduleWordHighlights, clearWordTimers, stopAll]);

  const playWithBrowserTTS = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      toast.error("Text-to-speech is not supported in your browser.");
      return;
    }
    window.speechSynthesis.cancel();
    setActiveWordIdx(-1);
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.rate = 0.88;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.toLowerCase().includes("david") ||
          v.name.toLowerCase().includes("daniel") ||
          v.name.toLowerCase().includes("google us"))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onboundary = (event) => {
      if (event.name === "word") {
        const idx = wordSpans.findIndex(
          (w) => event.charIndex >= w.charStart && event.charIndex < w.charEnd
        );
        if (idx >= 0) {
          setActiveWordIdx(idx);
          const el = document.getElementById(`word-el-${idx}`);
          if (el && containerRef.current) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
      }
    };
    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setActiveWordIdx(-1);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  }, [script, wordSpans]);

  const play = useCallback(() => {
    stopAll();
    if (useElevenLabs) {
      playWithElevenLabs();
    } else {
      playWithBrowserTTS();
    }
  }, [useElevenLabs, playWithElevenLabs, playWithBrowserTTS, stopAll]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      clearWordTimers();
    } else {
      window.speechSynthesis?.pause();
    }
    setIsPaused(true);
    setIsPlaying(false);
  }, [clearWordTimers]);

  const resume = useCallback(() => {
    if (audioRef.current) {
      const remaining = (audioRef.current.duration - audioRef.current.currentTime) * 1000;
      scheduleWordHighlights(remaining);
      audioRef.current.play();
    } else {
      window.speechSynthesis?.resume();
    }
    setIsPaused(false);
    setIsPlaying(true);
  }, [scheduleWordHighlights]);

  useEffect(() => {
    const handleVoicesChanged = () => {};
    window.speechSynthesis?.addEventListener("voiceschanged", handleVoicesChanged);
    return () => {
      stopAll();
      window.speechSynthesis?.removeEventListener("voiceschanged", handleVoicesChanged);
    };
  }, [stopAll]);


  return (
    <div className="space-y-3">
      {/* Voice label */}
      {useElevenLabs && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mic className="h-3.5 w-3.5 text-primary" />
          <span>Narrated by <strong>{voiceLabel}</strong></span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isPlaying && !isPaused && (
          <Button size="sm" onClick={play} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isLoading ? "Loading audio…" : "Play Audio"}
          </Button>
        )}
        {isPlaying && (
          <Button size="sm" variant="outline" onClick={pause} className="gap-2">
            <Pause className="h-4 w-4" /> Pause
          </Button>
        )}
        {isPaused && (
          <Button size="sm" onClick={resume} className="gap-2">
            <Play className="h-4 w-4" /> Resume
          </Button>
        )}
        {(isPlaying || isPaused) && (
          <Button size="sm" variant="destructive" onClick={stopAll} className="gap-2">
            <StopCircle className="h-4 w-4" /> Stop
          </Button>
        )}
        {(isPlaying || isPaused) && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
            <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
            {isPlaying ? "Playing…" : "Paused"}
          </span>
        )}
      </div>

      {/* Script display */}
      <div
        ref={containerRef}
        className="p-4 rounded-lg bg-muted/60 max-h-[480px] overflow-y-auto leading-relaxed text-sm border border-border/40"
      >
        <span className="text-sm leading-relaxed">
          {wordSpans.length === 0 ? (
            <span className="whitespace-pre-wrap text-foreground">{script}</span>
          ) : (
            (() => {
              const parts: React.ReactNode[] = [];
              let cursor = 0;
              wordSpans.forEach((w, i) => {
                if (cursor < w.charStart) {
                  parts.push(
                    <span key={`gap-${i}`} className="whitespace-pre-wrap text-foreground">
                      {script.slice(cursor, w.charStart)}
                    </span>
                  );
                }
                const isActive = i === activeWordIdx;
                parts.push(
                  <span
                    key={`word-${i}`}
                    id={`word-el-${i}`}
                    className={`rounded transition-all duration-75 ${
                      isActive
                        ? "bg-primary text-primary-foreground px-0.5 font-semibold"
                        : "text-foreground"
                    }`}
                  >
                    {w.word}
                  </span>
                );
                cursor = w.charEnd;
              });
              if (cursor < script.length) {
                parts.push(
                  <span key="tail" className="whitespace-pre-wrap text-foreground">
                    {script.slice(cursor)}
                  </span>
                );
              }
              return parts;
            })()
          )}
        </span>
      </div>
    </div>
  );
};

export default SyncedScriptPlayer;
