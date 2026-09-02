/**
 * Sent.dm OpenAPI v3 TypeScript Types
 * Generated & aligned with https://docs.sent.dm/api/openapi/v3
 */

export type SentChannel = "sms" | "whatsapp" | "rcs";

export type SentMessageStatus = 
  | "queued" 
  | "sending" 
  | "sent" 
  | "delivered" 
  | "failed" 
  | "undelivered" 
  | "read";

export interface SentTemplateParam {
  key: string;
  value: string | number;
}

export interface SentTemplatePayload {
  id: string;
  parameters?: Record<string, string | number>;
}

export interface SentMessageRequest {
  /**
   * Array of recipient phone numbers in E.164 format (e.g. ["+1234567890", "+2348012345678"])
   */
  to: string[];

  /**
   * Communication channel to use
   */
  channel: SentChannel;

  /**
   * Plain text message body (Required if template is not provided)
   */
  text?: string;

  /**
   * Pre-approved template ID and parameter mapping (Required if text is not provided)
   */
  template?: SentTemplatePayload;

  /**
   * Custom registered sender ID or phone number (e.g. "Rentmaikar" or "+12025550143")
   */
  sender_id?: string;

  /**
   * Optional customer / user reference identifier for tracking
   */
  customer_id?: string;

  /**
   * Unique client-generated idempotency key to prevent duplicate delivery
   */
  idempotency_key?: string;

  /**
   * Custom key-value metadata attached to the message log
   */
  metadata?: Record<string, any>;

  /**
   * If true, runs in sandbox simulation mode without incurring telco charges
   */
  sandbox?: boolean;
}

export interface SentMessageResponse {
  id: string;
  status: SentMessageStatus;
  channel: SentChannel;
  to: string[];
  from?: string;
  created_at: string;
  updated_at?: string;
  cost?: {
    amount: number;
    currency: string;
  };
  segments?: number;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  sandbox?: boolean;
}

export interface SentTemplate {
  id: string;
  name: string;
  channel: SentChannel;
  category: "transactional" | "otp" | "marketing" | "alerts";
  body: string;
  parameters: string[];
  language: string;
  status: "approved" | "pending" | "rejected";
}

export interface SentAccountInfo {
  organization_id: string;
  organization_name: string;
  balance: number;
  currency: string;
  tier: "developer" | "growth" | "enterprise";
  sandbox: boolean;
  active_channels: SentChannel[];
  registered_senders: string[];
  rate_limits: {
    remaining_per_second: number;
    limit_per_second: number;
  };
}

export interface SentWebhookEvent {
  event: 
    | "message.queued" 
    | "message.sent" 
    | "message.delivered" 
    | "message.failed" 
    | "message.read" 
    | "inbound.message";
  message_id: string;
  channel: SentChannel;
  from: string;
  to: string;
  text?: string;
  media_url?: string;
  timestamp: string;
  error?: {
    code: string;
    message: string;
  };
  metadata?: Record<string, any>;
}

export interface SentDiagnosticsResult {
  healthy: boolean;
  status_code: number;
  base_url: string;
  api_key_configured: boolean;
  sandbox_mode: boolean;
  account?: SentAccountInfo;
  latency_ms: number;
  supported_channels: SentChannel[];
  message: string;
  checked_at: string;
}
