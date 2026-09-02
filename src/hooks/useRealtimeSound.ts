import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegion } from "@/contexts/RegionContext";
import {
  canPlaySound,
  effectiveVolume,
  readNotificationPermission,
  readSoundSettings,
  setRegionPref,
  writeSoundSettings,
  type NotificationPermissionState,
  type SoundSettings,
} from "@/lib/sound-settings";

const SETTINGS_EVENT = "rentmaikar:sound-settings-changed";

/**
 * Audio cue engine for the real-time sync worker.
 *
 * Browsers refuse to start an AudioContext without a user gesture, so the
 * context is created lazily on the first interaction and reused afterwards.
 * The chime is synthesised with two short oscillator notes instead of shipping
 * an audio file — no extra network fetch, and it works offline in an installed
 * PWA where a cached asset might be missing.
 */
export function useRealtimeSound() {
  const { country } = useRegion();
  const [settings, setSettings] = useState<SoundSettings>(() => readSoundSettings());
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    readNotificationPermission(),
  );
  const [unlocked, setUnlocked] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef(0);

  // Keep every hook consumer (panel + worker) on the same stored settings.
  useEffect(() => {
    const sync = () => setSettings(readSoundSettings());
    window.addEventListener(SETTINGS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctxRef.current) ctxRef.current = new Ctor();
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    setUnlocked(ctxRef.current.state === "running");
    return ctxRef.current;
  }, []);

  // Autoplay policy: arm the context on the first real gesture anywhere.
  useEffect(() => {
    if (unlocked) return;
    const arm = () => ensureContext();
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [ensureContext, unlocked]);

  useEffect(
    () => () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    [],
  );

  const allowed = useMemo(
    () => canPlaySound(settings, country, permission),
    [settings, country, permission],
  );

  /** Play the chime for the active region. `force` bypasses the enabled check (test button). */
  const play = useCallback(
    (force = false) => {
      if (!force && !allowed) return;
      // Rate-limit: a burst of realtime rows must not machine-gun the speaker.
      if (!force && Date.now() - lastPlayedRef.current < 3000) return;
      const ctx = ensureContext();
      if (!ctx) return;
      lastPlayedRef.current = Date.now();

      const volume = effectiveVolume(settings, country);
      if (volume <= 0) return;

      const now = ctx.currentTime;
      [880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.12;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.3), start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.24);
      });
    },
    [allowed, country, ensureContext, settings],
  );

  const update = useCallback((next: SoundSettings) => {
    writeSoundSettings(next);
    setSettings(next);
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  }, []);

  const setWorkerEnabled = useCallback(
    (workerEnabled: boolean) => update({ ...readSoundSettings(), workerEnabled }),
    [update],
  );
  const setMuteWhenFocused = useCallback(
    (muteWhenFocused: boolean) => update({ ...readSoundSettings(), muteWhenFocused }),
    [update],
  );
  const setRegionEnabled = useCallback(
    (region: string, enabled: boolean) =>
      update(setRegionPref(readSoundSettings(), region, { enabled })),
    [update],
  );
  const setRegionVolume = useCallback(
    (region: string, volume: number) =>
      update(setRegionPref(readSoundSettings(), region, { volume })),
    [update],
  );

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);
    } catch {
      /* user dismissed */
    }
  }, []);

  return {
    settings,
    permission,
    allowed,
    unlocked,
    play,
    ensureContext,
    setWorkerEnabled,
    setMuteWhenFocused,
    setRegionEnabled,
    setRegionVolume,
    requestNotificationPermission,
  };
}

/** Should the worker emit a cue right now for `region`? Used by useRealtimeSync. */
export function shouldChime(region: string): boolean {
  const settings = readSoundSettings();
  if (!canPlaySound(settings, region)) return false;
  if (settings.muteWhenFocused && typeof document !== "undefined") {
    if (document.visibilityState === "visible" && document.hasFocus()) return false;
  }
  return true;
}
