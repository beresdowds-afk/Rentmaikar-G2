import { useState, useCallback, useEffect, useMemo } from "react";
import { useVoiceDevice } from "@/hooks/useVoiceDevice";
import { useAdminTelephonyPreferences } from "@/hooks/useAdminTelephonyPreferences";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRegion } from "@/contexts/RegionContext";
import { TelephonyEngine, VoIPCall, CallRegion } from "@/types/voip";
import { CallingMethod, RentmaikarCallSession } from "@/types/telephony";
import { telephonyController } from "@/lib/telephony";

export interface ControlledCallInitiateParams {
  phoneNumber: string;
  recipientName?: string;
  region?: CallRegion;
  callType?: "individual" | "group";
  recipients?: Array<{ phoneNumber: string; displayName?: string; userId?: string }>;
  overrideEngine?: TelephonyEngine;
}

export interface ControlledCallState {
  activeEngine: TelephonyEngine | null;
  isConnecting: boolean;
  isInCall: boolean;
  activeCall: VoIPCall | null;
  activeCallSid?: string;
  activeRecipient?: string;
  error?: string | null;
}

/**
 * Authoritative Telephony Control Hook
 * Delegates all call placement and termination strictly to the canonical TelephonyController.
 * Maintains one canonical active session without running parallel call tracking hooks.
 * Harmonises:
 * 1. SOFTPHONE: Twilio Voice WebRTC via SoftphoneAdapter attached to useVoiceDevice
 * 2. SERVER_REST: Twilio Cloud REST API via ServerRestAdapter
 * 3. TWIML: Twilio TwiML App dynamic application routing via TwiMLAdapter
 */
export function useTelephonyControl() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentRegion } = useRegion();
  const defaultRegion = currentRegion?.name || currentRegion?.code || "Global";
  const { preferences, setPreferredEngine, updatePreferences, loading: prefsLoading } = useAdminTelephonyPreferences();

  // Engine A: Browser WebRTC Softphone
  const softphone = useVoiceDevice();

  // Canonical active telephony session from TelephonyController (sole authority)
  const [activeSession, setActiveSession] = useState<RentmaikarCallSession | null>(() =>
    telephonyController.getActiveSession()
  );
  const [activeEngine, setActiveEngine] = useState<TelephonyEngine | null>(null);

  // Keep activeSession in sync with TelephonyController
  useEffect(() => {
    return telephonyController.onSessionChange((session) => {
      setActiveSession(session);
      if (session) {
        setActiveEngine(session.calling_method as TelephonyEngine);
      } else {
        setActiveEngine(null);
      }
    });
  }, []);

  // Bridge the live browser WebRTC device to the TelephonyController's SoftphoneAdapter
  useEffect(() => {
    telephonyController.softphoneAdapter.attachDeviceBridge({
      connect: async ({ to, customParams }) => {
        return await softphone.startCall(to, customParams);
      },
      disconnect: () => {
        void softphone.hangUp(false);
      },
    });

    return () => {
      telephonyController.softphoneAdapter.attachDeviceBridge(null);
    };
  }, [softphone]);

  const methodMap = useMemo<Record<TelephonyEngine, CallingMethod>>(() => ({
    SOFTPHONE: CallingMethod.SOFTPHONE,
    SERVER_REST: CallingMethod.SERVER_REST,
    TWIML: CallingMethod.TWIML,
  }), []);

  // Engine status calculation based on canonical session and browser device
  const isSoftphoneActive = softphone.status === "on-call" || softphone.status === "connecting";
  const isInCall = Boolean(activeSession) || isSoftphoneActive;
  const currentEngine: TelephonyEngine = activeEngine || preferences.preferred_engine || "SOFTPHONE";

  /**
   * Universal Dialing Entrypoint:
   * Dynamically routes call placement through the canonical TelephonyController.
   */
  const initiateCall = useCallback(
    async (params: ControlledCallInitiateParams): Promise<boolean> => {
      const engineToUse: TelephonyEngine = params.overrideEngine || preferences.preferred_engine || "SOFTPHONE";
      const region =
        params.region ||
        preferences.region ||
        (defaultRegion as CallRegion) ||
        "Global";
      const phoneNumber = params.phoneNumber.trim();

      if (!phoneNumber && (!params.recipients || params.recipients.length === 0)) {
        toast({
          title: "Phone Number Required",
          description: "Please specify a destination phone number to dial.",
          variant: "destructive",
        });
        return false;
      }

      setActiveEngine(engineToUse);

      try {
        const callingMethod = methodMap[engineToUse] || CallingMethod.SOFTPHONE;

        // If placing via SOFTPHONE, ensure browser audio device is ready
        if (callingMethod === CallingMethod.SOFTPHONE) {
          if (
            softphone.status !== "ready" &&
            softphone.status !== "on-call" &&
            softphone.status !== "connecting"
          ) {
            const ready = await softphone.initialize();
            if (!ready) {
              toast({
                title: "Softphone Connection Issue",
                description: "The calling service could not be initialized. Check microphone permissions.",
                variant: "destructive",
              });
              setActiveEngine(null);
              return false;
            }
          }
        }

        const session = await telephonyController.placeCall(callingMethod, {
          adminUserId: user?.id || "rentmaikar-admin",
          toPhoneNumber: phoneNumber,
          fromPhoneNumber: preferences.caller_id || undefined,
          recipientName: params.recipientName,
          region,
          callType: params.callType || (params.recipients && params.recipients.length > 1 ? "group" : "individual"),
          recipients: params.recipients?.length
            ? params.recipients
            : [{ phoneNumber, displayName: params.recipientName, userId: user?.id }],
          metadata: {
            source: "useTelephonyControl",
            requestedEngine: engineToUse,
          },
        });

        toast({
          title: "Call Dispatched",
          description: `Outbound call to ${phoneNumber} initiated via ${callingMethod}.`,
        });

        return Boolean(session?.id);
      } catch (err: any) {
        console.error("[Telephony Control] Error initiating call:", err);
        toast({
          title: "Call Execution Failed",
          description: err.message || "An unexpected error occurred while initiating the call.",
          variant: "destructive",
        });
        setActiveEngine(null);
        return false;
      }
    },
    [methodMap, preferences, softphone, toast, user]
  );

  /**
   * Universal Call Termination:
   * Gracefully tears down calls through the canonical TelephonyController.
   */
  const endCall = useCallback(
    async (callId?: string): Promise<boolean> => {
      try {
        let terminated = false;
        const currentActive = telephonyController.getActiveSession();
        const targetSessionId = callId || currentActive?.id;

        if (targetSessionId && currentActive) {
          terminated = await telephonyController.endCall(
            currentActive.calling_method,
            targetSessionId,
            currentActive.twilio_call_sid
          );
        } else if (targetSessionId) {
          const method = activeEngine ? methodMap[activeEngine] : CallingMethod.SERVER_REST;
          terminated = await telephonyController.endCall(method, targetSessionId);
        } else {
          terminated = await telephonyController.endActiveCall();
        }

        // Hang up local WebRTC browser audio session if active
        if (softphone.status === "on-call" || softphone.status === "connecting") {
          await softphone.hangUp();
          terminated = true;
        }

        setActiveEngine(null);
        return terminated;
      } catch (err: any) {
        console.error("[Telephony Control] Error terminating call:", err);
        if (softphone.status === "on-call" || softphone.status === "connecting") {
          await softphone.hangUp();
        }
        setActiveEngine(null);
        return false;
      }
    },
    [activeEngine, methodMap, softphone]
  );

  // Mute control
  const toggleMute = useCallback(() => {
    if (softphone.status === "on-call") {
      softphone.toggleMute();
    }
  }, [softphone]);

  // Hold control (safe fallback)
  const toggleHold = useCallback(() => {
    // Note: Provider-level hold handled in backend / future roadmap
  }, []);

  // Send DTMF digits
  const sendDigits = useCallback((_digits: string) => {
    // Note: DTMF handled via Twilio SDK when connected
  }, []);

  return {
    // Engine preference controls
    preferredEngine: preferences.preferred_engine,
    setPreferredEngine,
    preferences,
    updatePreferences,
    prefsLoading,

    // Active state
    currentEngine,
    isInCall,
    isConnecting: softphone.status === "connecting" || activeSession?.status === "ringing",
    isMuted: softphone.isMuted,
    isOnHold: false,
    activeSession,

    // Universal operations
    initiateCall,
    endCall,
    toggleMute,
    toggleHold,
    sendDigits,

    // Underlying engine instances (never disabled)
    engines: {
      softphone,
      serverRest: telephonyController.serverRestAdapter,
      twiml: {
        isDialing: activeSession?.calling_method === CallingMethod.TWIML && activeSession?.status === "ringing",
        callInfo:
          activeSession?.calling_method === CallingMethod.TWIML
            ? { callSid: activeSession?.twilio_call_sid, recipient: activeSession?.to_phone_number }
            : null,
      },
    },
  };
}
