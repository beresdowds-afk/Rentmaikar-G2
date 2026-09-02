import type { AudioOutputRoute } from "@/lib/media-permissions";

/**
 * Per-device audio routing preferences for in-app calls.
 *
 * Stored locally (routing is a property of the physical device, not the
 * account) so the user's speaker/earpiece/Bluetooth choice and mute state are
 * restored automatically on their next call.
 */
export interface AudioPreferences {
  route: AudioOutputRoute;
  muted: boolean;
  /** Automatically switch output to a headset/Bluetooth device when it connects. */
  autoSwitchToHeadset: boolean;
}

const STORAGE_KEY = "rentmaikar_audio_prefs";

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  route: "default",
  muted: false,
  autoSwitchToHeadset: true,
};

const VALID_ROUTES: AudioOutputRoute[] = ["speaker", "earpiece", "bluetooth", "default"];

export function loadAudioPreferences(): AudioPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_AUDIO_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AudioPreferences>;
    return {
      route: VALID_ROUTES.includes(parsed.route as AudioOutputRoute)
        ? (parsed.route as AudioOutputRoute)
        : DEFAULT_AUDIO_PREFERENCES.route,
      muted: typeof parsed.muted === "boolean" ? parsed.muted : false,
      autoSwitchToHeadset:
        typeof parsed.autoSwitchToHeadset === "boolean" ? parsed.autoSwitchToHeadset : true,
    };
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function saveAudioPreferences(patch: Partial<AudioPreferences>): AudioPreferences {
  const next = { ...loadAudioPreferences(), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode / quota — preferences simply do not persist.
    }
  }
  return next;
}
