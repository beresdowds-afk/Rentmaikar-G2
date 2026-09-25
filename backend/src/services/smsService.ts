/**
 * Unified Application SMS / WhatsApp Service for RentMaikar
 * 
 * Provider Hierarchy:
 *   1. SENT.dm (Primary Provider)
 *   2. Twilio SMS / WhatsApp (Fallback)
 *   3. Termii (Fallback for Nigeria / International SMS)
 * 
 * Status Semantics:
 *   - "queued": Provider accepted message for delivery queue
 *   - "submitted": Successfully dispatched to upstream provider
 *   - "failed": Provider rejected or credentials unavailable
 *   - "simulation": Explicit test mode without real transmission
 *   NOTE: "delivered" is never claimed until verified via delivery status callback.
 */

import { sentBackendClient } from "./sentClient";
import { getDbPool } from "./dbPool";

export interface SendApplicationMessagePayload {
  to: string;
  message: string;
  channel?: "sms" | "whatsapp";
  whatsappTemplateId?: string;
  whatsappTemplateParams?: Record<string, string | number>;
  notificationType?: string;
  sandbox?: boolean;
  metadata?: Record<string, any>;
  providerOverride?: "sent" | "twilio" | "termii";
}

export interface SendApplicationMessageResult {
  success: boolean;
  messageId?: string;
  channel: "sms" | "whatsapp";
  provider: "sent" | "twilio" | "termii" | "none";
  deliveryStatus: "queued" | "submitted" | "sent" | "failed" | "simulation";
  region: "USA" | "Nigeria";
  error?: string;
  simulation?: boolean;
}

export function normalizeE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("234") && cleaned.length === 13) return `+${cleaned}`;
  if (cleaned.startsWith("0") && cleaned.length === 11) return `+234${cleaned.slice(1)}`;
  if (cleaned.length === 10) return `+1${cleaned}`;
  return `+${cleaned}`;
}

async function logMessageDispatch(params: {
  phone: string;
  region: "USA" | "Nigeria";
  provider: "sent" | "twilio" | "termii" | "none";
  channel: "sms" | "whatsapp";
  message: string;
  deliveryStatus: string;
  messageId?: string;
  metadata?: Record<string, any>;
  error?: string;
}) {
  try {
    const pool = getDbPool();
    if (!pool) return;

    await pool.query(
      `INSERT INTO public.unified_message_log (
        id, channel, provider, provider_message_id, recipient, message_body,
        delivery_status, error_message, metadata, created_at, updated_at
      ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        params.channel,
        params.provider,
        params.messageId || null,
        params.phone,
        params.message,
        params.deliveryStatus,
        params.error || null,
        JSON.stringify({
          region: params.region,
          ...params.metadata,
        }),
      ]
    ).catch(() => {});
  } catch (err: any) {
    console.warn("[smsService] Log error (non-fatal):", err.message);
  }
}

export async function sendApplicationMessage(
  payload: SendApplicationMessagePayload
): Promise<SendApplicationMessageResult> {
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
  const override = payload.providerOverride;

  // -----------------------------------------------------------------
  // 1. PRIMARY PROVIDER: SENT.dm
  // -----------------------------------------------------------------
  if (!override || override === "sent") {
    try {
      const apiKey = process.env.SENT_API_KEY;
      if (apiKey && apiKey !== "mock" && !apiKey.startsWith("demo_")) {
        const sentRes = await sentBackendClient.sendMessage({
          to: [to],
          channel,
          text: messageText,
          sandbox: isSandbox,
          template: payload.whatsappTemplateId
            ? { id: payload.whatsappTemplateId, parameters: payload.whatsappTemplateParams }
            : undefined,
          metadata: {
            source: "backend_sms_service",
            region,
            notificationType: payload.notificationType || "general",
            ...payload.metadata,
          },
        });

        const messageId = sentRes?.data?.id || sentRes?.id || `sent_${Date.now()}`;
        const deliveryStatus = isSandbox ? "simulation" : "queued";

        await logMessageDispatch({
          phone: to,
          region,
          provider: "sent",
          channel,
          message: messageText,
          deliveryStatus,
          messageId,
          metadata: { notificationType: payload.notificationType, sandbox: isSandbox },
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
      }
    } catch (sentErr: any) {
      console.warn("[smsService] Primary provider SENT.dm failed, evaluating fallback:", sentErr.message);
    }
  }

  // -----------------------------------------------------------------
  // 2. FALLBACK PROVIDER: Twilio (SMS or WhatsApp)
  // -----------------------------------------------------------------
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

  if (twilioAccountSid && twilioAuthToken && (!override || override === "twilio")) {
    try {
      const isWa = channel === "whatsapp";
      const fromNumber = isWa
        ? process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || "+16083843932"
        : process.env.TWILIO_PHONE_NUMBER || "+18482035389";

      const toFormatted = isWa && !to.startsWith("whatsapp:") ? `whatsapp:${to}` : to;
      const fromFormatted = isWa && !fromNumber.startsWith("whatsapp:") ? `whatsapp:${fromNumber}` : fromNumber;

      const params = new URLSearchParams();
      params.append("To", toFormatted);
      params.append("From", fromFormatted);
      params.append("Body", messageText);

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
          },
          body: params.toString(),
        }
      );

      if (twilioRes.ok) {
        const twilioData = await twilioRes.json();
        const messageId = twilioData.sid || `tw_${Date.now()}`;
        const deliveryStatus = twilioData.status || "queued";

        await logMessageDispatch({
          phone: to,
          region,
          provider: "twilio",
          channel,
          message: messageText,
          deliveryStatus: deliveryStatus === "delivered" ? "queued" : deliveryStatus,
          messageId,
          metadata: { notificationType: payload.notificationType, fallback: true },
        });

        return {
          success: true,
          messageId,
          channel,
          provider: "twilio",
          deliveryStatus: "queued",
          region,
        };
      } else {
        const errData = await twilioRes.json().catch(() => ({}));
        console.warn("[smsService] Twilio fallback failed:", errData?.message || twilioRes.status);
      }
    } catch (twilioErr: any) {
      console.warn("[smsService] Twilio exception:", twilioErr.message);
    }
  }

  // -----------------------------------------------------------------
  // 3. FALLBACK PROVIDER: Termii (Nigeria & International SMS)
  // -----------------------------------------------------------------
  const termiiApiKey = process.env.TERMII_API_KEY;

  if (termiiApiKey && (region === "Nigeria" || override === "termii") && channel === "sms") {
    try {
      const termiiSenderId = process.env.TERMII_SENDER_ID || "Rentmaikar";
      const cleanPhone = to.replace(/^\+/, "");

      const termiiRes = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleanPhone,
          from: termiiSenderId,
          sms: messageText,
          type: "plain",
          channel: "generic",
          api_key: termiiApiKey,
        }),
      });

      const termiiData = await termiiRes.json().catch(() => ({}));

      if (termiiRes.ok && (termiiData.code === "ok" || termiiData.message_id)) {
        const messageId = termiiData.message_id || `termii_${Date.now()}`;

        await logMessageDispatch({
          phone: to,
          region,
          provider: "termii",
          channel,
          message: messageText,
          deliveryStatus: "queued",
          messageId,
          metadata: { notificationType: payload.notificationType, fallback: true },
        });

        return {
          success: true,
          messageId,
          channel,
          provider: "termii",
          deliveryStatus: "queued",
          region,
        };
      } else {
        console.warn("[smsService] Termii fallback failed:", termiiData?.message || termiiRes.status);
      }
    } catch (termiiErr: any) {
      console.warn("[smsService] Termii exception:", termiiErr.message);
    }
  }

  // -----------------------------------------------------------------
  // 4. ALL PROVIDERS FAILED OR UNAVAILABLE (Fail Closed)
  // -----------------------------------------------------------------
  const failureError = "All communications providers (SENT.dm, Twilio, Termii) are unavailable or rejected dispatch";

  await logMessageDispatch({
    phone: to,
    region,
    provider: "none",
    channel,
    message: messageText,
    deliveryStatus: "failed",
    error: failureError,
    metadata: { notificationType: payload.notificationType },
  });

  return {
    success: false,
    channel,
    provider: "none",
    deliveryStatus: "failed",
    region,
    error: failureError,
  };
}
