import {
  CallingMethod,
  ITelephonyAdapter,
  PlaceCallParams,
  RentmaikarCallSession,
  CallSessionStatus,
} from "@/types/telephony";
import { backendBridge } from "@/lib/backend-bridge";

export interface SoftphoneDeviceBridge {
  connect(params: { to: string; customParams?: Record<string, string> }): Promise<any>;
  disconnect(): void;
  isReady: boolean;
}

/**
 * SoftphoneAdapter
 * Implements ITelephonyAdapter for WebRTC Browser-based calling via Twilio Voice SDK.
 * All backend communications are strictly routed through backendBridge (no direct Supabase function calls).
 */
export class SoftphoneAdapter implements ITelephonyAdapter {
  public readonly callingMethod: CallingMethod = CallingMethod.SOFTPHONE;
  private deviceBridge: SoftphoneDeviceBridge | null = null;
  private sessionMap: Map<string, RentmaikarCallSession> = new Map();

  constructor(deviceBridge?: SoftphoneDeviceBridge) {
    if (deviceBridge) {
      this.deviceBridge = deviceBridge;
    }
  }

  /**
   * Attaches or updates the active browser WebRTC device bridge
   */
  public attachDeviceBridge(bridge: SoftphoneDeviceBridge | null): void {
    this.deviceBridge = bridge;
  }

  public isAvailable(): boolean {
    return typeof window !== "undefined" && Boolean(window.navigator?.mediaDevices);
  }

  /**
   * Places an outbound call via WebRTC Softphone engine.
   * Fetches the necessary Twilio Voice JWT token via backendBridge,
   * creates an authoritative call session, and triggers browser WebRTC connection.
   */
  public async placeCall(
    params: PlaceCallParams
  ): Promise<RentmaikarCallSession> {
    const now = new Date().toISOString();

    // Ask the authoritative backend to create the canonical
    // voip_calls record. This does NOT create a second Twilio
    // call; the browser Device.connect() does that.
    const prepareResult =
      await backendBridge.invokeEdgeFunction<{
        success: boolean;
        callId?: string;
        results?: Array<{
          recipient: string;
          success: boolean;
          callSid?: string;
          error?: string;
        }>;
        error?: string;
        message?: string;
      }>("initiate-voip-call", {
        engine: "softphone",
        recipients: [
          {
            phoneNumber: params.toPhoneNumber,
            displayName: params.recipientName,
            userId: params.adminUserId,
          },
        ],
        callType: params.callType || "individual",
        region: params.region || "USA",
        callerUserId: params.adminUserId,
        metadata: params.metadata || {},
      });

    if (
      prepareResult.error ||
      !prepareResult.data?.success ||
      !prepareResult.data.callId
    ) {
      throw new Error(
        prepareResult.error?.message ||
        prepareResult.data?.error ||
        prepareResult.data?.message ||
        "Backend did not create an authoritative softphone call"
      );
    }

    const sessionId = prepareResult.data.callId;

    const session: RentmaikarCallSession = {
      id: sessionId,
      admin_user_id: params.adminUserId,
      calling_method: CallingMethod.SOFTPHONE,
      to_phone_number: params.toPhoneNumber,
      from_phone_number: params.fromPhoneNumber,
      recipient_name: params.recipientName,
      status: "initiated",
      direction: "outbound",
      region: params.region || "USA",
      created_at: now,
      started_at: now,
      metadata: params.metadata || {},
    };

    this.sessionMap.set(sessionId, session);

    // 1. Authoritative Backend Minting: Fetch Twilio Voice access token via backend gateway
    const tokenResult = await backendBridge.invokeEdgeFunction<{
      token?: string;
      identity?: string;
      error?: string;
    }>("voice-access-token", {
      identity: params.adminUserId || "rentmaikar-admin",
      region: params.region || "USA",
    });

    if (tokenResult.error || !tokenResult.data?.token) {
      session.status = "failed";
      session.error_message =
        tokenResult.error?.message || tokenResult.data?.error || "Failed to mint voice access token";
      session.ended_at = new Date().toISOString();
      this.sessionMap.set(sessionId, session);
      throw new Error(session.error_message);
    }

    // 2. Connect via attached WebRTC softphone device if present
    if (this.deviceBridge) {
      try {
        session.status = "ringing";
        await this.deviceBridge.connect({
          to: params.toPhoneNumber,
          customParams: {
            adminUserId: params.adminUserId,
            sessionId,
            SessionId: sessionId,
            region: params.region || "USA",
            ...(params.recipientName
              ? { recipientName: params.recipientName }
              : {}),
          },
        });
        session.status = "in-progress";
      } catch (err: any) {
        session.status = "failed";
        session.error_message = err?.message || "WebRTC softphone connection failed";
        session.ended_at = new Date().toISOString();
        this.sessionMap.set(sessionId, session);
        throw err;
      }
    } else {
      // Softphone session initiated; ready for WebRTC device attachment
      session.status = "in-progress";
    }

    this.sessionMap.set(sessionId, session);
    return { ...session };
  }

  /**
   * Ends an active softphone session.
   * Disconnects browser audio and instructs backend to terminate any active Twilio call leg.
   */
  public async endCall(
    sessionId: string,
    twilioCallSid?: string
  ): Promise<boolean> {
    const session = this.sessionMap.get(sessionId);

    if (!sessionId) {
      return false;
    }

    const targetSid =
      twilioCallSid ||
      session?.twilio_call_sid;

    try {
      // Backend/provider termination MUST happen first.
      const response =
        await backendBridge.invokeEdgeFunction<{
          success: boolean;
          message?: string;
          error?: string;
        }>("end-voip-call", {
          callId: sessionId,
          callSid: targetSid,
        });

      if (
        response.error ||
        !response.data?.success
      ) {
        console.warn(
          "[SoftphoneAdapter] Backend did not confirm call termination:",
          response.error?.message ||
            response.data?.error ||
            response.data?.message
        );

        return false;
      }

      // Only after authoritative termination succeeds
      // do we disconnect the browser SDK.
      if (this.deviceBridge) {
        try {
          this.deviceBridge.disconnect();
        } catch (err) {
          console.warn(
            "[SoftphoneAdapter] Local device disconnect failed:",
            err
          );
        }
      }

      if (session) {
        session.status = "completed";
        session.ended_at =
          new Date().toISOString();

        if (session.started_at) {
          session.duration_seconds =
            Math.round(
              (
                new Date(session.ended_at).getTime() -
                new Date(session.started_at).getTime()
              ) / 1000
            );
        }

        this.sessionMap.set(
          sessionId,
          session
        );
      }

      return true;
    } catch (err) {
      console.warn(
        "[SoftphoneAdapter] endCall failed:",
        err
      );

      // Do NOT falsely mark the session completed.
      return false;
    }
  }

  /**
   * Reconciles call status against backend status service
   */
  public async reconcileCall(
    sessionId?: string,
    twilioCallSid?: string
  ): Promise<RentmaikarCallSession | null> {
    const targetId = sessionId || "";
    let session = this.sessionMap.get(targetId);

    const callSid = twilioCallSid || session?.twilio_call_sid;

    if (!callSid && !targetId) {
      return session ? { ...session } : null;
    }

    try {
      const response = await backendBridge.invokeEdgeFunction<{
        success: boolean;
        callId?: string;
        providerStatus?: string;
        databaseStatus?: string;
        active: boolean;
        callSid?: string;
      }>("get-voip-call-status", {
        callId: targetId,
        callSid,
      });

      if (response.data && response.data.success) {
        const canonicalCallId = response.data.callId || targetId;
        if (!session && canonicalCallId) {
          session = this.sessionMap.get(canonicalCallId);
        }

        const statusMap: Record<string, CallSessionStatus> = {
          queued: "initiated",
          initiated: "initiated",
          ringing: "ringing",
          "in-progress": "in-progress",
          completed: "completed",
          busy: "busy",
          failed: "failed",
          "no-answer": "no-answer",
          canceled: "canceled",
        };

        const mappedStatus =
          statusMap[response.data.providerStatus || ""] ||
          statusMap[response.data.databaseStatus || ""] ||
          (response.data.active ? "in-progress" : "completed");

        if (session) {
          if (canonicalCallId) {
            session.id = canonicalCallId;
          }
          session.status = mappedStatus;
          if (response.data.callSid) {
            session.twilio_call_sid = response.data.callSid;
          }
          if (!response.data.active && !session.ended_at) {
            session.ended_at = new Date().toISOString();
          }
          if (canonicalCallId) {
            this.sessionMap.set(canonicalCallId, session);
            if (targetId && targetId !== canonicalCallId) {
              this.sessionMap.delete(targetId);
            }
          }
          return { ...session };
        } else if (canonicalCallId) {
          const reconstructed: RentmaikarCallSession = {
            id: canonicalCallId,
            admin_user_id: "",
            calling_method: CallingMethod.SOFTPHONE,
            twilio_call_sid: response.data.callSid || callSid,
            to_phone_number: "",
            status: mappedStatus,
            direction: "outbound",
            created_at: new Date().toISOString(),
          };
          this.sessionMap.set(canonicalCallId, reconstructed);
          return reconstructed;
        }
      }
    } catch (err) {
      console.warn("[SoftphoneAdapter] Reconcile query failed:", err);
    }

    return session ? { ...session } : null;
  }
}
