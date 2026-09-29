import { useState, useCallback } from "react";
import { useVoiceDevice } from "@/hooks/useVoiceDevice";
import { useVoIPCalls } from "@/hooks/useVoIPCalls";
import { useAdminTelephonyPreferences } from "@/hooks/useAdminTelephonyPreferences";
import { backendBridge } from "@/lib/backend-bridge";
import { useToast } from "@/hooks/use-toast";
import { TelephonyEngine, VoIPCall, CallRegion } from "@/types/voip";

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
 * Authoritative Telephony Control Layer
 * Harmonises:
 * 1. SOFTPHONE: Twilio Voice WebRTC via useVoiceDevice
 * 2. SERVER_REST: Twilio Cloud REST API via useVoIPCalls (initiate-voip-call)
 * 3. TWIML: Twilio TwiML App dynamic application routing
 */
export function useTelephonyControl() {
  const { toast } = useToast();
  const { preferences, setPreferredEngine, updatePreferences, loading: prefsLoading } = useAdminTelephonyPreferences();

  // Engine A: Browser WebRTC Softphone
  const softphone = useVoiceDevice();

  // Engine B: Twilio Server REST API Calls
  const serverRest = useVoIPCalls();

  // Unified controller state
  const [activeEngine, setActiveEngine] = useState<TelephonyEngine | null>(null);
  const [isDialingTwiml, setIsDialingTwiml] = useState<boolean>(false);
  const [twimlCallInfo, setTwimlCallInfo] = useState<{ callSid?: string; recipient?: string } | null>(null);

  // Check which engine is currently connected/active
  const isSoftphoneActive = softphone.isCallActive || softphone.status === "in-call" || softphone.status === "connecting";
  const isServerRestActive = serverRest.activeCalls.length > 0;
  const isTwimlActive = isDialingTwiml || Boolean(twimlCallInfo);

  const isInCall = isSoftphoneActive || isServerRestActive || isTwimlActive;

  // Determine current active engine
  const currentEngine: TelephonyEngine = activeEngine || preferences.preferred_engine || "SOFTPHONE";

  /**
   * Universal Dialing Entrypoint:
   * Dynamically routes through the selected/preferred Telephony Engine
   */
  const initiateCall = useCallback(
    async (params: ControlledCallInitiateParams): Promise<boolean> => {
      const engineToUse: TelephonyEngine = params.overrideEngine || preferences.preferred_engine || "SOFTPHONE";
      const region = params.region || preferences.region || "USA";
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
        switch (engineToUse) {
          case "SOFTPHONE": {
            // ENGINE A: WebRTC Softphone
            if (
  softphone.status !== "ready" &&
  softphone.status !== "on-call" &&
  softphone.status !== "connecting"
) {
  const ready = await softphone.initialize();

  if (!ready) {
    toast({
      title: "Softphone Connection Issue",
      description:
        "The calling service could not be initialized.",
      variant: "destructive",
    });

    return false;
  }
}

            const success = await softphone.startCall(phoneNumber, {
              recipientName: params.recipientName,
              region,
            });

            if (!success) {
              toast({
                title: "Softphone Connection Issue",
                description: "WebRTC call could not be started. Check microphone permissions.",
                variant: "destructive",
              });
              return false;
            }

            return true;
          }

          case "SERVER_REST": {
            // ENGINE B: Twilio Server REST Calls
            const recipients = params.recipients?.length
              ? params.recipients
              : [{ phoneNumber, displayName: params.recipientName }];

            const res = await serverRest.initiateCall({
              callType: params.callType || (recipients.length > 1 ? "group" : "individual"),
              region,
              recipients,
            });

            if (!res?.success) {
              toast({
                title: "Server REST Call Failed",
                description: "The backend could not dispatch the Twilio REST call.",
                variant: "destructive",
              });
              return false;
            }

            return true;
          }

          case "TWIML": {
            // ENGINE C: Twilio TwiML App Dialing
            setIsDialingTwiml(true);
            setTwimlCallInfo({ recipient: phoneNumber });

            // Invoke authoritative backend route for TwiML App dial
            const bridgeRes = await backendBridge.invokeEdgeFunction("voice-twiml-dial", {
              To: phoneNumber,
              Region: region,
              From: preferences.caller_id || undefined,
            });

            if (bridgeRes.error || (bridgeRes.data && (bridgeRes.data as any).error)) {
              const errMsg = bridgeRes.error?.message || (bridgeRes.data as any)?.error || "TwiML execution error";
              toast({
                title: "TwiML Dialing Failed",
                description: errMsg,
                variant: "destructive",
              });
              setIsDialingTwiml(false);
              setTwimlCallInfo(null);
              return false;
            }

            toast({
              title: "TwiML Dial Dispatched",
              description: `TwiML routing generated for ${phoneNumber}. Connecting Twilio conference leg...`,
            });

            // Also synchronize with softphone if WebRTC device is ready to connect the admin's leg
            if (softphone.isReady && !softphone.isCallActive) {
              try {
                await softphone.startCall(phoneNumber, {
                  recipientName: params.recipientName,
                  region,
                });
              } catch (e) {
                console.warn("[TwiML Control] Softphone auto-connect note:", e);
              }
            }

            return true;
          }

          default:
            throw new Error(`Unknown telephony engine: ${engineToUse}`);
        }
      } catch (err: any) {
        toast({
          title: "Call Execution Failed",
          description: err.message || "An unexpected error occurred while initiating the call.",
          variant: "destructive",
        });
        setActiveEngine(null);
        return false;
      }
    },
    [preferences, softphone, serverRest, toast]
  );

  /**
   * Universal Call Termination:
   * Gracefully tears down calls across any active engine
   */
  const endCall = useCallback(
  async (callId?: string): Promise<boolean> => {
    try {
      let terminated = false;

      /*
       * 1. AUTHORITATIVE TERMINATION
       *
       * If we have a canonical backend call ID, terminate the
       * provider-side call first.
       */
      if (callId) {
        terminated = await serverRest.endCall(callId);
      } else if (serverRest.activeCalls.length > 0) {
        for (const call of serverRest.activeCalls) {
          const result = await serverRest.endCall(call.id);

          if (!result) {
            return false;
          }

          terminated = true;
        }
      }

      /*
       * 2. LOCAL SOFTPHONE CLEANUP
       *
       * This does NOT terminate the provider call.
       * The provider has already been terminated above.
       */
      if (
        softphone.status === "on-call" ||
        softphone.status === "connecting"
      ) {
        await softphone.hangUp();
        terminated = true;
      }

      /*
       * 3. CLEAR TWIML STATE
       */
      if (isDialingTwiml || twimlCallInfo) {
        setIsDialingTwiml(false);
        setTwimlCallInfo(null);
        terminated = true;
      }

      /*
       * 4. CLEAR CONTROLLER ENGINE STATE
       */
      setActiveEngine(null);

      return terminated;
    } catch (err: any) {
      console.error(
        "[Telephony Control] Error terminating call:",
        err
      );

      return false;
    }
  },
  [
    serverRest,
    softphone,
    isDialingTwiml,
    twimlCallInfo,
  ]
);

  // Mute control
  const toggleMute = useCallback(() => {
    if (softphone.isCallActive) {
      softphone.toggleMute();
    }
  }, [softphone]);

  // Hold control
  const toggleHold = useCallback(() => {
    if (softphone.isCallActive) {
      softphone.toggleHold();
    }
  }, [softphone]);

  // Send DTMF digits
  const sendDigits = useCallback(
    (digits: string) => {
      if (softphone.isCallActive) {
        softphone.sendDigits(digits);
      }
    },
    [softphone]
  );

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
    isConnecting: softphone.status === "connecting" || isDialingTwiml,
    isMuted: softphone.isMuted,
    isOnHold: softphone.isOnHold,

    // Universal operations
    initiateCall,
    endCall,
    toggleMute,
    toggleHold,
    sendDigits,

    // Underlying engine instances (never disabled)
    engines: {
      softphone,
      serverRest,
      twiml: {
        isDialing: isDialingTwiml,
        callInfo: twimlCallInfo,
      },
    },
  };
}
