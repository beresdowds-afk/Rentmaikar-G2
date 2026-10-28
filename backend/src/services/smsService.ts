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

// In-memory idempotency cache for deduplication within process lifetime
const idempotencyCache = new Map<string, { result: SendApplicationMessageResult; expiresAt: number }>();

function getCachedIdempotentResult(key: string): SendApplicationMessageResult | null {
  const cached = idempotencyCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  return cached.result;
}

function setCachedIdempotentResult(key: string, result: SendApplicationMessageResult, ttlMs = 300_000): void {
  // Bounded cache (max 2000 items)
  if (idempotencyCache.size > 2000) {
    const firstKey = idempotencyCache.keys().next().value;
    if (firstKey) idempotencyCache.delete(firstKey);
  }
  idempotencyCache.set(key, { result, expiresAt: Date.now() + ttlMs });
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
      region: isNg ? "Nigeria" : "USA",
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
      region: isNg ? "Nigeria" : "USA",
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

  // -----------------------------------------------------------------
  // 0. IDEMPOTENCY CHECK
  // -----------------------------------------------------------------
  const idempotencyKey = payload.idempotencyKey?.trim();
  if (idempotencyKey) {
    const cached = getCachedIdempotentResult(idempotencyKey);
    if (cached) {
      console.log(`[smsService] Idempotency match in cache for key '${idempotencyKey}': returning prior outcome`);
      return cached;
    }

    try {
      const pool = getDbPool();
      if (pool) {
        const existing = await pool.query(
          `SELECT provider, provider_message_id, delivery_status, error_message, metadata
             FROM public.unified_message_log
            WHERE metadata->>'idempotencyKey' = $1
              AND delivery_status IN ('queued', 'submitted', 'sent', 'delivered', 'simulation')
            ORDER BY created_at DESC
            LIMIT 1`,
          [idempotencyKey]
        );
        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          const priorResult: SendApplicationMessageResult = {
            success: row.delivery_status !== "failed",
            messageId: row.provider_message_id || `dedup_${idempotencyKey}`,
            channel,
            provider: (row.provider as any) || "sent",
            deliveryStatus: row.delivery_status,
            region,
            simulation: row.delivery_status === "simulation",
          };
          setCachedIdempotentResult(idempotencyKey, priorResult);
          console.log(`[smsService] Idempotency match in database for key '${idempotencyKey}': deduplicated duplicate send`);
          return priorResult;
        }
      }
    } catch (err: any) {
      console.warn("[smsService] Idempotency check warning:", err.message);
    }
  }

  const messageText = payload.message || "You have an update from RentMaikar.";
  const override = payload.providerOverride;
  const metadataWithKey = {
    ...payload.metadata,
    idempotencyKey: idempotencyKey || undefined,
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

        if (idempotencyKey) {
          setCachedIdempotentResult(idempotencyKey, successResult);
        }

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

          if (idempotencyKey) {
            setCachedIdempotentResult(idempotencyKey, twilioResult);
          }

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

        if (idempotencyKey) {
          setCachedIdempotentResult(idempotencyKey, termiiResult);
        }

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
  // 4. ALL PROVIDERS FAILED OR UNAVAILABLE (Fail Closed)
  // -----------------------------------------------------------------
  const failureError = `All communications providers failed: SENT.dm (${sentFailureReason}), Twilio (${twilioFailureReason}), Termii (${termiiFailureReason})`;

  await logMessageDispatch({
    phone: to,
    region,
    provider: "none",
    channel,
    message: messageText,
    deliveryStatus: "failed",
    error: failureError,
    metadata: { ...metadataWithKey, notificationType: payload.notificationType },
  });

  const failureResult: SendApplicationMessageResult = {
    success: false,
    channel,
    provider: "none",
    deliveryStatus: "failed",
    region,
    error: failureError,
  };

  return failureResult;
}
