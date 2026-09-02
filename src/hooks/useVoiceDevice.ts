import { useCallback, useEffect, useRef, useState } from "react";
import { Call, Device } from "@twilio/voice-sdk";
import { supabase } from "@/integrations/supabase/client";
import {
  AudioOutputRoute,
  ensureMediaPermissions,
  getMicPermissionState,
  MicPermissionState,
  resolveAudioOutput,
  unlockAudioOutput,
  watchAudioDevices,
  watchMicPermission,
} from "@/lib/media-permissions";
import {
  AudioPreferences,
  DEFAULT_AUDIO_PREFERENCES,
  loadAudioPreferences,
  saveAudioPreferences,
} from "@/lib/audio-preferences";
import { logAudioEvent, setDiagnosticsCallId } from "@/lib/audio-diagnostics";

interface TwilioAudioHelper {
  speakerDevices?: { set: (ids: string | string[]) => Promise<void> | void };
  ringtoneDevices?: { set: (ids: string | string[]) => Promise<void> | void };
  setInputDevice?: (id: string) => Promise<void>;
  isOutputSelectionSupported?: boolean;
}

/**
 * Route mic + speakers for a Twilio Device, explicitly selecting the requested
 * output (speaker / earpiece / Bluetooth) before the call connects.
 */
async function enableAudioDevices(
  device: Device | null,
  route: AudioOutputRoute = "default",
): Promise<boolean> {
  await unlockAudioOutput();
  const target = await resolveAudioOutput(route);
  const audio = device?.audio as TwilioAudioHelper | undefined;
  if (!audio) return false;
  let ok = true;
  try {
    if (audio.isOutputSelectionSupported) {
      await audio.speakerDevices?.set(target.deviceId);
      await audio.ringtoneDevices?.set(target.deviceId);
      logAudioEvent("routing", `Speaker + ringtone set to ${target.label}`, {
        detail: { route, deviceId: target.deviceId },
      });
    } else {
      logAudioEvent("routing", "Output selection unsupported — using OS audio route", {
        level: "warn",
        detail: { route },
      });
    }
    await audio.setInputDevice?.("default");
    logAudioEvent("device", "Microphone input set to default device");
  } catch (e) {
    ok = false;
    logAudioEvent("routing", "Audio device setup failed", {
      level: "error",
      detail: { reason: e instanceof Error ? e.message : String(e), route },
    });
  }
  return ok;
}

export type VoiceDeviceStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "connecting"
  | "on-call"
  | "unavailable";

interface UseVoiceDeviceResult {
  status: VoiceDeviceStatus;
  error: string | null;
  isMuted: boolean;
  incomingCall: Call | null;
  /** Live microphone permission state, updated when the user changes it. */
  micPermission: MicPermissionState;
  /** True when the user denied the microphone and calls cannot run. */
  permissionBlocked: boolean;
  /** Currently requested audio output route. */
  outputRoute: AudioOutputRoute;
  isSpeakerphone: boolean;
  /** Human-readable label of the active output device. */
  outputLabel: string;
  /** Registers the browser as a WebRTC client. Safe to call repeatedly. */
  initialize: () => Promise<boolean>;
  /** `support`, a `+E.164` number, or `client:user_<uuid>`. */
  startCall: (to: string, params?: Record<string, string>) => Promise<boolean>;
  hangUp: () => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  toggleSpeakerphone: () => Promise<void>;
  selectOutputRoute: (route: AudioOutputRoute) => Promise<void>;
  /** Saved routing/mute preferences, restored automatically on every call. */
  preferences: AudioPreferences;
  /** Turn automatic headset/Bluetooth switching on or off (persisted). */
  setAutoSwitchToHeadset: (enabled: boolean) => void;
  /** True when a headset/Bluetooth output is currently connected. */
  headsetConnected: boolean;
  /** Re-request permissions and re-apply audio routing after a failure. */
  reinitializeAudio: () => Promise<boolean>;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
}

export function useVoiceDevice(): UseVoiceDeviceResult {
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const prefsRef = useRef<AudioPreferences>(DEFAULT_AUDIO_PREFERENCES);
  const routeRef = useRef<AudioOutputRoute>("default");
  const previousRouteRef = useRef<AudioOutputRoute | null>(null);
  const [status, setStatus] = useState<VoiceDeviceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermissionState>("unknown");
  const [outputRoute, setOutputRoute] = useState<AudioOutputRoute>("default");
  const [outputLabel, setOutputLabel] = useState("System default");
  const [preferences, setPreferences] = useState<AudioPreferences>(DEFAULT_AUDIO_PREFERENCES);
  const [headsetConnected, setHeadsetConnected] = useState(false);

  // Restore the user's saved routing/mute choice for this device.
  useEffect(() => {
    const stored = loadAudioPreferences();
    prefsRef.current = stored;
    routeRef.current = stored.route;
    setPreferences(stored);
    setOutputRoute(stored.route);
    logAudioEvent("routing", `Restored saved audio route "${stored.route}"`, {
      detail: { muted: stored.muted, autoSwitchToHeadset: stored.autoSwitchToHeadset },
    });
  }, []);

  // Keep permission state fresh, including out-of-band browser setting changes.
  useEffect(() => {
    void getMicPermissionState().then(setMicPermission);
    const stop = watchMicPermission((state) => {
      setMicPermission(state);
      if (state === "denied") {
        setError("Microphone access was blocked. Calls cannot use your audio.");
        setStatus((prev) => (prev === "on-call" || prev === "connecting" ? prev : "unavailable"));
      } else if (state === "granted") {
        setError(null);
        // Permission restored mid-session — re-apply routing automatically.
        void applyAudio(routeRef.current);
      }
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyAudio = useCallback(async (route: AudioOutputRoute) => {
    const target = await resolveAudioOutput(route);
    setOutputLabel(target.label);
    if (deviceRef.current) await enableAudioDevices(deviceRef.current, route);
    return target;
  }, []);

  const attachCall = useCallback((call: Call) => {
    callRef.current = call;
    // Restore the saved mute state for this device.
    const savedMuted = prefsRef.current.muted;
    if (savedMuted) {
      try {
        call.mute(true);
      } catch {
        // Call not connected yet — re-applied on "accept" below.
      }
    }
    setIsMuted(savedMuted);
    setDiagnosticsCallId(
      (call as unknown as { parameters?: { CallSid?: string } }).parameters?.CallSid ??
        `local-${Date.now()}`,
    );
    logAudioEvent("call", "Call attached");
    call.on("accept", () => {
      setStatus("on-call");
      logAudioEvent("call", "Call accepted");
      // Re-assert routing at connect time: some platforms reset the sink.
      void enableAudioDevices(deviceRef.current, routeRef.current);
      if (prefsRef.current.muted) {
        call.mute(true);
        setIsMuted(true);
        logAudioEvent("device", "Restored saved mute state");
      }
    });
    call.on("mute", (muted: boolean) => {
      setIsMuted(muted);
      logAudioEvent("device", `Microphone ${muted ? "muted" : "unmuted"}`);
    });
    call.on("disconnect", () => {
      callRef.current = null;
      setStatus(deviceRef.current ? "ready" : "idle");
      logAudioEvent("call", "Call disconnected");
      setDiagnosticsCallId(null);
    });
    call.on("cancel", () => {
      callRef.current = null;
      setStatus(deviceRef.current ? "ready" : "idle");
      logAudioEvent("call", "Call cancelled");
      setDiagnosticsCallId(null);
    });
    call.on("error", (e: { message?: string }) => {
      setError(e?.message ?? "Call failed");
      callRef.current = null;
      setStatus(deviceRef.current ? "ready" : "idle");
      logAudioEvent("call", e?.message ?? "Call failed", { level: "error" });
      setDiagnosticsCallId(null);
    });
  }, []);

  const initialize = useCallback(async () => {
    if (deviceRef.current) return true;
    setStatus("initializing");
    setError(null);

    const micOk = await ensureMediaPermissions();
    setMicPermission(await getMicPermissionState());
    if (!micOk) {
      setError("Microphone access is required for in-app calls.");
      setStatus("unavailable");
      return false;
    }

    const { data, error: fnError } = await supabase.functions.invoke("voice-access-token");
    if (fnError || !data?.token) {
      setError(
        (data && typeof data.error === "string" ? data.error : fnError?.message) ??
          "Could not start the calling service.",
      );
      setStatus("unavailable");
      return false;
    }

    try {
      const device = new Device(data.token as string, {
        codecPreferences: ["opus", "pcmu"] as never,
        logLevel: "error" as never,
      });

      device.on("error", (e: { message?: string }) => {
        setError(e?.message ?? "Calling error");
        logAudioEvent("call", e?.message ?? "Calling error", { level: "error" });
      });
      device.on("incoming", (call: Call) => {
        setIncomingCall(call);
        attachCall(call);
      });
      device.on("tokenWillExpire", async () => {
        const { data: refreshed } = await supabase.functions.invoke("voice-access-token");
        if (refreshed?.token) device.updateToken(refreshed.token as string);
      });

      await device.register();
      deviceRef.current = device;
      await applyAudio(routeRef.current);
      setStatus("ready");
      logAudioEvent("device", "Voice device registered");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register for calls.");
      setStatus("unavailable");
      logAudioEvent("device", "Voice device registration failed", { level: "error" });
      return false;
    }
  }, [attachCall, applyAudio]);

  const reinitializeAudio = useCallback(async () => {
    logAudioEvent("device", "Reinitializing audio devices");
    const micOk = await ensureMediaPermissions();
    setMicPermission(await getMicPermissionState());
    if (!micOk) {
      setError("Microphone access is required for in-app calls.");
      setStatus((prev) => (prev === "on-call" ? prev : "unavailable"));
      return false;
    }
    setError(null);
    const ok = deviceRef.current
      ? await enableAudioDevices(deviceRef.current, routeRef.current)
      : await initialize();
    await applyAudio(routeRef.current);
    if (ok && status === "unavailable") setStatus(deviceRef.current ? "ready" : "idle");
    return ok;
  }, [applyAudio, initialize, status]);

  const startCall = useCallback(
    async (to: string, params?: Record<string, string>) => {
      const ready = deviceRef.current ? true : await initialize();
      if (!ready || !deviceRef.current) return false;

      // Always (re)acquire mic + speaker access right before dialling.
      const micOk = await ensureMediaPermissions();
      setMicPermission(await getMicPermissionState());
      if (!micOk) {
        setError("Microphone access is required for in-app calls.");
        setStatus("unavailable");
        return false;
      }
      // Explicitly select the output route before connecting; retry once when
      // the device setup fails (permissions may have just changed).
      const routed = await enableAudioDevices(deviceRef.current, routeRef.current);
      if (!routed) {
        logAudioEvent("routing", "Retrying audio setup before dialling", { level: "warn" });
        await enableAudioDevices(deviceRef.current, routeRef.current);
      }
      await applyAudio(routeRef.current);

      setStatus("connecting");
      setError(null);
      try {
        const call = await deviceRef.current.connect({ params: { To: to, ...(params ?? {}) } });
        attachCall(call);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not place the call.");
        setStatus("ready");
        logAudioEvent("call", "Outbound call failed", { level: "error" });
        return false;
      }
    },
    [applyAudio, attachCall, initialize],
  );

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
    callRef.current = null;
    setStatus(deviceRef.current ? "ready" : "idle");
    setDiagnosticsCallId(null);
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    const call = callRef.current;
    if (!call) return;
    call.mute(muted);
    const applied = call.isMuted();
    setIsMuted(applied);
    setPreferences(saveAudioPreferences({ muted: applied }));
    prefsRef.current = { ...prefsRef.current, muted: applied };
    logAudioEvent("device", `Mute set to ${applied}`);
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setMuted(!call.isMuted());
  }, [setMuted]);

  const selectOutputRoute = useCallback(
    async (route: AudioOutputRoute) => {
      routeRef.current = route;
      setOutputRoute(route);
      setPreferences(saveAudioPreferences({ route }));
      prefsRef.current = { ...prefsRef.current, route };
      logAudioEvent("routing", `Output route requested: ${route}`);
      await applyAudio(route);
    },
    [applyAudio],
  );

  const toggleSpeakerphone = useCallback(async () => {
    const next: AudioOutputRoute = routeRef.current === "speaker" ? "earpiece" : "speaker";
    await selectOutputRoute(next);
  }, [selectOutputRoute]);

  const acceptIncoming = useCallback(() => {
    void (async () => {
      const micOk = await ensureMediaPermissions();
      setMicPermission(await getMicPermissionState());
      if (!micOk) {
        setError("Microphone access is required to answer calls.");
        return;
      }
      await enableAudioDevices(deviceRef.current, routeRef.current);
      incomingCall?.accept();
      setIncomingCall(null);
    })();
  }, [incomingCall]);

  const rejectIncoming = useCallback(() => {
    incomingCall?.reject();
    setIncomingCall(null);
    callRef.current = null;
  }, [incomingCall]);

  const setAutoSwitchToHeadset = useCallback((enabled: boolean) => {
    prefsRef.current = { ...prefsRef.current, autoSwitchToHeadset: enabled };
    setPreferences(saveAudioPreferences({ autoSwitchToHeadset: enabled }));
    logAudioEvent("routing", `Automatic headset switching ${enabled ? "enabled" : "disabled"}`);
  }, []);

  // Headset / Bluetooth hot-plug: move the output automatically, even mid-call.
  useEffect(() => {
    const stop = watchAudioDevices((headset) => {
      setHeadsetConnected(!!headset);
      if (!prefsRef.current.autoSwitchToHeadset) return;
      if (headset) {
        if (routeRef.current === "bluetooth") {
          void applyAudio("bluetooth");
          return;
        }
        // Remember where to fall back to when the headset is unplugged.
        previousRouteRef.current = routeRef.current;
        routeRef.current = "bluetooth";
        setOutputRoute("bluetooth");
        logAudioEvent("routing", `Switching output to headset: ${headset.label}`);
        void applyAudio("bluetooth");
      } else if (routeRef.current === "bluetooth") {
        const fallback = previousRouteRef.current ?? "default";
        previousRouteRef.current = null;
        routeRef.current = fallback;
        setOutputRoute(fallback);
        logAudioEvent("routing", `Headset removed — falling back to "${fallback}"`);
        void applyAudio(fallback);
      }
    });
    return stop;
  }, [applyAudio]);

  useEffect(() => {
    return () => {
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
      deviceRef.current = null;
      setDiagnosticsCallId(null);
    };
  }, []);

  return {
    status,
    error,
    isMuted,
    incomingCall,
    micPermission,
    permissionBlocked: micPermission === "denied" || micPermission === "unsupported",
    outputRoute,
    isSpeakerphone: outputRoute === "speaker",
    outputLabel,
    preferences,
    setAutoSwitchToHeadset,
    headsetConnected,
    initialize,
    startCall,
    hangUp,
    toggleMute,
    setMuted,
    toggleSpeakerphone,
    selectOutputRoute,
    reinitializeAudio,
    acceptIncoming,
    rejectIncoming,
  };
}
