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
  public async placeCall(
    params: PlaceCallParams
  ): Promise<RentmaikarCallSession> {
    const now = new Date().toISOString();

    const result =
      await backendBridge.invokeEdgeFunction<{
        success: boolean;
        callId?: string;
        results?: Array<{
          recipient: string;
          success: boolean;
          callSid?: string;
          error?: string;
        }>;
        conferenceName?: string | null;
        error?: string;
        message?: string;
      }>("initiate-voip-call", {
        engine: "twiml",
        recipients:
          params.recipients &&
          params.recipients.length > 0
            ? params.recipients
            : [
                {
                  phoneNumber:
                    params.toPhoneNumber,
                  displayName:
                    params.recipientName,
                  userId:
                    params.adminUserId,
                },
              ],
        callType:
          params.callType ||
          (
            params.recipients &&
            params.recipients.length > 1
              ? "group"
              : "individual"
          ),
        region: params.region || "USA",
        callerUserId: params.adminUserId,
        metadata: params.metadata || {},
      });

    if (
      result.error ||
      !result.data?.success ||
      !result.data.callId
    ) {
      throw new Error(
        result.error?.message ||
        result.data?.error ||
        result.data?.message ||
        "Backend did not create an authoritative TwiML call"
      );
    }

    const primaryResult =
      result.data.results?.[0];

    const session: RentmaikarCallSession = {
      id: result.data.callId,
      admin_user_id: params.adminUserId,
      calling_method: CallingMethod.TWIML,
      twilio_call_sid:
        primaryResult?.callSid,
      to_phone_number:
        params.toPhoneNumber,
      from_phone_number:
        params.fromPhoneNumber,
      recipient_name:
        params.recipientName,
      status:
        primaryResult?.success
          ? "in-progress"
          : "failed",
      direction: "outbound",
      region:
        params.region || "USA",
      created_at: now,
      started_at: now,
      metadata: {
        ...params.metadata,
        conferenceName:
          result.data.conferenceName,
        results:
          result.data.results,
      },
    };

    if (primaryResult?.error) {
      session.error_message =
        primaryResult.error;
    }

    this.sessionMap.set(
      session.id,
      session
    );

    return { ...session };
  }

  /**
   * Ends a TwiML call by requesting termination on backend.
   */
  public async endCall(sessionId: string, twilioCallSid?: string): Promise<boolean> {
    const session = this.sessionMap.get(sessionId);
    const targetSid = twilioCallSid || session?.twilio_call_sid;

    try {
      const res = await backendBridge.invokeEdgeFunction<{
        success: boolean;
        message?: string;
        error?: string;
      }>("end-voip-call", {
        callId: sessionId,
        callSid: targetSid,
      });

      const success = res.data?.success === true;

      if (!success) {
        console.warn(
          "[TwiMLAdapter] Backend did not confirm call termination:",
          res.error?.message || res.data?.error || res.data?.message
        );
        return false;
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
