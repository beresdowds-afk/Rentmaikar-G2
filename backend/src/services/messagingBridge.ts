/**
 * Authoritative Backend Messaging Bridge for RentMaikar
 * 
 * Central gateway for outbound SMS and WhatsApp messaging across:
 * - Authentication (OTP Engine)
 * - Platform Operations (Driver/Owner notifications, inspections, system alerts)
 * - Marketing Engine
 * 
 * Provider Policy:
 * - SENT.dm is the single authoritative CPaaS delivery provider.
 * - Calling modules (like OtpService) do not reproduce CPaaS routing,
 *   failovers, or branching. They delegate directly to the Messaging Bridge.
 * 
 * Status Semantics:
 * - "queued" / "submitted": Accepted by SENT.dm for carrier transmission
 * - "simulation": Sandbox mode without real transmission
 * - "failed": Rejected by provider or upstream network error
 * - Never claims "delivered" at dispatch time (delivery is confirmed only via webhooks).
 */

import { getDbPool } from "./dbPool";
import { sendApplicationMessage } from "./smsService";

export interface OutboundMessagePayload {
  to: string;
  message?: string;
  channel?: "sms" | "whatsapp";
  templateId?: string;
  templateParams?: Record<string, string | number>;
  source?: "auth_otp" | "platform" | "marketing";
  notificationType?: string;
  correlationId?: string;
  sandbox?: boolean;
  metadata?: Record<string, any>;
}

export interface OutboundMessageResult {
  success: boolean;
  messageId?: string;
  channel: "sms" | "whatsapp";
  provider: "sent" | "twilio" | "termii" | "none";
  deliveryStatus: "queued" | "submitted" | "simulation" | "failed";
  region: "USA" | "Nigeria";
  error?: string;
  simulation?: boolean;
}

export function normalizeE164(phone: string): string {
  const cleaned = (phone || "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("234") && cleaned.length === 13) return `+${cleaned}`;
  if (cleaned.startsWith("0") && cleaned.length === 11) return `+234${cleaned.slice(1)}`;
  if (cleaned.length === 10) return `+1${cleaned}`;
  return `+${cleaned}`;
}

export class MessagingBridge {
  private static instance: MessagingBridge | null = null;

  public static getInstance(): MessagingBridge {
    if (!MessagingBridge.instance) {
      MessagingBridge.instance = new MessagingBridge();
    }
    return MessagingBridge.instance;
  }

  /**
   * Dispatches an outbound SMS or WhatsApp message via canonical business dispatcher
   * enforcing the verified hierarchy: SENT.dm -> Twilio -> Termii.
   */
  public async sendMessage(
    payload: OutboundMessagePayload
  ): Promise<OutboundMessageResult> {
    const rawTo = payload.to || "";
    const to = normalizeE164(rawTo);
    const channel = payload.channel === "whatsapp" ? "whatsapp" : "sms";
    const region: "USA" | "Nigeria" = to.startsWith("+234") ? "Nigeria" : "USA";
    const isSandbox = Boolean(payload.sandbox || process.env.SENT_SANDBOX_MODE === "true");

    if (!to) {
      return {
        success: false,
        channel,
        provider: "none",
        deliveryStatus: "failed",
        region,
        error: "Valid E.164 phone number required",
      };
    }

    const messageText = payload.message || "You have an update from RentMaikar.";

    const res = await sendApplicationMessage({
      to,
      message: messageText,
      channel,
      whatsappTemplateId: payload.templateId,
      whatsappTemplateParams: payload.templateParams,
      notificationType: payload.notificationType || payload.source || "general",
      sandbox: isSandbox,
      idempotencyKey: payload.correlationId,
      metadata: {
        source: payload.source || "messaging_bridge",
        correlationId: payload.correlationId,
        ...payload.metadata,
      },
    });

    return {
      success: res.success,
      messageId: res.messageId,
      channel: res.channel,
      provider: res.provider,
      deliveryStatus: res.deliveryStatus === "sent" ? "submitted" : res.deliveryStatus,
      region,
      error: res.error,
      simulation: res.simulation,
    };
  }
}

export const messagingBridge = MessagingBridge.getInstance();

