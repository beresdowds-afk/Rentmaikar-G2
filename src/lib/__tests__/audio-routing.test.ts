// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_AUDIO_PREFERENCES,
  loadAudioPreferences,
  saveAudioPreferences,
} from "../audio-preferences";
import {
  isHeadsetOrBluetoothDevice,
  detectNewlyConnectedHeadset,
} from "../media-permissions";

describe("Audio Preferences Persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads default preferences when nothing is stored", () => {
    const prefs = loadAudioPreferences();
    expect(prefs).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(prefs.route).toBe("default");
    expect(prefs.muted).toBe(false);
    expect(prefs.autoSwitchToHeadset).toBe(true);
  });

  it("saves and restores route and mute preferences accurately", () => {
    saveAudioPreferences({ route: "speaker", muted: true });
    const restored = loadAudioPreferences();
    expect(restored.route).toBe("speaker");
    expect(restored.muted).toBe(true);
    expect(restored.autoSwitchToHeadset).toBe(true);
  });

  it("partially patches preferences without wiping other fields", () => {
    saveAudioPreferences({ route: "bluetooth", muted: true });
    saveAudioPreferences({ muted: false });
    const restored = loadAudioPreferences();
    expect(restored.route).toBe("bluetooth");
    expect(restored.muted).toBe(false);
  });

  it("falls back safely on corrupted storage values", () => {
    window.localStorage.setItem("rentmaikar_audio_prefs", "{invalid_json");
    const prefs = loadAudioPreferences();
    expect(prefs).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });
});

describe("Headset & Bluetooth Device Detection", () => {
  it("recognizes Bluetooth audio devices by label keywords", () => {
    const btDevice = {
      deviceId: "dev-bt-1",
      kind: "audiooutput" as const,
      label: "AirPods Pro Bluetooth Hands-Free",
      groupId: "grp-1",
      toJSON: () => ({}),
    };
    expect(isHeadsetOrBluetoothDevice(btDevice)).toBe(true);
  });

  it("recognizes wired headsets and headphones by label keywords", () => {
    const wiredHeadphones = {
      deviceId: "dev-hp-1",
      kind: "audiooutput" as const,
      label: "External Headphone / Headset Jack",
      groupId: "grp-2",
      toJSON: () => ({}),
    };
    expect(isHeadsetOrBluetoothDevice(wiredHeadphones)).toBe(true);
  });

  it("does not classify internal speaker as a headset", () => {
    const internalSpeaker = {
      deviceId: "dev-spk-1",
      kind: "audiooutput" as const,
      label: "MacBook Pro Speakers (Built-in)",
      groupId: "grp-3",
      toJSON: () => ({}),
    };
    expect(isHeadsetOrBluetoothDevice(internalSpeaker)).toBe(false);
  });

  it("detects when a new headset connects during a call", () => {
    const prevDevices = [
      {
        deviceId: "dev-spk-1",
        kind: "audiooutput" as const,
        label: "Built-in Speaker",
        groupId: "grp-1",
        toJSON: () => ({}),
      },
    ];
    const newDevices = [
      ...prevDevices,
      {
        deviceId: "dev-bt-2",
        kind: "audiooutput" as const,
        label: "Sony WH-1000XM4 Stereo",
        groupId: "grp-2",
        toJSON: () => ({}),
      },
    ];

    const detected = detectNewlyConnectedHeadset(prevDevices, newDevices);
    expect(detected).not.toBeNull();
    expect(detected?.deviceId).toBe("dev-bt-2");
    expect(detected?.label).toContain("Sony WH-1000XM4");
  });

  it("returns null if no new headset was added", () => {
    const devices = [
      {
        deviceId: "dev-spk-1",
        kind: "audiooutput" as const,
        label: "Built-in Speaker",
        groupId: "grp-1",
        toJSON: () => ({}),
      },
    ];
    const detected = detectNewlyConnectedHeadset(devices, devices);
    expect(detected).toBeNull();
  });
});
