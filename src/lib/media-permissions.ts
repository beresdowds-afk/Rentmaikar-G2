import { logAudioEvent } from "@/lib/audio-diagnostics";

export type MicPermissionState = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

/** Preferred audio output route for a call. */
export type AudioOutputRoute = "speaker" | "earpiece" | "bluetooth" | "default";

export interface AudioRouteResult {
  route: AudioOutputRoute;
  deviceId: string;
  label: string;
  /** True when the browser actually supports picking the output device. */
  selectionSupported: boolean;
}

/** Read the current microphone permission without prompting the user. */
export async function getMicPermissionState(): Promise<MicPermissionState> {
  if (typeof window === "undefined") return "unsupported";
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const perms = (
      navigator as unknown as {
        permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> };
      }
    ).permissions;
    if (!perms?.query) return "unknown";
    const status = await perms.query({ name: "microphone" as PermissionName });
    return status.state as MicPermissionState;
  } catch {
    return "unknown";
  }
}

/**
 * Subscribe to microphone permission changes (fires when the user flips the
 * browser site setting mid-session). Returns an unsubscribe function.
 */
export function watchMicPermission(onChange: (state: MicPermissionState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  let status: PermissionStatus | null = null;
  const handler = () => {
    if (status) {
      logAudioEvent("permission", `Microphone permission changed to "${status.state}"`, {
        level: status.state === "denied" ? "error" : "info",
      });
      onChange(status.state as MicPermissionState);
    }
  };
  void (async () => {
    try {
      const perms = (
        navigator as unknown as {
          permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> };
        }
      ).permissions;
      if (!perms?.query) return;
      status = await perms.query({ name: "microphone" as PermissionName });
      status.addEventListener?.("change", handler);
    } catch {
      // Permissions API unavailable — permission changes surface on next call.
    }
  })();
  return () => {
    status?.removeEventListener?.("change", handler);
  };
}

/**
 * Request microphone (and implicitly speaker) access on demand.
 * Used by training playback and in-app calls so audio features work reliably.
 *
 * Safe to call repeatedly: quickly returns when permission is already granted
 * without re-prompting; only prompts the user when browser state is 'prompt'
 * or unknown.
 */
export async function ensureMediaPermissions(options?: { silent?: boolean }): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) {
    logAudioEvent("permission", "getUserMedia unavailable in this browser", { level: "error" });
    return false;
  }

  const state = await getMicPermissionState();
  if (state === "granted") {
    logAudioEvent("permission", "Microphone already granted");
    return true;
  }
  if (state === "denied" && options?.silent) {
    logAudioEvent("permission", "Microphone denied (silent check)", { level: "error" });
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    logAudioEvent("permission", "Microphone permission granted");
    await unlockAudioOutput();
    return true;
  } catch (e) {
    logAudioEvent("permission", "Microphone permission request failed", {
      level: "error",
      detail: { reason: e instanceof Error ? e.name : String(e) },
    });
    return false;
  }
}

let sharedAudioContext: AudioContext | null = null;

/**
 * Keep a resumed AudioContext alive so speaker output is unlocked for the
 * whole duration of an in-app call (iOS/Safari suspend audio otherwise).
 */
export async function unlockAudioOutput(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    if (!sharedAudioContext || sharedAudioContext.state === "closed") {
      sharedAudioContext = new AC();
    }
    if (sharedAudioContext.state === "suspended") await sharedAudioContext.resume();
    const running = sharedAudioContext.state === "running";
    logAudioEvent("routing", `Audio output ${running ? "unlocked" : "still suspended"}`, {
      level: running ? "info" : "warn",
    });
    return running;
  } catch {
    logAudioEvent("routing", "Could not unlock audio output", { level: "warn" });
    return false;
  }
}

const BLUETOOTH_HINTS = ["bluetooth", "airpods", "headset", "bt "];
const SPEAKER_HINTS = ["speaker", "speakerphone", "loud"];
const EARPIECE_HINTS = ["earpiece", "receiver", "handset"];

function matches(label: string, hints: string[]) {
  const l = label.toLowerCase();
  return hints.some((h) => l.includes(h));
}

/** List the audio output devices the browser exposes (labels need mic permission). */
export async function listAudioOutputs(): Promise<MediaDeviceInfo[]> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audiooutput");
  } catch {
    return [];
  }
}

/** True when this browser can pick the audio output sink (Chrome/Android, desktop). */
export function isOutputSelectionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId ===
    "function";
}

/**
 * Resolve the best output device id for a requested route.
 * iOS Safari does not expose sink selection — we fall back to "default", where
 * the OS route (speaker vs earpiece vs Bluetooth) is controlled by the system.
 */
export async function resolveAudioOutput(route: AudioOutputRoute): Promise<AudioRouteResult> {
  const selectionSupported = isOutputSelectionSupported();
  const outputs = await listAudioOutputs();

  const pick = (hints: string[]) => outputs.find((d) => matches(d.label, hints));

  let chosen: MediaDeviceInfo | undefined;
  if (route === "bluetooth") chosen = pick(BLUETOOTH_HINTS);
  else if (route === "speaker") chosen = pick(SPEAKER_HINTS) ?? pick(BLUETOOTH_HINTS.slice(0, 0));
  else if (route === "earpiece") chosen = pick(EARPIECE_HINTS);

  // Prefer an attached Bluetooth device automatically when nothing was asked for.
  if (!chosen && route === "default") chosen = pick(BLUETOOTH_HINTS);

  const result: AudioRouteResult = {
    route,
    deviceId: chosen?.deviceId ?? "default",
    label: chosen?.label || "System default",
    selectionSupported,
  };

  logAudioEvent("routing", `Resolved "${route}" output to ${result.label}`, {
    level: selectionSupported ? "info" : "warn",
    detail: {
      deviceId: result.deviceId,
      selectionSupported,
      availableOutputs: outputs.map((d) => d.label || d.deviceId),
    },
  });

  return result;
}

/** True when the device label looks like a wired headset or Bluetooth audio device. */
export function isHeadsetDevice(device: Pick<MediaDeviceInfo, "label">): boolean {
  return matches(device.label ?? "", [...BLUETOOTH_HINTS, "headphone", "earbud", "wired"]);
}

/** First connected headset/Bluetooth output, if any. */
export async function findHeadsetOutput(): Promise<MediaDeviceInfo | null> {
  const outputs = await listAudioOutputs();
  return outputs.find(isHeadsetDevice) ?? null;
}

/**
 * Watch for audio devices being plugged in or removed (headset, Bluetooth).
 * Fires with the connected headset (or null when it disappears) so an active
 * call can move its output automatically.
 */
export function watchAudioDevices(
  onChange: (headset: MediaDeviceInfo | null) => void,
): () => void {
  if (typeof window === "undefined" || !navigator.mediaDevices?.addEventListener) return () => {};
  let previousId: string | null = null;
  const handler = async () => {
    const headset = await findHeadsetOutput();
    const id = headset?.deviceId ?? null;
    if (id === previousId) return;
    previousId = id;
    logAudioEvent("device", headset ? `Headset connected: ${headset.label}` : "Headset disconnected", {
      detail: { deviceId: id },
    });
    onChange(headset);
  };
  navigator.mediaDevices.addEventListener("devicechange", handler);
  void handler();
  return () => navigator.mediaDevices.removeEventListener?.("devicechange", handler);
}
