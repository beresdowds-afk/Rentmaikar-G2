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

import { sentBackendClient } from "./sentClient";
import { getDbPool } from "./dbPool";

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
  provider: "sent";
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
   * Logs dispatch to public.unified_message_log
   */
  private async logDispatch(params: {
    phone: string;
    region: "USA" | "Nigeria";
    channel: "sms" | "whatsapp";
    message: string;
    deliveryStatus: string;
    messageId?: string;
    source?: string;
    correlationId?: string;
    metadata?: Record<string, any>;
    error?: string;
  }): Promise<void> {
    try {
      const pool = getDbPool();
      if (!pool) return;

      await pool.query(
        `INSERT INTO public.unified_message_log (
          id, channel, provider, provider_message_id, recipient, message_body,
          delivery_status, error_message, metadata, created_at, updated_at
        ) VALUES (gen_random_uuid(), $1, 'sent', $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          params.channel,
          params.messageId || null,
          params.phone,
          params.message,
          params.deliveryStatus,
          params.error || null,
          JSON.stringify({
            region: params.region,
            source: params.source || "messaging_bridge",
            correlationId: params.correlationId,
            ...params.metadata,
          }),
        ]
      ).catch(() => {});
    } catch (err: any) {
      console.warn("[MessagingBridge] Log error (non-fatal):", err.message);
    }
  }

  /**
   * Dispatches an outbound SMS or WhatsApp message via SENT.dm
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
        provider: "sent",
        deliveryStatus: "failed",
        region,
        error: "Valid E.164 phone number required",
      };
    }

    const messageText = payload.message || "You have an update from RentMaikar.";

    try {
      const sentRes = await sentBackendClient.sendMessage({
        to: [to],
        channel,
        text: payload.templateId ? undefined : messageText,
        sandbox: isSandbox,
        template: payload.templateId
          ? {
              id: payload.templateId,
              parameters: payload.templateParams,
            }
          : undefined,
        metadata: {
          source: payload.source || "messaging_bridge",
          region,
          notificationType: payload.notificationType || "general",
          correlationId: payload.correlationId,
          ...payload.metadata,
        },
      });

      // SENT.dm returns the provider message ID inside the recipient record.
// Preserve the real provider ID because delivery webhooks use it to
// reconcile subsequent queued/sent/delivered/failed events.
const messageId =
  sentRes?.data?.recipients?.[0]?.message_id ||
  sentRes?.recipients?.[0]?.message_id ||
  sentRes?.data?.message_id ||
  sentRes?.data?.id ||
  sentRes?.message_id ||
  sentRes?.id ||
  undefined;

const deliveryStatus = isSandbox ? "simulation" : "queued";
      await this.logDispatch({
        phone: to,
        region,
        channel,
        message: messageText,
        deliveryStatus,
        messageId,
        source: payload.source,
        correlationId: payload.correlationId,
        metadata: {
          notificationType: payload.notificationType,
          sandbox: isSandbox,
        },
      });

      return {
        success: !isSandbox,
        messageId,
        channel,
        provider: "sent",
        deliveryStatus,
        region,
        simulation: isSandbox,
      };
    } catch (sentErr: any) {
      const failureError = sentErr?.message || "SENT.dm delivery failed";
      console.error("[MessagingBridge] Dispatch failed:", failureError);

      await this.logDispatch({
        phone: to,
        region,
        channel,
        message: messageText,
        deliveryStatus: "failed",
        source: payload.source,
        correlationId: payload.correlationId,
        error: failureError,
        metadata: { notificationType: payload.notificationType },
      });

      return {
        success: false,
        channel,
        provider: "sent",
        deliveryStatus: "failed",
        region,
        error: failureError,
      };
    }
  }
}

export const messagingBridge = MessagingBridge.getInstance();
