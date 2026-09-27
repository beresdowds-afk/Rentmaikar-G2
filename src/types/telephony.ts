/**
 * Canonical Telephony Types & Interfaces
 * Defines CallingMethod enum, RentmaikarCallSession interface, and adapter contracts.
 */

export enum CallingMethod {
  SOFTPHONE = 'SOFTPHONE',
  SERVER_REST = 'SERVER_REST',
  TWIML = 'TWIML',
}

export type CallSessionStatus =
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'failed'
  | 'no-answer'
  | 'canceled';

export type CallSessionDirection = 'inbound' | 'outbound';

export interface RentmaikarCallSession {
  id: string;
  admin_user_id: string;
  calling_method: CallingMethod;
  twilio_call_sid?: string;
  to_phone_number: string;
  from_phone_number?: string;
  recipient_name?: string;
  status: CallSessionStatus;
  direction: CallSessionDirection;
  region?: string;
  duration_seconds?: number;
  recording_url?: string;
  error_message?: string;
  created_at: string;
  started_at?: string;
  ended_at?: string;
  metadata?: Record<string, any>;
}

export interface PlaceCallParams {
  adminUserId: string;
  toPhoneNumber: string;
  fromPhoneNumber?: string;
  recipientName?: string;
  region?: string;
  callType?: 'individual' | 'group';
  recipients?: Array<{ phoneNumber: string; displayName?: string; userId?: string }>;
  metadata?: Record<string, any>;
}

export interface EndCallParams {
  sessionId: string;
  twilioCallSid?: string;
  reason?: string;
}

export interface ReconcileCallParams {
  sessionId?: string;
  twilioCallSid?: string;
}

export interface ITelephonyAdapter {
  readonly callingMethod: CallingMethod;
  placeCall(params: PlaceCallParams): Promise<RentmaikarCallSession>;
  endCall(sessionId: string, twilioCallSid?: string): Promise<boolean>;
  reconcileCall(sessionId?: string, twilioCallSid?: string): Promise<RentmaikarCallSession | null>;
  isAvailable(): boolean;
}

export interface ITelephonyController {
  placeCall(callingMethod: CallingMethod, params: PlaceCallParams): Promise<RentmaikarCallSession>;
  endCall(callingMethod: CallingMethod, sessionId: string, twilioCallSid?: string): Promise<boolean>;
  reconcileCall(callingMethod: CallingMethod, sessionId?: string, twilioCallSid?: string): Promise<RentmaikarCallSession | null>;
  getAdapter(callingMethod: CallingMethod): ITelephonyAdapter;
  getActiveSession(): RentmaikarCallSession | null;
}
