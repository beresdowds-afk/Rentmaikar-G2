export type CallType = 'individual' | 'group';
export type CallStatus = 'pending' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'canceled';
export type CallDirection = 'inbound' | 'outbound';
export type ParticipantStatus = 'pending' | 'ringing' | 'connected' | 'disconnected' | 'failed';
export type CallRegion = 'USA' | 'Nigeria' | (string & {});

export interface VoIPCall {
  id: string;
  call_sid?: string;
  initiated_by?: string;
  call_type: CallType;
  region: CallRegion;
  status: CallStatus;
  direction: CallDirection;
  duration_seconds: number;
  recording_url?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
  participants?: VoIPCallParticipant[];
}

export interface VoIPCallParticipant {
  id: string;
  call_id: string;
  user_id?: string;
  phone_number: string;
  participant_type: 'caller' | 'recipient';
  display_name?: string;
  region: CallRegion;
  status: ParticipantStatus;
  joined_at?: string;
  left_at?: string;
  created_at: string;
}

export interface VoIPCallGroup {
  id: string;
  name: string;
  description?: string;
  region: 'USA' | 'Nigeria' | (string & {}) | 'All';
  created_by?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  members?: VoIPGroupMember[];
}

export interface VoIPGroupMember {
  id: string;
  group_id: string;
  user_id?: string;
  phone_number: string;
  display_name?: string;
  region: CallRegion;
  is_active: boolean;
  added_at: string;
}

export interface InitiateCallRequest {
  callType: CallType;
  region: CallRegion;
  recipients: {
    phoneNumber: string;
    displayName?: string;
    userId?: string;
  }[];
  groupId?: string;
}

// Phone number formatting utilities
export const COUNTRY_CODES = {
  USA: '+1',
  Nigeria: '+234',
} as const;

export const formatPhoneForDisplay = (phone: string): string => {
  if (phone.startsWith('+1')) {
    // USA format: +1 (XXX) XXX-XXXX
    const num = phone.slice(2);
    if (num.length === 10) {
      return `+1 (${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`;
    }
  } else if (phone.startsWith('+234')) {
    // Nigeria format: +234 XXX XXX XXXX
    const num = phone.slice(4);
    if (num.length === 10) {
      return `+234 ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
    }
  }
  return phone;
};

export const getRegionFromPhone = (phone: string): CallRegion | null => {
  if (phone.startsWith('+1')) return 'USA';
  if (phone.startsWith('+234')) return 'Nigeria';
  return null;
};

export const validatePhoneNumber = (phone: string, region: CallRegion): boolean => {
  const prefix = COUNTRY_CODES[region];
  if (!phone.startsWith(prefix)) return false;
  
  const num = phone.slice(prefix.length);
  // USA: 10 digits, Nigeria: 10 digits (without leading 0)
  return /^\d{10}$/.test(num);
};
