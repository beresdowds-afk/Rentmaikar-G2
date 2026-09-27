import {
  CallingMethod,
  ITelephonyAdapter,
  PlaceCallParams,
  RentmaikarCallSession,
  CallSessionStatus,
} from "@/types/telephony";
import { backendBridge } from "@/lib/backend-bridge";

/**
 * ServerRestAdapter
 * Implements ITelephonyAdapter for Twilio Cloud REST API server-initiated calls.
 * All operations pass strictly through backendBridge to the authoritative backend service.
 */
export class ServerRestAdapter implements ITelephonyAdapter {
  public readonly callingMethod: CallingMethod = CallingMethod.SERVER_REST;
  private sessionMap: Map<string, RentmaikarCallSession> = new Map();

  public isAvailable(): boolean {
    return true; // Available on all platforms since initiation happens server-side
  }

  /**
   * Places an outbound call via Twilio REST API on the backend.
   */
  public async placeCall(params: PlaceCallParams): Promise<RentmaikarCallSession> {
    const now = new Date().toISOString();
    const recipients =
      params.recipients && params.recipients.length > 0
        ? params.recipients
        : [
            {
              phoneNumber: params.toPhoneNumber,
              displayName: params.recipientName,
              userId: params.adminUserId,
            },
          ];

    const callPayload = {
      recipients,
      callType: params.callType || (recipients.length > 1 ? "group" : "individual"),
      region: params.region || "USA",
      callerUserId: params.adminUserId,
      metadata: params.metadata || {},
    };

    const bridgeResult = await backendBridge.invokeEdgeFunction<{
      success: boolean;
      callId?: string;
      results?: Array<{ recipient: string; success: boolean; callSid?: string; error?: string }>;
      conferenceName?: string | null;
      error?: string;
      message?: string;
    }>("initiate-voip-call", callPayload);

    if (bridgeResult.error || !bridgeResult.data?.success) {
      const errMsg =
        bridgeResult.error?.message ||
        bridgeResult.data?.error ||
        bridgeResult.data?.message ||
        "Failed to initiate server REST call";
      throw new Error(errMsg);
    }

    const data = bridgeResult.data;
    const callId = data.callId || `rest-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const primaryResult = data.results?.[0];

    const session: RentmaikarCallSession = {
      id: callId,
      admin_user_id: params.adminUserId,
      calling_method: CallingMethod.SERVER_REST,
      twilio_call_sid: primaryResult?.callSid,
      to_phone_number: params.toPhoneNumber,
      from_phone_number: params.fromPhoneNumber,
      recipient_name: params.recipientName,
      status: primaryResult?.success ? "in-progress" : "failed",
      direction: "outbound",
      region: params.region || "USA",
      created_at: now,
      started_at: now,
      metadata: {
        ...params.metadata,
        conferenceName: data.conferenceName,
        results: data.results,
      },
    };

    if (primaryResult?.error) {
      session.error_message = primaryResult.error;
    }

    this.sessionMap.set(callId, session);
    return { ...session };
  }

  /**
   * Ends an active REST call by asking backend to terminate Twilio call leg.
   */
  public async endCall(sessionId: string, twilioCallSid?: string): Promise<boolean> {
    const session = this.sessionMap.get(sessionId);
    const targetSid = twilioCallSid || session?.twilio_call_sid;

    try {
      const res = await backendBridge.invokeEdgeFunction<{
        success: boolean;
        message?: string;
      }>("end-voip-call", {
        callId: sessionId,
        callSid: targetSid,
      });

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

      return res.data?.success ?? true;
    } catch (err) {
      console.warn("[ServerRestAdapter] endCall error:", err);
      if (session) {
        session.status = "completed";
        session.ended_at = new Date().toISOString();
        this.sessionMap.set(sessionId, session);
      }
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
        providerStatus?: string;
        databaseStatus?: string;
        active: boolean;
        callSid?: string;
        message?: string;
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
        } else if (targetId) {
          // Recreate session representation if not previously cached
          const reconstructed: RentmaikarCallSession = {
            id: targetId,
            admin_user_id: "",
            calling_method: CallingMethod.SERVER_REST,
            twilio_call_sid: response.data.callSid || callSid,
            to_phone_number: "",
            status: mappedStatus,
            direction: "outbound",
            created_at: new Date().toISOString(),
          };
          this.sessionMap.set(targetId, reconstructed);
          return reconstructed;
        }
      }
    } catch (err) {
      console.warn("[ServerRestAdapter] Reconcile failed:", err);
    }

    return session ? { ...session } : null;
  }
}
