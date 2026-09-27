import {
  CallingMethod,
  ITelephonyAdapter,
  PlaceCallParams,
  RentmaikarCallSession,
  CallSessionStatus,
} from "@/types/telephony";
import { backendBridge } from "@/lib/backend-bridge";

/**
 * TwiMLAdapter
 * Implements ITelephonyAdapter for Twilio TwiML App dynamic application routing.
 * Triggers backend TwiML instructions via backendBridge with automatic bridge callbacks.
 */
export class TwiMLAdapter implements ITelephonyAdapter {
  public readonly callingMethod: CallingMethod = CallingMethod.TWIML;
  private sessionMap: Map<string, RentmaikarCallSession> = new Map();

  public isAvailable(): boolean {
    return true;
  }

  /**
   * Places an outbound call via TwiML dial instruction.
   */
  public async placeCall(params: PlaceCallParams): Promise<RentmaikarCallSession> {
    const sessionId = `twiml-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const session: RentmaikarCallSession = {
      id: sessionId,
      admin_user_id: params.adminUserId,
      calling_method: CallingMethod.TWIML,
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

    // Invoke authoritative voice-twiml-dial endpoint via backendBridge
    const result = await backendBridge.invokeEdgeFunction<{
      twiml?: string;
      success?: boolean;
      callSid?: string;
      error?: string;
    }>("voice-twiml-dial", {
      To: params.toPhoneNumber,
      From: params.fromPhoneNumber,
      Region: params.region || "USA",
      sessionId,
      callerUserId: params.adminUserId,
    });

    if (result.error || (result.data && result.data.success === false)) {
      const errMsg =
        result.error?.message || result.data?.error || "Failed to initiate TwiML dial route";
      session.status = "failed";
      session.error_message = errMsg;
      session.ended_at = new Date().toISOString();
      this.sessionMap.set(sessionId, session);
      throw new Error(errMsg);
    }

    if (result.data?.callSid) {
      session.twilio_call_sid = result.data.callSid;
    }

    session.status = "in-progress";
    this.sessionMap.set(sessionId, session);
    return { ...session };
  }

  /**
   * Ends a TwiML call by requesting termination on backend.
   */
  public async endCall(sessionId: string, twilioCallSid?: string): Promise<boolean> {
    const session = this.sessionMap.get(sessionId);
    const targetSid = twilioCallSid || session?.twilio_call_sid;

    try {
      if (targetSid || sessionId) {
        await backendBridge.invokeEdgeFunction("end-voip-call", {
          callId: sessionId,
          callSid: targetSid,
        });
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
    } catch (err) {
      console.warn("[TwiMLAdapter] endCall error:", err);
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
      console.warn("[TwiMLAdapter] Reconcile failed:", err);
    }

    return session ? { ...session } : null;
  }
}
