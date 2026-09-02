import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_SOUND_SETTINGS,
  canPlaySound,
  effectiveVolume,
  readSoundSettings,
  setRegionPref,
  writeSoundSettings,
} from "@/lib/sound-settings";

describe("PWA sound settings", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to silent so an install never makes noise unprompted", () => {
    const s = readSoundSettings();
    expect(s.workerEnabled).toBe(false);
    expect(canPlaySound(s, "USA", "granted")).toBe(false);
  });

  it("stores volume per region independently", () => {
    let s = { ...DEFAULT_SOUND_SETTINGS, workerEnabled: true };
    s = setRegionPref(s, "USA", { enabled: true, volume: 0.2 });
    s = setRegionPref(s, "Nigeria", { enabled: true, volume: 0.9 });
    writeSoundSettings(s);

    const reloaded = readSoundSettings();
    expect(effectiveVolume(reloaded, "USA")).toBeCloseTo(0.2);
    expect(effectiveVolume(reloaded, "Nigeria")).toBeCloseTo(0.9);
    expect(canPlaySound(reloaded, "USA", "granted")).toBe(true);
  });

  it("stays silent when notifications are blocked, even if enabled", () => {
    const s = setRegionPref({ ...DEFAULT_SOUND_SETTINGS, workerEnabled: true }, "USA", {
      enabled: true,
      volume: 1,
    });
    expect(canPlaySound(s, "USA", "denied")).toBe(false);
    expect(canPlaySound(s, "USA", "default")).toBe(true);
  });

  it("clamps out-of-range and malformed volumes", () => {
    const s = setRegionPref(DEFAULT_SOUND_SETTINGS, "USA", { volume: 5 });
    expect(effectiveVolume(s, "USA")).toBe(1);
    const t = setRegionPref(DEFAULT_SOUND_SETTINGS, "USA", { volume: Number.NaN });
    expect(effectiveVolume(t, "USA")).toBe(0.5);
  });

  it("falls back to defaults on corrupt storage", () => {
    window.localStorage.setItem("rentmaikar.sound-settings.v1", "{not json");
    expect(readSoundSettings().workerEnabled).toBe(false);
  });
});
