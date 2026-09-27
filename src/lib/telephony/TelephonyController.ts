import {
  CallingMethod,
  ITelephonyAdapter,
  ITelephonyController,
  PlaceCallParams,
  RentmaikarCallSession,
} from "@/types/telephony";
import { SoftphoneAdapter } from "./adapters/SoftphoneAdapter";
import { ServerRestAdapter } from "./adapters/ServerRestAdapter";
import { TwiMLAdapter } from "./adapters/TwiMLAdapter";

export interface TelephonyControllerConfig {
  softphoneAdapter?: SoftphoneAdapter;
  serverRestAdapter?: ServerRestAdapter;
  twimlAdapter?: TwiMLAdapter;
}

type SessionChangeListener = (session: RentmaikarCallSession | null) => void;

/**
 * TelephonyController
 * Canonical Controller for RentMaikar Telephony Layer.
 * Holds and delegates to SoftphoneAdapter, ServerRestAdapter, and TwiMLAdapter
 * to execute calling engine logic, end calls, and reconcile authoritative statuses.
 */
export class TelephonyController implements ITelephonyController {
  private static instance: TelephonyController | null = null;

  public readonly softphoneAdapter: SoftphoneAdapter;
  public readonly serverRestAdapter: ServerRestAdapter;
  public readonly twimlAdapter: TwiMLAdapter;

  private activeSession: RentmaikarCallSession | null = null;
  private listeners: Set<SessionChangeListener> = new Set();

  constructor(config?: TelephonyControllerConfig) {
    this.softphoneAdapter = config?.softphoneAdapter || new SoftphoneAdapter();
    this.serverRestAdapter = config?.serverRestAdapter || new ServerRestAdapter();
    this.twimlAdapter = config?.twimlAdapter || new TwiMLAdapter();
  }

  /**
   * Singleton accessor for shared application telephony state
   */
  public static getInstance(config?: TelephonyControllerConfig): TelephonyController {
    if (!TelephonyController.instance) {
      TelephonyController.instance = new TelephonyController(config);
    }
    return TelephonyController.instance;
  }

  /**
   * Reset instance (primarily for testing or isolation)
   */
  public static resetInstance(): void {
    TelephonyController.instance = null;
  }

  /**
   * Retrieves the appropriate adapter for a given calling method
   */
  public getAdapter(callingMethod: CallingMethod): ITelephonyAdapter {
    switch (callingMethod) {
      case CallingMethod.SOFTPHONE:
        return this.softphoneAdapter;
      case CallingMethod.SERVER_REST:
        return this.serverRestAdapter;
      case CallingMethod.TWIML:
        return this.twimlAdapter;
      default:
        throw new Error(`Unsupported calling method: ${callingMethod}`);
    }
  }

  /**
   * Places an outbound call using the designated calling engine adapter
   */
  public async placeCall(
    callingMethod: CallingMethod,
    params: PlaceCallParams
  ): Promise<RentmaikarCallSession> {
    const adapter = this.getAdapter(callingMethod);

    if (!adapter.isAvailable()) {
      throw new Error(`Telephony engine ${callingMethod} is not available in the current environment`);
    }

    try {
      const session = await adapter.placeCall(params);
      this.setActiveSession(session);
      return session;
    } catch (err: any) {
      this.setActiveSession(null);
      throw err;
    }
  }

  /**
   * Ends an active call via the designated engine adapter
   */
  public async endCall(
    callingMethod: CallingMethod,
    sessionId: string,
    twilioCallSid?: string
  ): Promise<boolean> {
    const adapter = this.getAdapter(callingMethod);
    const success = await adapter.endCall(sessionId, twilioCallSid);

    if (this.activeSession && (this.activeSession.id === sessionId || this.activeSession.twilio_call_sid === twilioCallSid)) {
      this.activeSession.status = "completed";
      this.activeSession.ended_at = new Date().toISOString();
      this.setActiveSession(null);
    }

    return success;
  }

  /**
   * Ends the current active call regardless of engine
   */
  public async endActiveCall(): Promise<boolean> {
    if (!this.activeSession) {
      return true;
    }
    return this.endCall(
      this.activeSession.calling_method,
      this.activeSession.id,
      this.activeSession.twilio_call_sid
    );
  }

  /**
   * Reconciles authoritative call session state against backend and Twilio
   */
  public async reconcileCall(
    callingMethod: CallingMethod,
    sessionId?: string,
    twilioCallSid?: string
  ): Promise<RentmaikarCallSession | null> {
    const adapter = this.getAdapter(callingMethod);
    const reconciled = await adapter.reconcileCall(sessionId, twilioCallSid);

    if (reconciled && this.activeSession && (this.activeSession.id === reconciled.id || this.activeSession.twilio_call_sid === reconciled.twilio_call_sid)) {
      this.setActiveSession(reconciled);
      if (reconciled.status === "completed" || reconciled.status === "failed" || reconciled.status === "canceled") {
        this.setActiveSession(null);
      }
    }

    return reconciled;
  }

  /**
   * Reconciles current active session
   */
  public async reconcileActiveCall(): Promise<RentmaikarCallSession | null> {
    if (!this.activeSession) {
      return null;
    }
    return this.reconcileCall(
      this.activeSession.calling_method,
      this.activeSession.id,
      this.activeSession.twilio_call_sid
    );
  }

  /**
   * Returns current active call session
   */
  public getActiveSession(): RentmaikarCallSession | null {
    return this.activeSession ? { ...this.activeSession } : null;
  }

  /**
   * Subscribe to active session state changes
   */
  public onSessionChange(listener: SessionChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setActiveSession(session: RentmaikarCallSession | null): void {
    this.activeSession = session;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.activeSession ? { ...this.activeSession } : null);
      } catch (err) {
        console.error("[TelephonyController] Listener error:", err);
      }
    }
  }
}

// Export default singleton instance
export const telephonyController = TelephonyController.getInstance();
