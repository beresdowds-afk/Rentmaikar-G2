/**
 * Configurable throttling for the live-sync scheduler.
 *
 * Heartbeats and version checks are the only two things the app does on a
 * timer, so they dominate background battery and network usage on installed
 * PWAs and native shells. These settings let a user (or the device conditions)
 * dial that cost down without touching the realtime websocket, which stays
 * instant and effectively free.
 */

export type LiveSyncProfile = "realtime" | "balanced" | "battery_saver" | "custom";

export interface LiveSyncSettings {
  profile: LiveSyncProfile;
  /** How often to force a refetch when realtime frames are not arriving. */
  heartbeatMs: number;
  /** How often to check whether a newer build has been deployed. */
  versionCheckMs: number;
  /** Suspend all timers while the app is in the background. */
  pauseWhenHidden: boolean;
  /** Back off when the OS/browser reports Data Saver or a 2g/3g link. */
  respectSaveData: boolean;
  /** Back off when the battery is low and not charging. */
  adaptOnLowBattery: boolean;
}

export const LIVE_SYNC_PRESETS: Record<
  Exclude<LiveSyncProfile, "custom">,
  Pick<LiveSyncSettings, "heartbeatMs" | "versionCheckMs">
> = {
  realtime: { heartbeatMs: 30_000, versionCheckMs: 2 * 60_000 },
  balanced: { heartbeatMs: 60_000, versionCheckMs: 5 * 60_000 },
  battery_saver: { heartbeatMs: 5 * 60_000, versionCheckMs: 30 * 60_000 },
};

export const LIVE_SYNC_LIMITS = {
  minHeartbeatMs: 15_000,
  maxHeartbeatMs: 30 * 60_000,
  minVersionCheckMs: 60_000,
  maxVersionCheckMs: 6 * 60 * 60_000,
} as const;

export const DEFAULT_LIVE_SYNC_SETTINGS: LiveSyncSettings = {
  profile: "balanced",
  ...LIVE_SYNC_PRESETS.balanced,
  pauseWhenHidden: true,
  respectSaveData: true,
  adaptOnLowBattery: true,
};

const STORAGE_KEY = "rentmaikar_live_sync_settings";
export const LIVE_SYNC_SETTINGS_EVENT = "rentmaikar:live-sync-settings";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

/** Normalizes any partial/legacy payload into a safe, in-range settings object. */
export function normalizeLiveSyncSettings(input: Partial<LiveSyncSettings> | null | undefined): LiveSyncSettings {
  const base = { ...DEFAULT_LIVE_SYNC_SETTINGS, ...(input ?? {}) };
  const profile: LiveSyncProfile =
    base.profile === "realtime" ||
    base.profile === "balanced" ||
    base.profile === "battery_saver" ||
    base.profile === "custom"
      ? base.profile
      : "balanced";

  const preset = profile === "custom" ? null : LIVE_SYNC_PRESETS[profile];

  return {
    profile,
    heartbeatMs: clamp(
      preset ? preset.heartbeatMs : Number(base.heartbeatMs) || DEFAULT_LIVE_SYNC_SETTINGS.heartbeatMs,
      LIVE_SYNC_LIMITS.minHeartbeatMs,
      LIVE_SYNC_LIMITS.maxHeartbeatMs,
    ),
    versionCheckMs: clamp(
      preset
        ? preset.versionCheckMs
        : Number(base.versionCheckMs) || DEFAULT_LIVE_SYNC_SETTINGS.versionCheckMs,
      LIVE_SYNC_LIMITS.minVersionCheckMs,
      LIVE_SYNC_LIMITS.maxVersionCheckMs,
    ),
    pauseWhenHidden: Boolean(base.pauseWhenHidden),
    respectSaveData: Boolean(base.respectSaveData),
    adaptOnLowBattery: Boolean(base.adaptOnLowBattery),
  };
}

export function loadLiveSyncSettings(): LiveSyncSettings {
  if (typeof localStorage === "undefined") return DEFAULT_LIVE_SYNC_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LIVE_SYNC_SETTINGS;
    return normalizeLiveSyncSettings(JSON.parse(raw) as Partial<LiveSyncSettings>);
  } catch {
    return DEFAULT_LIVE_SYNC_SETTINGS;
  }
}

/** Persists settings and notifies every listener in this window. */
export function saveLiveSyncSettings(input: Partial<LiveSyncSettings>): LiveSyncSettings {
  const next = normalizeLiveSyncSettings({ ...loadLiveSyncSettings(), ...input });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage full — settings simply stay session-only.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LIVE_SYNC_SETTINGS_EVENT, { detail: next }));
  }
  return next;
}

export function subscribeLiveSyncSettings(cb: (s: LiveSyncSettings) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb((e as CustomEvent<LiveSyncSettings>).detail);
  // `storage` fires in the OTHER tabs, keeping every window on one schedule.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(loadLiveSyncSettings());
  };
  window.addEventListener(LIVE_SYNC_SETTINGS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LIVE_SYNC_SETTINGS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the device is asking apps to use less data. */
export function isDataSaverActive(): boolean {
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
}

/** Multiplier applied on top of the configured intervals for constrained devices. */
export const CONSTRAINED_MULTIPLIER = 3;

/**
 * Resolves the intervals to actually schedule, given the user's settings and
 * the live device conditions (data saver, low battery).
 */
export function resolveEffectiveIntervals(
  settings: LiveSyncSettings,
  conditions: { dataSaver?: boolean; lowBattery?: boolean } = {},
): { heartbeatMs: number; versionCheckMs: number; throttled: boolean } {
  const throttled =
    (settings.respectSaveData && Boolean(conditions.dataSaver)) ||
    (settings.adaptOnLowBattery && Boolean(conditions.lowBattery));
  const factor = throttled ? CONSTRAINED_MULTIPLIER : 1;
  return {
    heartbeatMs: Math.min(settings.heartbeatMs * factor, LIVE_SYNC_LIMITS.maxHeartbeatMs),
    versionCheckMs: Math.min(settings.versionCheckMs * factor, LIVE_SYNC_LIMITS.maxVersionCheckMs),
    throttled,
  };
}

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
}

/**
 * Watches battery state where the API exists. Returns an unsubscribe function;
 * the callback receives `true` when the battery is below 20% and discharging.
 */
export function watchLowBattery(cb: (low: boolean) => void): () => void {
  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery;
  if (typeof getBattery !== "function") return () => {};

  let battery: BatteryLike | null = null;
  let cancelled = false;
  const onChange = () => {
    if (!battery) return;
    cb(!battery.charging && battery.level <= 0.2);
  };

  void getBattery.call(navigator).then((b) => {
    if (cancelled) return;
    battery = b;
    b.addEventListener?.("levelchange", onChange);
    b.addEventListener?.("chargingchange", onChange);
    onChange();
  }).catch(() => {});

  return () => {
    cancelled = true;
    battery?.removeEventListener?.("levelchange", onChange);
    battery?.removeEventListener?.("chargingchange", onChange);
  };
}
