// RentMaikar Marketing Engine Core Types & Canonical Event Definitions

export type CanonicalMarketingEventType =
  | 'PAGE_VIEW'
  | 'LANDING_PAGE_VIEW'
  | 'AD_CLICK'
  | 'LEAD_CREATED'
  | 'ACCOUNT_CREATED'
  | 'ROLE_SELECTED'
  | 'PHONE_VERIFIED'
  | 'KYC_STARTED'
  | 'KYC_COMPLETED'
  | 'OWNER_APPROVED'
  | 'DRIVER_APPROVED'
  | 'VEHICLE_CREATED'
  | 'VEHICLE_LISTED'
  | 'VEHICLE_APPROVED'
  | 'RENTAL_REQUESTED'
  | 'RENTAL_COMPLETED'
  | 'PAYMENT_STARTED'
  | 'PAYMENT_COMPLETED'
  | 'COMMUNICATION_STARTED'
  | 'WHATSAPP_CONVERSATION'
  | 'SMS_SENT'
  | 'EMAIL_SENT'
  | 'CALL_STARTED'
  | 'CALL_COMPLETED';

export type MarketingPlatform =
  | 'meta'
  | 'google'
  | 'tiktok'
  | 'linkedin'
  | 'manychat'
  | 'sentdm'
  | 'twilio'
  | 'resend';

export interface UtmParameters {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing_page?: string;
  fbp?: string;
  fbc?: string;
  gclid?: string;
  ttclid?: string;
}

export interface MarketingSession {
  id?: string;
  session_id: string;
  user_id?: string | null;
  utm: UtmParameters;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface CanonicalMarketingEvent {
  event_name: CanonicalMarketingEventType;
  event_id: string;
  user_id?: string | null;
  session_id?: string | null;
  campaign_id?: string | null;
  properties?: Record<string, unknown>;
  user_data?: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    country?: string;
    fbp?: string;
    fbc?: string;
  };
  timestamp?: number;
}

export interface MultiTouchAttribution {
  user_id?: string;
  lead_id?: string;
  conversion_event_id: string;
  conversion_type: string;
  conversion_value?: number;
  currency?: string;
  first_touch: {
    campaign?: string;
    source?: string;
    medium?: string;
    session_id?: string;
  };
  last_touch: {
    campaign?: string;
    source?: string;
    medium?: string;
    session_id?: string;
  };
}

export interface MarketingProviderAdapter<TConfig = unknown, TPayload = unknown, TResult = unknown> {
  readonly platform: MarketingPlatform;
  readonly isConfigured: boolean;
  validateConfig(config: TConfig): boolean;
  trackEvent(event: CanonicalMarketingEvent): Promise<TResult>;
  syncAudience?(audienceId: string, users: Array<{ email?: string; phone?: string }>): Promise<TResult>;
  handleWebhook?(payload: TPayload, signature?: string): Promise<{ verified: boolean; data?: unknown }>;
}
