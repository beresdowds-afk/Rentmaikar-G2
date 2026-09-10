export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface RegionSoundPref {
  enabled: boolean;
  volume: number;
}

export interface SoundSettings {
  workerEnabled: boolean;
  muteWhenFocused?: boolean;
  volume?: number;
  perRegion: Record<string, RegionSoundPref>;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  workerEnabled: false,
  muteWhenFocused: false,
  volume: 0.5,
  perRegion: {},
};

export function readNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

const SOUND_KEY = 'rentmaikar.sound-settings.v1';

export function readSoundSettings(): SoundSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SOUND_SETTINGS };
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_SOUND_SETTINGS,
          ...parsed,
          perRegion: parsed.perRegion || {},
        };
      }
    }
  } catch {}
  return { ...DEFAULT_SOUND_SETTINGS };
}

export function writeSoundSettings(s: SoundSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(s));
  } catch {}
}

export function regionPref(s: SoundSettings, region: string): RegionSoundPref {
  const custom = s?.perRegion?.[region];
  let vol = custom?.volume ?? s?.volume ?? 0.5;
  if (typeof vol !== 'number' || Number.isNaN(vol)) {
    vol = 0.5;
  }
  vol = Math.max(0, Math.min(1, vol));
  return {
    enabled: custom?.enabled ?? true,
    volume: vol,
  };
}

export function setRegionPref(
  s: SoundSettings,
  region: string,
  patch: Partial<RegionSoundPref>
): SoundSettings {
  const current = regionPref(s, region);
  let vol = patch.volume !== undefined ? patch.volume : current.volume;
  if (typeof vol !== 'number' || Number.isNaN(vol)) {
    vol = 0.5;
  }
  vol = Math.max(0, Math.min(1, vol));

  return {
    ...s,
    perRegion: {
      ...(s.perRegion ?? {}),
      [region]: {
        enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
        volume: vol,
      },
    },
  };
}

export function canPlaySound(
  s: SoundSettings,
  region?: string,
  permission?: NotificationPermissionState
): boolean {
  if (!s.workerEnabled) return false;
  if (permission === 'denied') return false;
  if (region) {
    const pref = regionPref(s, region);
    if (!pref.enabled) return false;
  }
  return true;
}

export function effectiveVolume(s: SoundSettings, region?: string): number {
  if (region) {
    return regionPref(s, region).volume;
  }
  let vol = s?.volume ?? 0.5;
  if (typeof vol !== 'number' || Number.isNaN(vol)) {
    vol = 0.5;
  }
  return Math.max(0, Math.min(1, vol));
}

