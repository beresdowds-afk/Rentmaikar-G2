export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface SoundSettings {
  enabled: boolean;
  volume: number;
  perRegion: Record<string, boolean>;
}

export function readNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

const SOUND_KEY = 'rm_sound_settings';

export function readSoundSettings(): SoundSettings {
  if (typeof window === 'undefined') return { enabled: true, volume: 80, perRegion: {} };
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: true, volume: 80, perRegion: {} };
}

export function writeSoundSettings(s: SoundSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(s));
  } catch {}
}

export function setRegionPref(s: SoundSettings, region: string, enabled: boolean): SoundSettings {
  return {
    ...s,
    perRegion: {
      ...s.perRegion,
      [region]: enabled,
    },
  };
}

export function regionPref(s: SoundSettings, region: string): boolean {
  if (s.perRegion && typeof s.perRegion[region] === 'boolean') {
    return s.perRegion[region];
  }
  return s.enabled;
}

export function canPlaySound(s: SoundSettings, region?: string): boolean {
  if (!s.enabled) return false;
  if (region && !regionPref(s, region)) return false;
  return true;
}

export function effectiveVolume(s: SoundSettings): number {
  return Math.max(0, Math.min(100, s.volume ?? 80)) / 100;
}
