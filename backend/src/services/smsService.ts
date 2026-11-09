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
import {
  enqueueAndClaimOutboundMessage,
  requeueOutboundMessage,
  retryDelayMs,
  updateOutboundMessage,
} from "./outboundMessageOutbox";
import { randomUUID } from "node:crypto";

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
  idempotencyKey?: string;
}

export interface SendApplicationMessageResult {
  success: boolean;
  messageId?: string;
  channel: "sms" | "whatsapp";
  provider: "sent" | "twilio" | "termii" | "none";
  deliveryStatus: "queued" | "submitted" | "sent" | "failed" | "simulation";
  region: "USA" | "Nigeria" | "Global";
  error?: string;
  simulation?: boolean;
}

export function normalizeE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");

  if (!cleaned) return "";

  if (cleaned.startsWith("+")) return cleaned;

  if (cleaned.startsWith("234") && cleaned.length === 13) {
    return `+${cleaned}`;
  }

  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return `+234${cleaned.slice(1)}`;
  }

  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  return `+${cleaned}`;
}

interface CanonicalMessagingRoute {
  region: "USA" | "Nigeria" | "Global";
  fallbackProvider: "twilio" | "termii" | null;
}

async function resolveCanonicalMessagingRoute(
  phone: string,
  channel: "sms" | "whatsapp",
): Promise<CanonicalMessagingRoute> {
  const pool = getDbPool();

  if (!pool) {
    const isNg = phone.startsWith("+234");
    return {
      region: isNg ? "Nigeria" : "Global",
      fallbackProvider: isNg ? "termii" : "twilio",
    };
  }

  const normalized = phone.trim().replace(/\s+/g, "");

  try {
    const regionsResult = await pool.query(
      `SELECT value, phone_prefix
         FROM public.get_allowed_regions()
        WHERE phone_prefix IS NOT NULL
          AND btrim(phone_prefix) <> ''`,
    );

    const matchedRegion = regionsResult.rows
      .filter((row: { phone_prefix?: string }) => {
        const prefix = String(row.phone_prefix || "").trim();
        return prefix && normalized.startsWith(prefix);
      })
      .sort(
        (
          a: { phone_prefix?: string },
          b: { phone_prefix?: string },
        ) =>
          String(b.phone_prefix || "").length -
          String(a.phone_prefix || "").length,
      )[0];

    if (!matchedRegion) {
      const isNg = normalized.startsWith("+234");
      return {
        region: isNg ? "Nigeria" : "Global",
        fallbackProvider: isNg ? "termii" : "twilio",
      };
    }

    const prefix = String(matchedRegion.phone_prefix).trim();

    const providerResult = await pool.query(
      `SELECT sms_provider, whatsapp_provider
         FROM public.communication_providers
        WHERE country_code_prefix = $1
          AND is_active = true
        LIMIT 1`,
      [prefix],
    );

    const providerRow = providerResult.rows[0];

    const configured =
      channel === "whatsapp"
        ? providerRow?.whatsapp_provider
        : providerRow?.sms_provider;

    const fallbackProvider =
      configured === "twilio" || configured === "termii"
        ? configured
        : normalized.startsWith("+234") ? "termii" : "twilio";

    const rawRegion = String(matchedRegion.value || "").trim().toLowerCase();
    const canonicalRegion: "USA" | "Nigeria" | "Global" =
      rawRegion.startsWith("nig") || rawRegion === "ng"
        ? "Nigeria"
        : rawRegion === "us" || rawRegion === "usa" || rawRegion.includes("united states")
        ? "USA"
        : "Global";

    return {
      region: canonicalRegion,
      fallbackProvider,
    };
  } catch (err) {
    const isNg = normalized.startsWith("+234");
    return {
      region: isNg ? "Nigeria" : "Global",
      fallbackProvider: isNg ? "termii" : "twilio",
    };
  }
}

async function logMessageDispatch(params: {
  phone: string;
  region: string | null;
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
  const route = await resolveCanonicalMessagingRoute(to, channel);
  const region = route.region;
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
  const idempotencyKey = payload.idempotencyKey?.trim() || randomUUID();
  const override = payload.providerOverride;
  const isAuthenticationMessage = payload.notificationType === "phone_otp" ||
    payload.notificationType === "authentication_otp";
  const pool = getDbPool();
  let outbox;
  try {
    outbox = await enqueueAndClaimOutboundMessage(pool, {
      idempotencyKey,
      channel,
      provider: override || "sent",
      recipient: to,
      templateReference: payload.whatsappTemplateId ||
        String(payload.metadata?.templateName || "") || undefined,
      messageClass: isAuthenticationMessage ? "authentication" : "transactional",
      maxAttempts: isAuthenticationMessage ? 1 : 5,
      expiresAt: isAuthenticationMessage ? new Date(Date.now() + 5 * 60_000) : null,
      payload: {
        message: messageText,
        notificationType: payload.notificationType || "general",
        metadata: payload.metadata || {},
      },
    });
  } catch (error: any) {
    const reason = error instanceof Error ? error.message : "Outbound message persistence failed";
    console.error("[smsService] Durable message persistence failed; provider dispatch refused", {
      channel,
      error: reason,
    });
    return {
      success: false,
      channel,
      provider: "none",
      deliveryStatus: "failed",
      region,
      error: `Message was not dispatched because durable persistence failed: ${reason}`,
    };
  }

  if (!outbox.claimed) {
    const provider = ["sent", "twilio", "termii"].includes(outbox.provider || "")
      ? outbox.provider as SendApplicationMessageResult["provider"]
      : "none";
    const duplicateSuccess = ["accepted", "delivered", "simulated"].includes(outbox.status);
    return {
      success: duplicateSuccess,
      messageId: outbox.providerMessageId,
      channel,
      provider,
      deliveryStatus: outbox.status === "simulated"
        ? "simulation"
        : duplicateSuccess
          ? outbox.status === "delivered" ? "sent" : "queued"
          : "failed",
      region,
      error: duplicateSuccess
        ? undefined
        : outbox.lastError || "Message is already being processed or requires administrative reprocessing.",
      simulation: outbox.status === "simulated",
    };
  }

  try {
    const consent = await pool.query(
      `SELECT public.is_messaging_opted_out($1::text, $2::text) AS opted_out`,
      [to, channel],
    );
    if (consent.rows[0]?.opted_out === true) {
      await updateOutboundMessage(pool, idempotencyKey, {
        status: "suppressed",
        lastError: "Recipient opted out of this messaging channel",
      });
      await logMessageDispatch({
        phone: to,
        region,
        provider: "none",
        channel,
        message: messageText,
        deliveryStatus: "suppressed",
        error: "Recipient opted out of this messaging channel",
        metadata: { notificationType: payload.notificationType, idempotencyKey },
      });
      return {
        success: false,
        channel,
        provider: "none",
        deliveryStatus: "failed",
        region,
        error: "Recipient opted out of this messaging channel",
      };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await updateOutboundMessage(pool, idempotencyKey, {
        status: "failed",
        lastError: `Unable to verify messaging consent: ${reason}`,
      });
    } catch (persistenceError) {
      console.error("[smsService] Consent verification and outbox update both failed", {
        channel,
        error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
      });
    }
    return {
      success: false,
      channel,
      provider: "none",
      deliveryStatus: "failed",
      region,
      error: `Message was not dispatched because consent could not be verified: ${reason}`,
    };
  }

  const metadataWithKey = {
    ...payload.metadata,
    idempotencyKey,
  };
  const persistProviderAcceptance = async (
    provider: "sent" | "twilio" | "termii",
    providerMessageId: string,
    simulated = false,
  ): Promise<boolean> => {
    try {
      await updateOutboundMessage(pool, idempotencyKey, {
        status: simulated ? "simulated" : "accepted",
        provider,
        providerMessageId,
      });
      return true;
    } catch (error: any) {
      console.error("[smsService] Provider accepted message but outbox receipt persistence failed", {
        channel,
        provider,
        providerMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  // -----------------------------------------------------------------
  // 1. PRIMARY PROVIDER: SENT.dm
  // -----------------------------------------------------------------
  let sentFailed = false;
  let sentFailureReason = "";

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
            ...metadataWithKey,
          },
        });

        const messageId = sentRes?.data?.id || sentRes?.id || `sent_${Date.now()}`;
        const deliveryStatus = isSandbox ? "simulation" : "queued";

        if (!(await persistProviderAcceptance("sent", messageId, isSandbox))) {
          return {
            success: false,
            messageId,
            channel,
            provider: "sent",
            deliveryStatus: "failed",
            region,
            error: "Provider accepted the message, but its receipt could not be persisted; reconciliation is required.",
          };
        }

        await logMessageDispatch({
          phone: to,
          region,
          provider: "sent",
          channel,
          message: messageText,
          deliveryStatus,
          messageId,
          metadata: { ...metadataWithKey, notificationType: payload.notificationType, sandbox: isSandbox },
        });

        const successResult: SendApplicationMessageResult = {
          success: true,
          messageId,
          channel,
          provider: "sent",
          deliveryStatus,
          region,
          simulation: isSandbox,
        };

        return successResult;
      } else {
        sentFailed = true;
        sentFailureReason = "SENT_API_KEY not configured or is demo placeholder";
      }
    } catch (sentErr: any) {
      sentFailed = true;
      sentFailureReason = sentErr?.message || "SENT.dm dispatch rejected";
      console.warn("[smsService] Primary provider SENT.dm failed, evaluating fallback:", sentFailureReason);
      
      // Log failed attempt for audit observability
      await logMessageDispatch({
        phone: to,
        region,
        provider: "sent",
        channel,
        message: messageText,
        deliveryStatus: "failed",
        error: sentFailureReason,
        metadata: { ...metadataWithKey, attempt: 1, notificationType: payload.notificationType },
      });
    }
  } else {
    sentFailed = true;
    sentFailureReason = `Provider override '${override}' bypassed SENT.dm`;
  }

  // -----------------------------------------------------------------
  // 2. FALLBACK PROVIDER: Twilio (SMS or WhatsApp)
  // Eligible when Twilio credentials and sender lines are available
  // -----------------------------------------------------------------
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  let twilioFailed = false;
  let twilioFailureReason = "";

  const isTwilioEligible =
    (!override || override === "twilio") &&
    Boolean(twilioAccountSid && twilioAuthToken);

  if (isTwilioEligible) {
    try {
      const isWa = channel === "whatsapp";
      const fromNumber = isWa
        ? process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER
        : process.env.TWILIO_PHONE_NUMBER;

      if (!fromNumber) {
        twilioFailed = true;
        twilioFailureReason = "No configured Twilio sender line in environment";
      } else {
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

          if (!(await persistProviderAcceptance("twilio", messageId))) {
            return {
              success: false,
              messageId,
              channel,
              provider: "twilio",
              deliveryStatus: "failed",
              region,
              error: "Provider accepted the message, but its receipt could not be persisted; reconciliation is required.",
            };
          }

          await logMessageDispatch({
            phone: to,
            region,
            provider: "twilio",
            channel,
            message: messageText,
            deliveryStatus: deliveryStatus === "delivered" ? "queued" : deliveryStatus,
            messageId,
            metadata: { ...metadataWithKey, notificationType: payload.notificationType, fallback: true, priorError: sentFailureReason },
          });

          const twilioResult: SendApplicationMessageResult = {
            success: true,
            messageId,
            channel,
            provider: "twilio",
            deliveryStatus: "queued",
            region,
          };

          return twilioResult;
        } else {
          const errData = await twilioRes.json().catch(() => ({}));
          twilioFailed = true;
          twilioFailureReason = errData?.message || `HTTP ${twilioRes.status}`;
          console.warn("[smsService] Twilio fallback failed:", twilioFailureReason);

          await logMessageDispatch({
            phone: to,
            region,
            provider: "twilio",
            channel,
            message: messageText,
            deliveryStatus: "failed",
            error: twilioFailureReason,
            metadata: { ...metadataWithKey, attempt: 2, notificationType: payload.notificationType },
          });
        }
      }
    } catch (twilioErr: any) {
      twilioFailed = true;
      twilioFailureReason = twilioErr.message || "Twilio request exception";
      console.warn("[smsService] Twilio exception:", twilioFailureReason);

      await logMessageDispatch({
        phone: to,
        region,
        provider: "twilio",
        channel,
        message: messageText,
        deliveryStatus: "failed",
        error: twilioFailureReason,
        metadata: { ...metadataWithKey, attempt: 2, notificationType: payload.notificationType },
      });
    }
  } else {
    twilioFailed = true;
    twilioFailureReason = "Twilio credentials or channel ineligible";
  }

  // -----------------------------------------------------------------
  // 3. FALLBACK PROVIDER: Termii (Nigeria & International SMS)
  // Eligible when Termii API key is configured and channel is SMS
  // -----------------------------------------------------------------
  const termiiApiKey = process.env.TERMII_API_KEY;
  let termiiFailed = false;
  let termiiFailureReason = "";

  const isTermiiEligible =
    (!override || override === "termii") &&
    channel === "sms" &&
    Boolean(termiiApiKey);

  if (isTermiiEligible) {
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

        if (!(await persistProviderAcceptance("termii", messageId))) {
          return {
            success: false,
            messageId,
            channel,
            provider: "termii",
            deliveryStatus: "failed",
            region,
            error: "Provider accepted the message, but its receipt could not be persisted; reconciliation is required.",
          };
        }

        await logMessageDispatch({
          phone: to,
          region,
          provider: "termii",
          channel,
          message: messageText,
          deliveryStatus: "queued",
          messageId,
          metadata: { ...metadataWithKey, notificationType: payload.notificationType, fallback: true, priorTwilioError: twilioFailureReason },
        });

        const termiiResult: SendApplicationMessageResult = {
          success: true,
          messageId,
          channel,
          provider: "termii",
          deliveryStatus: "queued",
          region,
        };

        return termiiResult;
      } else {
        termiiFailed = true;
        termiiFailureReason = termiiData?.message || `HTTP ${termiiRes.status}`;
        console.warn("[smsService] Termii fallback failed:", termiiFailureReason);

        await logMessageDispatch({
          phone: to,
          region,
          provider: "termii",
          channel,
          message: messageText,
          deliveryStatus: "failed",
          error: termiiFailureReason,
          metadata: { ...metadataWithKey, attempt: 3, notificationType: payload.notificationType },
        });
      }
    } catch (termiiErr: any) {
      termiiFailed = true;
      termiiFailureReason = termiiErr.message || "Termii request exception";
      console.warn("[smsService] Termii exception:", termiiFailureReason);

      await logMessageDispatch({
        phone: to,
        region,
        provider: "termii",
        channel,
        message: messageText,
        deliveryStatus: "failed",
        error: termiiFailureReason,
        metadata: { ...metadataWithKey, attempt: 3, notificationType: payload.notificationType },
      });
    }
  } else {
    termiiFailed = true;
    termiiFailureReason = channel !== "sms" ? "Termii only supports SMS" : "Termii credentials not configured";
  }

  // -----------------------------------------------------------------
  // 4. ALL PROVIDERS FAILED OR UNAVAILABLE (Fail Closed + DLQ Enlistment)
  // -----------------------------------------------------------------
  const failureError = `All communications providers failed: SENT.dm (${sentFailureReason}), Twilio (${twilioFailureReason}), Termii (${termiiFailureReason})`;
  let finalFailureError = failureError;

  try {
    await updateOutboundMessage(pool, idempotencyKey, {
      status: isAuthenticationMessage ? "expired" : "failed",
      lastError: failureError,
      nextAttemptAt: isAuthenticationMessage
        ? undefined
        : new Date(Date.now() + retryDelayMs(outbox.attemptCount)),
    });
  } catch (error: any) {
    const persistenceError = error instanceof Error ? error.message : String(error);
    console.error("[smsService] Failed to persist provider failure state", {
      channel,
      error: persistenceError,
    });
    finalFailureError += `; outbox state update failed: ${persistenceError}`;
  }

  await logMessageDispatch({
    phone: to,
    region,
    provider: "none",
    channel,
    message: messageText,
    deliveryStatus: "failed",
    error: finalFailureError,
    metadata: { ...metadataWithKey, notificationType: payload.notificationType },
  });

  // Enlist into durable sms_dlq_retry_state outbox for administrative inspection and scheduled recovery
  if (!isAuthenticationMessage) {
    try {
      await pool.query(
        `INSERT INTO public.sms_dlq_retry_state (
           message_key, channel, recipient_phone, body, template_name, region,
           attempts, last_error, next_attempt_at, paused, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, NOW() + INTERVAL '5 minutes', false, NOW(), NOW())
         ON CONFLICT (message_key) DO UPDATE SET
           attempts = sms_dlq_retry_state.attempts + 1,
           last_error = EXCLUDED.last_error,
           next_attempt_at = NOW() + (POWER(2, LEAST(sms_dlq_retry_state.attempts, 6)) * INTERVAL '2 minutes'),
           updated_at = NOW()`,
        [
         idempotencyKey,
          channel,
          to,
          messageText,
          (payload as any).templateName || payload.whatsappTemplateId || null,
          region,
         finalFailureError,
        ]
      );
    } catch (dlqErr: any) {
      const reason = dlqErr instanceof Error ? dlqErr.message : String(dlqErr);
      console.error("[smsService] Failed to enlist message in SMS recovery queue", {
        idempotencyKey,
        error: reason,
      });
      finalFailureError += `; SMS recovery queue persistence failed: ${reason}`;
    }
  }

  const failureResult: SendApplicationMessageResult = {
    success: false,
    channel,
    provider: "none",
    deliveryStatus: "failed",
    region,
    error: finalFailureError,
  };

  return failureResult;
}

/**
 * Reprocesses pending dead-letter SMS entries from sms_dlq_retry_state
 */
export async function reprocessSmsDlq(maxBatch = 25): Promise<{ processed: number; recovered: number; errors: number }> {
  const pool = getDbPool();
  const pending = await pool.query(
    `SELECT id, message_key, channel, recipient_phone, body, template_name, attempts, max_attempts
       FROM public.claim_sms_dlq_retry_batch($1)`,
    [maxBatch],
  );

  let recovered = 0;
  let errors = 0;

  for (const row of pending.rows) {
    try {
      await requeueOutboundMessage(pool, row.message_key);
      const res = await sendApplicationMessage({
        to: row.recipient_phone,
        message: row.body || "",
        channel: row.channel === "whatsapp" ? "whatsapp" : "sms",
        idempotencyKey: row.message_key,
      });

      if (res.success) {
        await pool.query(
          `UPDATE public.sms_dlq_retry_state
              SET resolved_at = NOW(), claimed_at = NULL, updated_at = NOW()
            WHERE id = $1`,
          [row.id]
        );
        recovered++;
      } else {
        const nextAttempts = Number(row.attempts || 1);
        const isExhausted = nextAttempts >= Number(row.max_attempts || 5);
        await pool.query(
          `UPDATE public.sms_dlq_retry_state
              SET paused = $1,
                  claimed_at = NULL,
                  last_error = $2,
                  next_attempt_at = NOW() + ($3 * INTERVAL '1 millisecond'),
                  updated_at = NOW()
            WHERE id = $4`,
          [
            isExhausted,
            res.error || "Retry failed",
            retryDelayMs(nextAttempts, 5 * 60_000),
            row.id,
          ]
        );
        if (isExhausted) {
          await updateOutboundMessage(pool, row.message_key, {
            status: "dead_letter",
            lastError: res.error || "Retry limit exhausted",
          });
        }
        errors++;
      }
    } catch (e: any) {
      errors++;
      const error = e instanceof Error ? e.message : String(e);
      console.error("[smsService] SMS DLQ reprocessing failed", {
        messageKey: row.message_key,
        error,
      });
      const isExhausted = Number(row.attempts || 0) >= Number(row.max_attempts || 5);
      const stateUpdate = await pool.query(
        `UPDATE public.sms_dlq_retry_state
            SET paused = $1,
                claimed_at = NULL,
                last_error = $2,
                updated_at = NOW()
          WHERE id = $3`,
        [isExhausted, error, row.id],
      );
      if (stateUpdate.rowCount !== 1) {
        throw new Error(`SMS DLQ retry state could not be persisted for ${row.message_key}`);
      }
      if (isExhausted) {
        await updateOutboundMessage(pool, row.message_key, {
          status: "dead_letter",
          lastError: error,
        });
      }
    }
  }

  return { processed: pending.rows.length, recovered, errors };
}
