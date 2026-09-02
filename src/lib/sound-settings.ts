/**
 * Per-region audio preferences for the real-time sync worker.
 *
 * Installed PWAs are the main consumer: the app can sit in the background for
 * hours, so an audible cue on a new payment/message is genuinely useful — but
 * only when the user opted in. Defaults are deliberately conservative:
 *
 *   * sound is OFF until the user enables it (no surprise noise on install)
 *   * if the browser has *blocked* notifications we stay off and say why
 *   * volume is per region, because an operator can run US and NG desks side
 *     by side and wants a different loudness for each
 */

export interface RegionSoundPref {
  /** Play a chime when live updates arrive for this region. */
  enabled: boolean;
  /** 0 – 1. */
  volume: number;
}

export interface SoundSettings {
  /** Master switch — off disables every region at once. */
  workerEnabled: boolean;
  /** Suppress sound while the app tab is focused (avoids double-signalling). */
  muteWhenFocused: boolean;
  byRegion: Record<string, RegionSoundPref>;
}

const STORAGE_KEY = "rentmaikar.sound-settings.v1";

export const DEFAULT_REGION_PREF: RegionSoundPref = { enabled: false, volume: 0.5 };

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  workerEnabled: false,
  muteWhenFocused: true,
  byRegion: {},
};

const isBrowser = () => typeof window !== "undefined" && !!window.localStorage;

const clampVolume = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_REGION_PREF.volume;
  return Math.min(1, Math.max(0, n));
};

export function readSoundSettings(): SoundSettings {
  if (!isBrowser()) return { ...DEFAULT_SOUND_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    const byRegion: Record<string, RegionSoundPref> = {};
    for (const [region, pref] of Object.entries(parsed.byRegion ?? {})) {
      byRegion[region] = {
        enabled: !!(pref as RegionSoundPref)?.enabled,
        volume: clampVolume((pref as RegionSoundPref)?.volume),
      };
    }
    return {
      workerEnabled: !!parsed.workerEnabled,
      muteWhenFocused: parsed.muteWhenFocused !== false,
      byRegion,
    };
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export function writeSoundSettings(settings: SoundSettings): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode / quota — preferences are best-effort */
  }
}

export function regionPref(settings: SoundSettings, region: string): RegionSoundPref {
  return settings.byRegion[region] ?? DEFAULT_REGION_PREF;
}

export function setRegionPref(
  settings: SoundSettings,
  region: string,
  patch: Partial<RegionSoundPref>,
): SoundSettings {
  const current = regionPref(settings, region);
  return {
    ...settings,
    byRegion: {
      ...settings.byRegion,
      [region]: {
        enabled: patch.enabled ?? current.enabled,
        volume: clampVolume(patch.volume ?? current.volume),
      },
    },
  };
}

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

/** Read the notification permission without ever prompting. */
export function readNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

/**
 * Whether audio may play right now for a region.
 *
 * Blocked notifications are treated as an explicit "do not disturb": we keep
 * the worker silent rather than routing around the user's browser-level choice.
 */
export function canPlaySound(
  settings: SoundSettings,
  region: string,
  permission: NotificationPermissionState = readNotificationPermission(),
): boolean {
  if (!settings.workerEnabled) return false;
  if (permission === "denied") return false;
  return regionPref(settings, region).enabled;
}

/** Effective volume, already gated by {@link canPlaySound}. */
export function effectiveVolume(settings: SoundSettings, region: string): number {
  return clampVolume(regionPref(settings, region).volume);
}
