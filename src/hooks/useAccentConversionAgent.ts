import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AmericanAccentProfile,
  AMERICAN_ACCENT_PROFILES,
  AmericanVoiceId,
  AccentConversionSettings,
  DEFAULT_ACCENT_SETTINGS,
  ConversionSegment,
  AccentConversionStatus,
} from '@/types/accent-conversion';
import { normalizeToAmericanAccent } from '@/lib/accent-conversion/normalizer';
import { getAccentAudioEngine } from '@/lib/accent-conversion/audio-engine';
import { toast } from 'sonner';

const SETTINGS_STORAGE_KEY = 'rentmaikar_accent_conversion_settings';

export function useAccentConversionAgent() {
  const [settings, setSettings] = useState<AccentConversionSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) return { ...DEFAULT_ACCENT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // Fallback
    }
    return DEFAULT_ACCENT_SETTINGS;
  });

  const [status, setStatus] = useState<AccentConversionStatus>('idle');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentOriginal, setCurrentOriginal] = useState('');
  const [currentAmerican, setCurrentAmerican] = useState('');
  const [segments, setSegments] = useState<ConversionSegment[]>([]);
  const [audioLevels, setAudioLevels] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const [lastLatencyMs, setLastLatencyMs] = useState(185);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const settingsRef = useRef(settings);
  const engineRef = useRef(getAccentAudioEngine());
  const visualizerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
    engineRef.current.setMonitoringVolume(
      settings.monitorAudioFeedback ? settings.feedbackVolume : 0
    );
  }, [settings]);

  const activeProfile = useMemo(() => {
    return (
      AMERICAN_ACCENT_PROFILES.find((p) => p.id === settings.activeProfileId) ||
      AMERICAN_ACCENT_PROFILES[0]
    );
  }, [settings.activeProfileId]);

  // Hook up speaking state changes
  useEffect(() => {
    const unsubscribe = engineRef.current.onSpeakingChange((speaking) => {
      setIsSpeaking(speaking);
      if (speaking) {
        setStatus('speaking');
      } else if (isListeningRef.current) {
        setStatus('listening');
      } else {
        setStatus('idle');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Audio level visualizer ticker
  useEffect(() => {
    visualizerIntervalRef.current = window.setInterval(() => {
      if (isSpeaking || isListening) {
        setAudioLevels(engineRef.current.getAudioLevels());
      } else {
        setAudioLevels([0, 0, 0, 0, 0, 0, 0, 0]);
      }
    }, 100);

    return () => {
      if (visualizerIntervalRef.current) {
        clearInterval(visualizerIntervalRef.current);
      }
    };
  }, [isSpeaking, isListening]);

  // Handler for converting and speaking an utterance
  const convertAndSpeak = useCallback(
    async (rawText: string, startTime: number) => {
      if (!rawText.trim()) return;

      setStatus('transforming');
      const transform = normalizeToAmericanAccent(
        rawText,
        settingsRef.current.idiomAdaptation
      );

      setCurrentAmerican(transform.americanText);
      const latency = Date.now() - startTime;
      setLastLatencyMs(latency);

      const newSegment: ConversionSegment = {
        id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        originalText: rawText,
        americanText: transform.americanText,
        idiomAdapted: transform.adapted,
        adaptedPhrases: transform.replacements,
        latencyMs: latency,
        status: 'speaking',
      };

      setSegments((prev) => [newSegment, ...prev.slice(0, 49)]);

      try {
        await engineRef.current.speakAmericanVoice(
          transform.americanText,
          activeProfile,
          {
            rate: settingsRef.current.speechRate,
            pitch: settingsRef.current.speechPitch,
            preferHighFidelity:
              settingsRef.current.latencyPriority === 'studio-quality',
          }
        );

        setSegments((prev) =>
          prev.map((s) => (s.id === newSegment.id ? { ...s, status: 'completed' } : s))
        );
      } catch (err: any) {
        setSegments((prev) =>
          prev.map((s) =>
            s.id === newSegment.id
              ? { ...s, status: 'error', errorMessage: err?.message || 'Voice generation failed' }
              : s
          )
        );
      } finally {
        setCurrentOriginal('');
        setCurrentAmerican('');
      }
    },
    [activeProfile]
  );

  // Initialize browser speech recognition for continuous low-latency capture
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      return null;
    }

    const rec = new SpeechRecognitionClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    let phraseStartTime = Date.now();

    rec.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setStatus('listening');
    };

    rec.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        setCurrentOriginal(interim);
        phraseStartTime = Date.now();
      }

      if (final && final.trim()) {
        setCurrentOriginal(final);
        if (settingsRef.current.autoSpeakClauses) {
          void convertAndSpeak(final.trim(), phraseStartTime);
        }
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow microphone permissions for real-time accent conversion.');
        stopListeningRef.current();
      }
    };

    rec.onend = () => {
      // Auto-restart if agent is supposed to remain listening
      if (isListeningRef.current) {
        try {
          rec.start();
        } catch {
          setIsListening(false);
          isListeningRef.current = false;
        }
      } else {
        setIsListening(false);
      }
    };

    return rec;
  }, [convertAndSpeak]);

  const startListening = useCallback(async () => {
    try {
      await engineRef.current.initAudioContext();
      if (!recognitionRef.current) {
        recognitionRef.current = initSpeechRecognition();
      }

      if (recognitionRef.current) {
        isListeningRef.current = true;
        recognitionRef.current.start();
        setIsListening(true);
        setStatus('listening');
        toast.success(`American Accent Agent Activated (${activeProfile.name})`);
      } else {
        toast.info('Speech recognition engine starting in manual/soundboard mode.');
        setIsListening(true);
        isListeningRef.current = true;
        setStatus('listening');
      }
    } catch (e: any) {
      console.warn('Speech recognition start note:', e);
      setIsListening(true);
      isListeningRef.current = true;
      setStatus('listening');
    }
  }, [activeProfile.name, initSpeechRecognition]);

  const stopListeningRef = useRef<() => void>(() => {});

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    setStatus('idle');
    engineRef.current.stopSpeaking();
  }, []);

  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  const toggleAgent = useCallback(() => {
    if (isListening) {
      stopListening();
      toast.info('American Accent Agent paused');
    } else {
      void startListening();
    }
  }, [isListening, startListening, stopListening]);

  const speakPhrase = useCallback(
    async (text: string) => {
      const startTime = Date.now();
      await convertAndSpeak(text, startTime);
    },
    [convertAndSpeak]
  );

  const previewProfile = useCallback(
    async (profileId: AmericanVoiceId) => {
      const targetProfile =
        AMERICAN_ACCENT_PROFILES.find((p) => p.id === profileId) || activeProfile;
      engineRef.current.stopSpeaking();
      toast.info(`Playing sample for ${targetProfile.name}...`);
      await engineRef.current.speakAmericanVoice(
        targetProfile.samplePhrase,
        targetProfile,
        {
          rate: settings.speechRate,
          pitch: settings.speechPitch,
        }
      );
    },
    [activeProfile, settings.speechRate, settings.speechPitch]
  );

  const updateSettings = useCallback(
    (updates: Partial<AccentConversionSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const clearSegments = useCallback(() => {
    setSegments([]);
    setCurrentOriginal('');
    setCurrentAmerican('');
  }, []);

  return {
    isActive: settings.enabled,
    status,
    isListening,
    isSpeaking,
    currentOriginal,
    currentAmerican,
    segments,
    settings,
    updateSettings,
    activeProfile,
    profiles: AMERICAN_ACCENT_PROFILES,
    audioLevels,
    latencyMs: lastLatencyMs,
    duckMic: settings.muteOriginalMicOnCall && isSpeaking,
    startListening,
    stopListening,
    toggleAgent,
    speakPhrase,
    previewProfile,
    clearSegments,
  };
}

export type UseAccentConversionAgentResult = ReturnType<typeof useAccentConversionAgent>;
