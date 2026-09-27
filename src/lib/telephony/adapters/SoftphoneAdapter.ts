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
  public async placeCall(params: PlaceCallParams): Promise<RentmaikarCallSession> {
    const sessionId = `softphone-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

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
            region: params.region || "USA",
            ...(params.recipientName ? { recipientName: params.recipientName } : {}),
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
  public async endCall(sessionId: string, twilioCallSid?: string): Promise<boolean> {
    const session = this.sessionMap.get(sessionId);

    // 1. Disconnect browser device bridge if attached
    if (this.deviceBridge) {
      try {
        this.deviceBridge.disconnect();
      } catch (err) {
        console.warn("[SoftphoneAdapter] Error disconnecting device bridge:", err);
      }
    }

    // 2. Terminate backend call leg via authoritative gateway
    const targetSid = twilioCallSid || session?.twilio_call_sid;
    if (targetSid || sessionId) {
      try {
        await backendBridge.invokeEdgeFunction("end-voip-call", {
          callId: sessionId,
          callSid: targetSid,
        });
      } catch (err) {
        console.warn("[SoftphoneAdapter] Failed to invoke end-voip-call:", err);
      }
    }

    if (session) {
      session.status = "completed";
      session.ended_at = new Date().toISOString();
      if (session.started_at) {
        session.duration_seconds = Math.round(
          (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000
        );
      }
      this.sessionMap.set(sessionId, session);
    }

    return true;
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
        providerStatus?: string;
        databaseStatus?: string;
        active: boolean;
        callSid?: string;
      }>("get-voip-call-status", {
        callId: targetId,
        callSid,
      });

      if (response.data && response.data.success) {
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
          session.status = mappedStatus;
          if (response.data.callSid) {
            session.twilio_call_sid = response.data.callSid;
          }
          if (!response.data.active && !session.ended_at) {
            session.ended_at = new Date().toISOString();
          }
          this.sessionMap.set(targetId, session);
          return { ...session };
        }
      }
    } catch (err) {
      console.warn("[SoftphoneAdapter] Reconcile query failed:", err);
    }

    return session ? { ...session } : null;
  }
}
