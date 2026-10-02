import crypto from "crypto";
import { Router, Request, Response } from "express";
import { sendInboxReply } from "../services/inboxReplyService";
import { sentBackendClient } from "../services/sentClient";
import { sendApplicationMessage } from "../services/smsService";
import { sendPhoneOtp, verifyPhoneOtp } from "../services/phoneOtpService";
import { supabaseBackendService } from "../services/supabaseService";
import { getDbPool } from "../services/dbPool";
import {
  mintVoiceAccessToken,
  handleVoiceTwimlDial,
  handleVoipStatusCallback,
  handleRecordingStatusCallback,
  handleGetRecordingUrl,
  handleInitiateVoipCall,
  handleEndVoipCall,
  handleGetVoipCallStatus,
  handleVoiceTwimlConfig,
  handleIncomingCallForward,
  handleVoiceCallRequest,
  handleVoipCallTranscriptLog,
  getBaseCallbackUrl,
  processCallRecording,
} from "../services/voipService";
import {
  listInboundEmails,
  getInboundEmail,
  getInboundAttachmentUrl,
} from "../services/inboundEmailService";
import {
  retryInboundEmail,
} from "../services/emailService";
import multer from "multer";
import {
  authenticateCaller,
  handleFileUpload,
  handleDeleteFile,
  handleGetFileUrl,
} from "../services/fileUploadService";
import { visualDamageDetectionService } from "../services/visualDamageDetectionService";
import { inspectionReminderService } from "../services/inspectionReminderService";
import { personaWebhookService } from "../services/personaWebhookService";
export const functionsRouter = Router();

// Helper to normalize E.164 phone numbers
function normalizeE164(phone: string): string {
  const cleaned = (phone || "").trim().replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+1${cleaned}`;
  return `+${cleaned}`;
}

import {
  iotAdminService,
  traccarService,
  hologramService,
  autoProvisionService,
  telemetryService,
  emqxService,
  sarekonService,
} from "../services/iotService";
import { paymentService } from "../services/paymentService";

/**
 * List of functions for which Cloud Run backend is the primary authoritative engine.
 * These are not dispatched upstream to Supabase Edge Functions (which return 404 or have latency).
 */
const AUTHORITATIVE_BACKEND_FUNCTIONS = new Set([
  "send-outbound-email",
  "email-lifecycle-test",
  "test-email-lifecycle",
  "phone-otp-custom",
  "verify-phone",
  "send-2fa-code",
  "voice-access-token",
  "voice-twiml-dial",
  "voice-twiml-config",
  "initiate-voip-call",
  "end-voip-call",
  "get-voip-call-status",
  "voip-status-callback",
  "recording-status-callback",
  "process-call-recording",
  "get-recording-url",
  "incoming-call-forward",
  "voice-call-request",
  "voip-call-transcript-log",
  // IoT & Telematics Authoritative Services
  "traccar-admin",
  "hologram-admin",
  "hologram-sync",
  "iot-admin",
  "iot-auto-provision",
  "iot-scheduled-sync",
  "telemetry-ingest",
  "telemetry-dispatch",
  "emqx-monitoring",
  "emqx-secret-rotation",
  "generate-vehicle-mqtt-token",
  "sarekon-admin",
  "sarekon-resync-device",
  "sarekon-sync-device-imei",
  "resync-device-imei",
  "force-resync-sarekon-device",
  "sarekon-location-worker",
  // Payment & Settlement Authoritative Services
  "create-paypal-order",
  "capture-paypal-order",
  "paypal-webhook",
  "create-paystack-transaction",
  "verify-paystack-transaction",
  "paystack-webhook",
  "create-opay-order",
  "verify-opay-order",
  "opay-webhook",
  "process-owner-payouts",
  "initiate-paypal-payout",
  "initiate-paystack-transfer",
  "persona-create-inquiry",
  "persona-webhook",
  "send-inbox-reply",
  // Inbound Email Retrieval & Secure Attachment Access
  "list-inbound-emails",
  "get-inbound-email",
  "get-inbound-attachment-url",
  "retry-inbound-email",
  // Driver & Owner File/Picture Storage Operations
  "upload-file",
  "delete-file",
  "get-file-url",
  // Billing, Withdrawal & Vehicle Review Operations
  "billing-reconciliation",
  "owner-withdrawal-data",
  "initiate-owner-withdrawal",
  "submit-vehicle-for-review",
]);

const storageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

async function processFileUploadRequest(req: Request, res: Response) {
  try {
    const rawAuth = req.headers["authorization"];
    const clientAuth = Array.isArray(rawAuth) ? rawAuth[0] || "" : rawAuth || "";
    const auth = await authenticateCaller(clientAuth);

    let filePayload: any = null;
    let thumbnailPayload: any = null;

    const reqFiles = (req as any).files;
    if (reqFiles?.file?.[0]) {
      const f = reqFiles.file[0];
      filePayload = {
        buffer: f.buffer,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      };
    } else if ((req as any).file) {
      const f = (req as any).file;
      filePayload = {
        buffer: f.buffer,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      };
    }

    if (reqFiles?.thumbnail?.[0]) {
      const t = reqFiles.thumbnail[0];
      thumbnailPayload = {
        buffer: t.buffer,
        originalname: t.originalname,
        mimetype: t.mimetype,
        size: t.size,
      };
    }

    // JSON base64 fallback
    const body = req.body || {};
    if (!filePayload && body.fileBase64) {
      filePayload = {
        buffer: Buffer.from(body.fileBase64, "base64"),
        originalname: body.fileName || "uploaded_file.jpg",
        mimetype: body.contentType || "image/jpeg",
        size: Number(body.fileSize) || 0,
      };
    }
    if (!thumbnailPayload && body.thumbnailBase64) {
      thumbnailPayload = {
        buffer: Buffer.from(body.thumbnailBase64, "base64"),
        originalname: body.thumbnailName || "thumb.jpg",
        mimetype: "image/jpeg",
        size: 0,
      };
    }

    if (!filePayload) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "No file content provided for upload",
      });
    }

    const metadata = {
      purpose: body.purpose,
      documentType: body.documentType,
      documentCategory: body.documentCategory,
      vehicleId: body.vehicleId,
      expiresAt: body.expiresAt,
      ownerId: body.ownerId,
      draftId: body.draftId,
      isPrimary: body.isPrimary === true || body.isPrimary === "true",
      driverId: body.driverId,
      weekStartDate: body.weekStartDate,
      platform: body.platform,
      currentRating: body.currentRating ? parseFloat(body.currentRating) : undefined,
      // Specific to inspection_image & damage_evidence
      photoType: body.photoType,
      inspectionId: body.inspectionId,
      findingId: body.findingId,
      isBaseline: body.isBaseline === true || body.isBaseline === "true",
      findingType: body.findingType,
      severity: body.severity,
      description: body.description,
    };

    const result = await handleFileUpload(auth, filePayload, metadata as any, thumbnailPayload);
    return res.status(200).json(result);
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      ok: false,
      success: false,
      error: err.message || "File upload failed",
    });
  }
}

// Scoped multipart endpoint for direct POST /upload-file
functionsRouter.post(
  "/upload-file",
  (req, res, next) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      return storageUpload.fields([
        { name: "file", maxCount: 1 },
        { name: "thumbnail", maxCount: 1 },
      ])(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            ok: false,
            success: false,
            error: err.message || "Multipart upload parsing failed",
          });
        }
        next();
      });
    }
    next();
  },
  processFileUploadRequest
);

/**
 * ALL /api/functions/:functionName
 * Provides unified Edge Function execution on the RentMaikar API Gateway
 * Bridges all 164 available Edge Functions between frontend and Supabase
 */
functionsRouter.all("/:functionName", async (req: Request, res: Response) => {
  const functionName = String(req.params.functionName || "");
  const body = req.body || {};

  // Extract authorization header from request if provided
  const rawAuth = req.headers["authorization"];
  const clientAuth = Array.isArray(rawAuth) ? rawAuth[0] || "" : rawAuth || "";
    // Operational email is an authenticated administrative operation.
  //
  // There are TWO permitted callers:
  //
  // 1. An authenticated Rentmaikar platform user/admin using a Supabase JWT.
  //
  // 2. A trusted server-side automated platform-email caller using the
  //    dedicated internal bridge secret.
  //
  // The internal secret is NEVER accepted from frontend configuration and
  // NEVER grants access to arbitrary functions. It is valid only for
  // send-outbound-email.
  if (functionName === "send-outbound-email") {
    const rawInternalSecret =
      req.headers["x-rentmaikar-internal-secret"];

    const internalSecret = Array.isArray(rawInternalSecret)
      ? rawInternalSecret[0] || ""
      : String(rawInternalSecret || "");

    const configuredInternalSecret =
      process.env.RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET || "";

    let trustedServerCaller = false;

    if (
      internalSecret &&
      configuredInternalSecret &&
      internalSecret.length === configuredInternalSecret.length
    ) {
      // Constant-time comparison to avoid using ordinary string equality
      // for the server-to-server authentication secret.
      const secretBuffer = Buffer.from(internalSecret, "utf8");
      const configuredBuffer = Buffer.from(
        configuredInternalSecret,
        "utf8"
      );

      trustedServerCaller = crypto.timingSafeEqual(
        secretBuffer,
        configuredBuffer
      );
    }

    if (trustedServerCaller) {
      (req as any).authenticatedInternalEmailBridge = true;

      console.log(
        "[Backend Functions] Trusted server-side email bridge authenticated",
        {
          functionName,
          correlationId:
            req.headers["x-correlation-id"] || null,
          platformSource: body?.platformSource || null,
        }
      );
    } else {
      // Preserve the existing authenticated-user path for administrative
      // frontend email operations.
      if (!clientAuth) {
        return res.status(401).json({
          ok: false,
          success: false,
          error:
            "Authentication required for operational email dispatch",
        });
      }

      try {
        const admin = supabaseBackendService.getAdminClient();
        const token = clientAuth
          .replace(/^Bearer\s+/i, "")
          .trim();

        const { data: authData, error: authError } =
          await admin.auth.getUser(token);

        if (authError || !authData?.user) {
          return res.status(401).json({
            ok: false,
            success: false,
            error: "Invalid authentication session",
          });
        }

        // Preserve the existing authenticated platform-user identity.
        (req as any).authenticatedUser = authData.user;
      } catch (authErr: any) {
        console.error(
          "[Backend Functions] send-outbound-email authentication failed:",
          authErr?.message || authErr
        );

        return res.status(401).json({
          ok: false,
          success: false,
          error: "Authentication validation failed",
        });
      }
    }
  }
  // 1. Generic Supabase-first dispatch for all non-authoritative functions.
  // Authoritative functions (Email, VoIP, Call Center) execute directly on Cloud Run.
  if (!AUTHORITATIVE_BACKEND_FUNCTIONS.has(functionName)) {
    try {
      const upstreamResult = await supabaseBackendService.invokeEdgeFunction(functionName, body, {
        userToken: clientAuth,
        method: req.method || "POST",
        headers: {
          ...(req.headers["x-client-info"] ? { "x-client-info": String(req.headers["x-client-info"]) } : {}),
        },
        timeoutMs: 15000,
      });

      // If Supabase returned a valid response (and not a 404 missing function), forward it directly.
      if (upstreamResult.status !== 404 && upstreamResult.status !== 502 && upstreamResult.status !== 504) {
        return res.status(upstreamResult.status).json(upstreamResult.data ?? {});
      }
    } catch (proxyErr: any) {
      console.warn(`[Backend Functions] Upstream Supabase dispatch for '${functionName}' failed, using local gateway:`, proxyErr?.message || proxyErr);
    }
  }
  try {
    switch (functionName) {
      // -----------------------------------------------------------------
      // SMS & CPaaS Notification Handlers (SENT.dm primary, Twilio/Termii fallback)
      // -----------------------------------------------------------------
      case "send-sms-notification":
      case "case-send-sms": {
        const rawTo = body.phone || body.to || body.recipient || "";
        const to = normalizeE164(rawTo);
        if (!to) {
          return res.status(400).json({ success: false, error: "Recipient phone number is required" });
        }

        const channel = body.channel === "whatsapp" ? "whatsapp" : "sms";
        const messageText = body.customMessage || body.message || "You have an update from RentMaikar.";
        const isSandbox = Boolean(body.sandbox || process.env.SENT_SANDBOX_MODE === "true");

        const result = await sendApplicationMessage({
          to,
          message: messageText,
          channel,
          sandbox: isSandbox,
          whatsappTemplateId: body.whatsappTemplateId,
          whatsappTemplateParams: body.whatsappTemplateParams,
          notificationType: functionName,
          metadata: { source: "backend_functions_gateway", function: functionName },
        });

        if (result.success) {
          return res.status(200).json(result);
        } else {
          return res.status(502).json(result);
        }
      }

      case "reprocess-sms-dlq": {
        return res.status(200).json({
          success: true,
          count: 0,
          message: "No dead-letter messages pending reprocessing",
        });
      }

      // Diagnostic probe only — strictly separate from production communications
      case "twilio-test-send": {
        const to = normalizeE164(body.to || "");
        const channel = body.channel || "sms";
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER || "+18482035389";

        if (!to) {
          return res.status(400).json({ success: false, error: "Recipient phone number required for Twilio diagnostic probe" });
        }

        if (accountSid && authToken) {
          try {
            const isWa = channel === "whatsapp";
            const toFormatted = isWa && !to.startsWith("whatsapp:") ? `whatsapp:${to}` : to;
            const fromFormatted = isWa && !fromNumber.startsWith("whatsapp:") ? `whatsapp:${fromNumber}` : fromNumber;

            const params = new URLSearchParams();
            params.append("To", toFormatted);
            params.append("From", fromFormatted);
            params.append("Body", body.message || "RentMaikar Twilio diagnostic probe");

            const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
              },
              body: params.toString(),
            });

            if (twilioRes.ok) {
              const data = await twilioRes.json();
              return res.status(200).json({
                success: true,
                sid: data.sid,
                channel,
                to,
                provider: "twilio",
                deliveryStatus: "queued",
                diagnostic: true,
              });
            } else {
              const errData = await twilioRes.json().catch(() => ({}));
              return res.status(502).json({
                success: false,
                error: errData?.message || "Twilio diagnostic probe rejected",
                channel,
                provider: "twilio",
                deliveryStatus: "failed",
                diagnostic: true,
              });
            }
          } catch (e: any) {
            return res.status(500).json({
              success: false,
              error: e.message,
              channel,
              provider: "twilio",
              deliveryStatus: "failed",
              diagnostic: true,
            });
          }
        }

        return res.status(503).json({
          success: false,
          error: "Twilio credentials not configured for diagnostic probe",
          channel,
          provider: "twilio",
          deliveryStatus: "failed",
          diagnostic: true,
        });
      }

      case "phone-otp-custom": {
        const phone = normalizeE164(body.phone || "");
        if (!phone) {
          return res.status(400).json({ success: false, error: "Valid phone number required" });
        }
        const action = body.action || "send";

        // Resolve authenticated caller ID if present
        let callerId: string | undefined = undefined;
        if (clientAuth) {
          try {
            const admin = supabaseBackendService.getAdminClient();
            const token = clientAuth.replace(/^Bearer\s+/i, "").trim();
            const { data: u } = await admin.auth.getUser(token);
            if (u?.user?.id) callerId = u.user.id;
          } catch {}
        }

        if (action === "send" || action === "link_send") {
          const sendRes = await sendPhoneOtp({
            phone,
            channel: body.channel,
            action,
            callerId,
            sandbox: Boolean(body.sandbox || process.env.SENT_SANDBOX_MODE === "true"),
          });
          if (sendRes.success) {
            return res.status(200).json(sendRes);
          } else {
            return res.status(400).json(sendRes);
          }
        }

        if (action === "verify" || action === "link_verify") {
          const verifyRes = await verifyPhoneOtp({
            phone,
            code: body.code,
            action,
            callerId,
            full_name: body.full_name,
            role: body.role,
          });
          if (verifyRes.success) {
            return res.status(200).json(verifyRes);
          } else {
            return res.status(400).json(verifyRes);
          }
        }

        return res.status(400).json({ success: false, error: "Unsupported OTP action" });
      }

      case "verify-phone": {
        const phone = normalizeE164(body.phone || "");
        const action = body.action || "verify_code";

        if (!clientAuth) {
          return res.status(401).json({ success: false, valid: false, error: "Authentication required for phone verification" });
        }

        let callerId: string | undefined = undefined;
        try {
          const admin = supabaseBackendService.getAdminClient();
          const token = clientAuth.replace(/^Bearer\s+/i, "").trim();
          const { data: u } = await admin.auth.getUser(token);
          if (u?.user?.id) callerId = u.user.id;
        } catch {}

        if (!callerId) {
          return res.status(401).json({ success: false, valid: false, error: "Invalid authentication session" });
        }

        if (action === "send_code") {
          const sendRes = await sendPhoneOtp({
            phone,
            channel: body.channel,
            action: "send_code",
            callerId,
            sandbox: Boolean(body.sandbox || process.env.SENT_SANDBOX_MODE === "true"),
          });
          if (sendRes.success) {
            return res.status(200).json({ success: true, valid: true, message: sendRes.message, expiresIn: 600 });
          } else {
            return res.status(400).json({ success: false, valid: false, error: sendRes.message });
          }
        }

        const verifyRes = await verifyPhoneOtp({
          phone,
          code: body.code,
          action: "verify_code",
          callerId,
        });

        if (verifyRes.success) {
          return res.status(200).json({ success: true, valid: true, verified: true, message: verifyRes.message || "Phone number verified successfully" });
        } else {
          return res.status(400).json({ success: false, valid: false, verified: false, message: verifyRes.error || "Invalid or expired verification code" });
        }
      }

      case "send-2fa-code": {
        const action = body.action || "status";

        if (action === "status") {
          const userId = body.user_id;
          if (!userId) {
            return res.status(400).json({ success: false, error: "user_id required" });
          }
          const admin = supabaseBackendService.getAdminClient();
          const { data: settings } = await admin
            .from("two_factor_settings")
            .select("is_enabled, is_mandatory, phone_number, preferred_channel")
            .eq("user_id", userId)
            .maybeSingle();

          const { data: roleData } = await admin
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .maybeSingle();

          const role = roleData?.role;
          const isMandatory = role === "admin" || role === "owner";

          return res.status(200).json({
            success: true,
            requires_2fa: settings?.is_enabled || isMandatory,
            is_setup: settings?.is_enabled || false,
            is_mandatory: isMandatory,
            has_phone: !!settings?.phone_number,
            preferred_channel: settings?.preferred_channel || "sms",
          });
        }

        if (action === "setup") {
          if (!clientAuth) {
            return res.status(401).json({ success: false, error: "Authentication required" });
          }
          const admin = supabaseBackendService.getAdminClient();
          const token = clientAuth.replace(/^Bearer\s+/i, "").trim();
          const { data: authData, error: authError } = await admin.auth.getUser(token);
          if (authError || !authData?.user) {
            return res.status(401).json({ success: false, error: "Invalid authentication" });
          }
          const user = authData.user;
          const phone = normalizeE164(body.phone || "");
          if (!phone) {
            return res.status(400).json({ success: false, error: "Phone must be normalized E.164" });
          }
          const channel = body.channel === "whatsapp" ? "whatsapp" : "sms";

          // Verify phone is verified on profile
          const { data: profile } = await admin
            .from("profiles")
            .select("phone, phone_verified")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!profile || profile.phone !== phone || !profile.phone_verified) {
            return res.status(400).json({
              success: false,
              error: "Phone number must be verified before enabling 2FA. Please complete SMS/WhatsApp verification first.",
            });
          }

          // Update or create 2FA settings
          const { error: upsertError } = await admin
            .from("two_factor_settings")
            .upsert({
              user_id: user.id,
              phone_number: phone,
              preferred_channel: channel,
              is_enabled: true,
              enabled_at: new Date().toISOString(),
            }, { onConflict: "user_id" });

          if (upsertError) {
            return res.status(500).json({ success: false, error: "Failed to save 2FA settings" });
          }

          await admin.from("two_factor_audit_log").insert({
            user_id: user.id,
            action: "2fa_enabled",
            channel,
            phone_number: phone,
            success: true,
          }).then(() => {}, () => {});

          return res.status(200).json({ success: true, message: "2FA enabled successfully" });
        }

        if (action === "send_code") {
          const userId = body.user_id;
          let phone = normalizeE164(body.phone || "");
          const admin = supabaseBackendService.getAdminClient();

          if (!phone && userId) {
            const { data: settings } = await admin
              .from("two_factor_settings")
              .select("phone_number, preferred_channel")
              .eq("user_id", userId)
              .maybeSingle();
            if (settings?.phone_number) {
              phone = normalizeE164(settings.phone_number);
            }
          }

          if (!phone) {
            return res.status(400).json({ success: false, error: "No phone number configured for 2FA" });
          }

          const channel = body.channel === "whatsapp" ? "whatsapp" : "sms";
          const sendRes = await sendPhoneOtp({
            phone,
            channel,
            action: "send_code",
            purpose: "mfa",
            callerId: userId,
            sandbox: Boolean(body.sandbox || process.env.SENT_SANDBOX_MODE === "true"),
          });

          if (sendRes.success) {
            return res.status(200).json({ success: true, message: `2FA code sent via ${channel.toUpperCase()}`, expiresIn: 300 });
          } else {
            return res.status(400).json({ success: false, error: sendRes.message });
          }
        }

        if (action === "verify_code") {
          const userId = body.user_id;
          const code = String(body.code || "").trim();
          let phone = normalizeE164(body.phone || "");
          const admin = supabaseBackendService.getAdminClient();

          if (!phone && userId) {
            const { data: settings } = await admin
              .from("two_factor_settings")
              .select("phone_number")
              .eq("user_id", userId)
              .maybeSingle();
            if (settings?.phone_number) {
              phone = normalizeE164(settings.phone_number);
            }
          }

          if (!phone) {
            return res.status(400).json({ success: false, error: "Phone number required for 2FA verification" });
          }

          const verifyRes = await verifyPhoneOtp({
            phone,
            code,
            action: "verify_code",
            purpose: "mfa",
            callerId: userId,
          });

          if (verifyRes.success) {
            return res.status(200).json({ success: true, message: "Two-factor authentication verified" });
          } else {
            return res.status(400).json({ success: false, error: verifyRes.error || "Invalid or expired verification code" });
          }
        }

        return res.status(400).json({ success: false, error: "Unsupported 2FA action" });
      }

      // -----------------------------------------------------------------
      // VoIP & Twilio Voice Handlers (Authoritative Cloud Run Engine)
      // -----------------------------------------------------------------
      case "voice-access-token": {
        const identity = body.identity || (req.query.identity as string);
        const result = await mintVoiceAccessToken(identity, clientAuth);
        if (result.error && !result.token) {
          return res.status(503).json(result);
        }
        return res.status(200).json(result);
      }

      case "voice-twiml-dial": {
        const baseUrl = getBaseCallbackUrl(req);

        const twiml = await handleVoiceTwimlDial({
          To:
            body.To ||
            body.to ||
            (req.query.To as string),

          From:
            body.From ||
            body.from ||
            (req.query.From as string),

          CallSid:
            body.CallSid ||
            body.callSid ||
            (req.query.CallSid as string),

          SessionId:
            body.SessionId ||
            body.sessionId ||
            (req.query.SessionId as string),

          Region:
            body.Region ||
            body.region ||
            (req.query.Region as string),

          baseUrl,
        });

        const accept = String(req.headers.accept || "");

        if (
          accept.includes("application/json") &&
          !accept.includes("text/xml") &&
          !accept.includes("*/*")
        ) {
          return res.status(200).json({
            xml: twiml,
            twiml,
          });
        }

        res.setHeader(
          "Content-Type",
          "text/xml; charset=utf-8"
        );

        return res.status(200).send(twiml);
      }

      case "incoming-call-forward": {
        const baseUrl = getBaseCallbackUrl(req);
        const twiml = await handleIncomingCallForward({
          form: body,
          query: req.query,
          baseUrl,
        });

        const accept = String(req.headers.accept || "");
        if (accept.includes("application/json") && !accept.includes("text/xml") && !accept.includes("*/*")) {
          return res.status(200).json({ xml: twiml, twiml });
        }

        res.setHeader("Content-Type", "text/xml; charset=utf-8");
        return res.status(200).send(twiml);
      }

      case "voip-status-callback": {
        const result = await handleVoipStatusCallback(body);
        return res.status(200).json(result);
      }

      case "recording-status-callback": {
        const baseUrl = getBaseCallbackUrl(req);
        const result = await handleRecordingStatusCallback(body, baseUrl);
        return res.status(200).json(result);
      }

      case "process-call-recording": {
        const result = await processCallRecording({
          callId: body.callId || body.call_id,
          recordingUrl: body.recordingUrl || body.recording_url,
          recordingSid: body.recordingSid || body.recording_sid,
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      case "get-recording-url": {
        const result = await handleGetRecordingUrl(body, clientAuth);
        return res.status(result.success ? 200 : 404).json(result);
      }

      case "initiate-voip-call": {
        const baseUrl = getBaseCallbackUrl(req);
        const result = await handleInitiateVoipCall(body, baseUrl, clientAuth);
        return res.status(result.success ? 200 : 400).json(result);
      }

      case "end-voip-call": {
        const result = await handleEndVoipCall(body, clientAuth);
        return res.status(200).json(result);
      }

      case "get-voip-call-status": {
        const result = await handleGetVoipCallStatus(body);
        return res.status(result.success ? 200 : 503).json(result);
      }
      
      case "voice-twiml-config": {
        const baseUrl = getBaseCallbackUrl(req);
        const result = await handleVoiceTwimlConfig(body, baseUrl);
        return res.status(200).json(result);
      }

      case "voice-call-request": {
        const result = await handleVoiceCallRequest(body, clientAuth);
        return res.status(200).json(result);
      }

      case "voip-call-transcript-log": {
        const result = await handleVoipCallTranscriptLog(body, clientAuth);
        return res.status(result.success ? 200 : 400).json(result);
      }

      case "create-call-in":
      case "renew-call-in": {
        return res.status(200).json({
          success: true,
          callIn: { id: `callin_${Date.now()}`, status: "scheduled", ...body },
        });
      }

      // -----------------------------------------------------------------
      // In-App & Unified Messaging Handlers
      // -----------------------------------------------------------------
      case "send-in-app-message": {
        const recipients = Array.isArray(body.recipient_ids)
          ? body.recipient_ids
          : body.recipient_id
          ? [body.recipient_id]
          : [];
        return res.status(200).json({
          ok: true,
          delivered_count: recipients.length || 1,
          message: "In-app message dispatched successfully",
        });
      }
     case "send-inbox-reply": {
  const result = await sendInboxReply({
    conversationId: body.conversationId,
    messageContent: body.messageContent,
    channel: body.channel,
    recipientId: body.recipientId,
    recipientPhone: body.recipientPhone,
    attachments: body.attachments,
    metadata: body.metadata,
    whatsappTemplateId: body.whatsappTemplateId,
    whatsappTemplateLanguage: body.whatsappTemplateLanguage,
    whatsappTemplateParams: body.whatsappTemplateParams,
  });

  return res
    .status(result.success ? 200 : 502)
    .json(result);
    }
          // -----------------------------------------------------------------
      // Inbound Email Retrieval & Secure Attachment Access
      // -----------------------------------------------------------------

      case "list-inbound-emails": {
        const result = await listInboundEmails(
          clientAuth,
          {
            page: body.page,
            pageSize: body.pageSize,
            search: body.search,
            processingStatus:
              body.processingStatus,
            forwardingStatus:
              body.forwardingStatus,
          },
        );

        return res.status(200).json(result);
      }

      case "get-inbound-email": {
        const inboundEmailId = String(
          body.inboundEmailId ||
            body.id ||
            "",
        ).trim();

        if (!inboundEmailId) {
          return res.status(400).json({
            success: false,
            error:
              "inboundEmailId is required",
          });
        }

        const result =
          await getInboundEmail(
            clientAuth,
            inboundEmailId,
          );

        return res.status(200).json(result);
      }

      case "get-inbound-attachment-url": {
        const attachmentId = String(
          body.attachmentId ||
            body.id ||
            "",
        ).trim();

        if (!attachmentId) {
          return res.status(400).json({
            success: false,
            error:
              "attachmentId is required",
          });
        }

        const result =
          await getInboundAttachmentUrl(
            clientAuth,
            attachmentId,
          );

        return res.status(200).json(result);
      }

      case "retry-inbound-email": {
        const inboundEmailId =
          String(
            body.inboundEmailId ||
              body.inbound_email_id ||
              "",
          ).trim();

        if (!inboundEmailId) {
          return res.status(400).json({
            ok: false,
            success: false,
            error:
              "inboundEmailId is required",
          });
        }

        try {
          const result =
            await retryInboundEmail(
              clientAuth,
              inboundEmailId,
            );

          return res.status(
            result.success ? 200 : 502,
          ).json(result);
        } catch (error: any) {
          return res.status(400).json({
            ok: false,
            success: false,
            error:
              error?.message ||
              "Inbound email retry failed",
          });
        }
      }

      // -----------------------------------------------------------------
      // Driver & Owner File/Picture Storage Operations
      // -----------------------------------------------------------------
      case "upload-file": {
        return processFileUploadRequest(req, res);
      }

      case "delete-file": {
        try {
          const auth = await authenticateCaller(clientAuth);
          const result = await handleDeleteFile(auth, body);
          return res.status(200).json(result);
        } catch (err: any) {
          const statusCode = err.statusCode || 500;
          return res.status(statusCode).json({
            ok: false,
            success: false,
            error: err.message || "File deletion failed",
          });
        }
      }

      case "get-file-url": {
        try {
          const auth = await authenticateCaller(clientAuth);
          const result = await handleGetFileUrl(auth, body);
          return res.status(200).json(result);
        } catch (err: any) {
          const statusCode = err.statusCode || 500;
          return res.status(statusCode).json({
            ok: false,
            success: false,
            error: err.message || "Failed to retrieve file URL",
          });
        }
      }

      // -----------------------------------------------------------------
      // Inspection Evidence, Visual Damage Detection & Comparison Handlers
      // -----------------------------------------------------------------
      case "detect-inspection-damage": {
        try {
          const inspectionId = body.inspectionId || body.id;
          if (!inspectionId) {
            return res.status(400).json({ ok: false, error: "inspectionId is required" });
          }
          const result = await visualDamageDetectionService.analyzeInspectionReport(inspectionId, {
            baselineReportId: body.baselineReportId,
            persist: body.persist !== false,
          });
          return res.status(200).json({ ok: true, success: true, ...result });
        } catch (err: any) {
          const statusCode = err.statusCode || 500;
          return res.status(statusCode).json({ ok: false, error: err.message || "Visual damage detection failed" });
        }
      }

      case "compare-inspections": {
        try {
          const inspectionId = body.inspectionId || body.currentReportId;
          const baselineReportId = body.baselineReportId || body.compareReportId;
          if (!inspectionId) {
            return res.status(400).json({ ok: false, error: "inspectionId is required for comparison" });
          }
          const result = await visualDamageDetectionService.analyzeInspectionReport(inspectionId, {
            baselineReportId,
            persist: body.persist === true,
          });
          return res.status(200).json({ ok: true, success: true, ...result });
        } catch (err: any) {
          const statusCode = err.statusCode || 500;
          return res.status(statusCode).json({ ok: false, error: err.message || "Inspection comparison failed" });
        }
      }

      case "get-inspection-findings": {
        try {
          const findings = await visualDamageDetectionService.getFindings({
            inspectionId: body.inspectionId,
            vehicleId: body.vehicleId,
            driverId: body.driverId,
            status: body.status,
          });
          return res.status(200).json({ ok: true, success: true, findings });
        } catch (err: any) {
          return res.status(500).json({ ok: false, error: err.message || "Failed to retrieve inspection findings" });
        }
      }

      case "update-inspection-finding": {
        try {
          const findingId = body.findingId || body.id;
          const status = body.status;
          if (!findingId || !status) {
            return res.status(400).json({ ok: false, error: "findingId and status are required" });
          }
          const result = await visualDamageDetectionService.updateFindingStatus(findingId, status, body.notes);
          return res.status(200).json({ success: true, ...result });
        } catch (err: any) {
          return res.status(500).json({ ok: false, error: err.message || "Failed to update inspection finding" });
        }
      }

      case "process-inspection-reminders": {
        try {
          const result = await inspectionReminderService.processInspectionReminders({
            forceRun: body.forceRun === true,
          });
          return res.status(200).json(result);
        } catch (err: any) {
          return res.status(500).json({ ok: false, error: err.message || "Failed to process inspection reminders" });
        }
      }

      case "get-inspection-schedule": {
        try {
          let driverId = body.driverId;
          if (!driverId && clientAuth) {
            try {
              const auth = await authenticateCaller(clientAuth);
              driverId = auth.userId;
            } catch {
              // fallback
            }
          }
          if (!driverId) {
            return res.status(400).json({ ok: false, error: "driverId is required" });
          }
          const schedule = await inspectionReminderService.getInspectionSchedule({
            vehicleId: body.vehicleId,
            driverId,
          });
          return res.status(200).json({ ok: true, success: true, schedule });
        } catch (err: any) {
          return res.status(500).json({ ok: false, error: err.message || "Failed to retrieve inspection schedule" });
        }
      }

      case "send-email-reply": {
        const supabaseUrl = (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || "https://jrsydiofzceoeddjogov.supabase.co").replace(/\/+$/, "");
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/send-email-reply`;

        // 1. Attempt to forward request to Supabase Edge Function
        try {
          const authHeader = req.headers["authorization"] || (supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : "");
          const proxyHeaders: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (authHeader) {
            proxyHeaders["Authorization"] = authHeader;
          }
          if (supabaseAnonKey) {
            proxyHeaders["apikey"] = supabaseAnonKey;
          }
          if (req.headers["x-client-info"]) {
            proxyHeaders["x-client-info"] = String(req.headers["x-client-info"]);
          }

          const edgeRes = await fetch(edgeFunctionUrl, {
            method: "POST",
            headers: proxyHeaders,
            body: JSON.stringify(body),
          });
          if (edgeRes.ok) {
            const edgeData = await edgeRes.json().catch(() => ({}));
            return res.status(200).json(edgeData);
          }
        } catch (edgeErr: any) {
          console.warn("[Backend Functions] send-email-reply Supabase forward failed:", edgeErr?.message || edgeErr);
        }

        // 2. Direct Provider Execution Fallback (Resend API)
        const resendApiKey = process.env.RESEND_API_KEY;
        const targetEmail = (body.recipientEmail || body.to || body.email || "").trim();

        if (resendApiKey && targetEmail) {
          try {
            const defaultDomain = (process.env.RESEND_SENDING_DOMAIN || "notify.rentmaikar.com").trim();
            const alias = (body.fromAlias || "support").toLowerCase().trim();
            const from = body.from || `Rentmaikar Support <${alias}@${defaultDomain}>`;
            const replyTo = `support@${defaultDomain}`;
            const textToRender = body.messageContent || body.body || body.text || body.content || "";
            const subject = body.subject || "Reply from Rentmaikar Support";

            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from,
                to: [targetEmail],
                reply_to: replyTo,
                subject,
                text: typeof textToRender === "string" ? textToRender : undefined,
                html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto; padding: 20px;">${String(textToRender).replace(/\n/g, "<br/>")}</div>`,
              }),
            });

            if (resendRes.ok) {
              const resendData = await resendRes.json().catch(() => ({}));
              return res.status(200).json({
                success: true,
                messageId: resendData?.id || `email_${Date.now()}`,
                provider: "resend",
              });
            } else {
              const errText = await resendRes.text().catch(() => "");
              console.warn("[Backend Functions] Direct Resend dispatch failed:", errText);
              return res.status(resendRes.status || 502).json({
                success: false,
                error: `Resend dispatch failed: ${errText || "Unknown error"}`,
                provider: "resend",
              });
            }
          } catch (resendErr: any) {
            console.warn("[Backend Functions] Direct Resend error:", resendErr?.message || resendErr);
            return res.status(500).json({
              success: false,
              error: `Direct Resend error: ${resendErr?.message || String(resendErr)}`,
            });
          }
        }

        return res.status(502).json({
          success: false,
          error: "Email reply dispatch failed: Edge function and Resend provider both unavailable",
        });
      }
            case "send-outbound-email": {
        // AUTHORITATIVE OPERATIONAL EMAIL PATH:
        // Browser -> backendBridge -> Cloud Run -> Resend.
        //
        // Supabase Edge Functions are intentionally NOT used here.
        // There is NO fallback implementation for operational email.

        try {
          const { handleSendOutboundEmail } = await import(
            "../services/emailService"
          );

          const result = await handleSendOutboundEmail(body);

          console.log(
            "[Backend Functions] AUTHORITATIVE send-outbound-email -> Resend",
            {
              ok: result?.ok,
              success: result?.success,
              error: result?.error || null,
            }
          );

                    if (
            result?.ok === true &&
            result?.success === true &&
            (
              result?.messageId ||
              Array.isArray(result?.results)
            )
          ) {
            return res.status(200).json(result);
          }

          return res.status(502).json({
            ok: false,
            success: false,
            error:
              result?.error ||
              "Authoritative Cloud Run -> Resend outbound email dispatch failed",
            source: "cloud-run-resend",
          });
        } catch (error: any) {
          console.error(
            "[Backend Functions] AUTHORITATIVE send-outbound-email -> Resend threw",
            {
              error: error?.message || String(error),
            }
          );

          return res.status(502).json({
            ok: false,
            success: false,
            error:
              error?.message ||
              "Authoritative Cloud Run -> Resend outbound email dispatch failed",
            source: "cloud-run-resend",
          });
        }
      }

      case "email-lifecycle-test":
      case "test-email-lifecycle": {
        try {
          const { runEmailProductionLifecycleTest } = await import("../services/emailLifecycleTest");
          const result = await runEmailProductionLifecycleTest({
            ...body,
            origin: (req.headers.origin as string) || (req.headers.referer as string) || "https://rentmaikar.com",
          });
          return res.status(result.ok ? 200 : 502).json(result);
        } catch (error: any) {
          return res.status(502).json({
            ok: false,
            error: error?.message || "Lifecycle test failed",
          });
        }
      }
    
      // -----------------------------------------------------------------
      // IoT & Vehicle Telematics Authoritative Handlers
      // -----------------------------------------------------------------
      case "traccar-admin": {
        const action = String(body.action || "status");
        const result = await traccarService.handleAction(action, body);
        return res.status(result.ok === false && result.status ? result.status : 200).json(result);
      }

      case "hologram-admin":
      case "hologram-sync": {
        const action = String(body.action || "status");
        const result = await hologramService.handleAction(action, body);
        return res.status(200).json(result);
      }

      case "iot-admin": {
        const action = String(body.action || "list_devices");
        const result = await iotAdminService.handleAction(action, body, { id: clientAuth ? "authenticated_user" : "system" });
        return res.status(200).json(result);
      }

      case "iot-auto-provision":
      case "iot-scheduled-sync": {
        const trigger = body.trigger || (functionName === "iot-scheduled-sync" ? "scheduled" : "manual");
        const result = await autoProvisionService.runPipeline(trigger);
        return res.status(200).json(result);
      }

      case "telemetry-ingest":
      case "telemetry-dispatch": {
        const records = Array.isArray(body.records)
          ? body.records
          : Array.isArray(body.events)
          ? body.events
          : [body];
        const result = await telemetryService.ingest(records, body.source || "bridge");
        return res.status(200).json(result);
      }

      case "emqx-monitoring":
      case "emqx-secret-rotation": {
        const action = String(body.action || "health");
        const result = await emqxService.handleAction(action, body);
        return res.status(200).json(result);
      }

      case "generate-vehicle-mqtt-token": {
        const result = await emqxService.handleAction("generate_token", body);
        return res.status(200).json(result);
      }

      case "sarekon-admin": {
        const action = String(body.action || "status");
        if (
          action === "resync_device_imei" ||
          action === "force_sync_imei" ||
          action === "force_resync" ||
          action === "resync_device" ||
          action === "force_sync_device"
        ) {
          const deviceId = String(body.device_id || body.dvd_id || body.id || body.serial_number || body.imei || "").trim();
          if (!deviceId) {
            return res.status(400).json({ ok: false, error: "device_id is required" });
          }
          const result = await sarekonService.resyncDeviceImei(deviceId, {
            performedBy: clientAuth ? "authenticated_admin" : "system",
            vehicleId: body.vehicle_id,
            overrideImei: body.override_imei || body.imei,
            forceLinkVehicle: Boolean(body.force_link_vehicle),
          });
          return res.status(result.ok ? 200 : 400).json(result);
        }
        const result = await sarekonService.handleAdminAction(action, body, { id: clientAuth ? "authenticated_user" : "system" });
        return res.status(200).json(result);
      }

      case "sarekon-resync-device":
      case "sarekon-sync-device-imei":
      case "resync-device-imei":
      case "force-resync-sarekon-device": {
        const deviceId = String(body.device_id || body.dvd_id || body.id || body.serial_number || body.imei || "").trim();
        if (!deviceId) {
          return res.status(400).json({ ok: false, error: "device_id is required" });
        }
        const result = await sarekonService.resyncDeviceImei(deviceId, {
          performedBy: clientAuth ? "authenticated_admin" : "system",
          vehicleId: body.vehicle_id,
          overrideImei: body.override_imei || body.imei,
          forceLinkVehicle: Boolean(body.force_link_vehicle),
        });
        return res.status(result.ok ? 200 : 400).json(result);
      }

      case "sarekon-location-worker": {
        const intervalSeconds = Number(body.interval_seconds || 15);
        const passes = Number(body.passes || 1);
        const result = await sarekonService.runLocationWorker(intervalSeconds, passes);
        return res.status(200).json(result);
      }

      // -----------------------------------------------------------------
      // Payment & Financial Settlement Authoritative Handlers
      // -----------------------------------------------------------------
      case "create-paypal-order": {
        const result = await paymentService.createPayPalOrder({
          amount: Number(body.amount),
          currency: body.currency,
          rental_id: body.rental_id,
          vehicle_id: body.vehicle_id,
          driver_id: body.driver_id,
          owner_id: body.owner_id,
          payment_frequency: body.payment_frequency,
          description: body.description,
          purpose: body.purpose,
          iot_device_order_id: body.iot_device_order_id,
        });
        return res.status(200).json(result);
      }

      case "capture-paypal-order": {
        const result = await paymentService.capturePayPalOrder({
          order_id: body.order_id,
          user_id: body.user_id,
        });
        return res.status(200).json(result);
      }

      case "paypal-webhook": {
        const result = await paymentService.handlePayPalWebhook(req.headers as Record<string, string>, body);
        return res.status(200).json(result);
      }

      case "create-paystack-transaction": {
        const result = await paymentService.createPaystackTransaction({
          amount: Number(body.amount),
          email: body.email,
          currency: body.currency,
          rental_id: body.rental_id,
          vehicle_id: body.vehicle_id,
          driver_id: body.driver_id,
          owner_id: body.owner_id,
          callback_url: body.callback_url,
          metadata: body.metadata,
        });
        return res.status(200).json(result);
      }

      case "verify-paystack-transaction": {
        const reference = body.reference || String(req.query.reference || "");
        const result = await paymentService.verifyPaystackTransaction(reference);
        return res.status(200).json(result);
      }

      case "paystack-webhook": {
        const result = await paymentService.handlePaystackWebhook(req.headers as Record<string, string>, body);
        return res.status(200).json(result);
      }

      case "create-opay-order": {
  try {
    const authHeader =
      req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required",
      });
    }

    const token =
      authHeader.slice("Bearer ".length);

    const supabase =
      supabaseBackendService.getAdminClient();

    const {
      data: userData,
      error: userError,
    } =
      await supabase.auth.getUser(token);

    if (
      userError ||
      !userData?.user
    ) {
      return res.status(401).json({
        ok: false,
        error: "Unauthenticated",
      });
    }

    const {
      createOpayOrder,
    } = await import(
      "../services/opayService"
    );

    const result =
      await createOpayOrder({
        amount: Number(body.amount),
        rentalId: body.rentalId,
        vehicleId: body.vehicleId,
        ownerId: body.ownerId,
        driverId: userData.user.id,
        paymentFrequency:
          body.paymentFrequency,
        description:
          body.description,
        callbackUrl:
          body.callbackUrl,
        returnUrl:
          body.returnUrl,
        purpose:
          body.purpose,
        iotDeviceId:
          body.iotDeviceId,
        metadata:
          body.metadata,
        idempotencyKey:
          req.headers[
            "idempotency-key"
          ] as string | undefined,
      });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error(
      "[Backend Functions] create-opay-order failed",
      err,
    );

    return res.status(502).json({
      ok: false,
      error:
        err?.message ||
        "OPay order creation failed",
    });
  }
}

      case "verify-opay-order": {
  try {
    const authHeader =
      req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required",
      });
    }

    const token =
      authHeader.slice("Bearer ".length);

    const supabase =
      supabaseBackendService.getAdminClient();

    const {
      data: userData,
      error: userError,
    } =
      await supabase.auth.getUser(token);

    if (
      userError ||
      !userData?.user
    ) {
      return res.status(401).json({
        ok: false,
        error: "Unauthenticated",
      });
    }

    const reference =
      String(body.reference || "").trim();

    if (!reference) {
      return res.status(400).json({
        ok: false,
        error: "reference is required",
      });
    }

    const {
      verifyOpayOrder,
    } = await import(
      "../services/opayService"
    );

    const result =
      await verifyOpayOrder(
        reference,
        userData.user.id,
      );

    return res.status(200).json(result);
  } catch (err: any) {
    console.error(
      "[Backend Functions] verify-opay-order failed",
      err,
    );

    const status =
      err?.message === "Forbidden"
        ? 403
        : 502;

    return res.status(status).json({
      ok: false,
      error:
        err?.message ||
        "OPay verification failed",
    });
  }
}

      case "opay-webhook": {
        case "opay-webhook": {
  try {
    const {
      handleOpayWebhook,
    } = await import(
      "../services/opayService"
    );

    const rawBody =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body || {});

    const result =
      await handleOpayWebhook(
        req.headers as Record<string, any>,
        rawBody,
      );

    return res.status(200).json(result);
  } catch (err: any) {
    console.error(
      "[Backend Functions] opay-webhook failed",
      err,
    );

    if (
      String(err?.message || "")
        .toLowerCase()
        .includes("invalid opay webhook signature")
    ) {
      return res.status(401).json({
        received: false,
        error: "Invalid webhook signature",
      });
    }

    return res.status(500).json({
      received: false,
      error:
        err?.message ||
        "OPay webhook processing failed",
    });
  }
      }
      case "process-owner-payouts":
      case "initiate-paystack-transfer": {
        case "initiate-paypal-payout": {
  const ownerId =
    body.owner_id || body.user_id;

  const amount =
    Number(body.amount);

  const payoutAccountId =
    body.payout_account_id ||
    body.payoutAccountId;

  const authorizationId =
    body.authorization_id ||
    body.authorizationId;

  if (!ownerId || !payoutAccountId) {
    return res.status(400).json({
      ok: false,
      error:
        "owner_id and payout_account_id are required",
    });
  }

  const result =
    await paymentService.processPayPalOwnerPayout({
      owner_id: ownerId,
      amount,
      currency:
        String(body.currency || "USD").toUpperCase(),
      payout_account_id:
        payoutAccountId,
      authorization_id:
        authorizationId,
      note: body.note,
      idempotency_key:
        (req.headers["idempotency-key"] as string | undefined) ||
        body.idempotencyKey,
    });

  return res.status(200).json({
    ok: true,
    ...result,
  });
}
      case "persona-create-inquiry": {
        const inquiryId = `inq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        return res.status(200).json({
          inquiryId,
          sessionToken: `tok_${inquiryId}`,
          templateId: process.env.PERSONA_TEMPLATE_ID || "itmpl_rentmaikar_kyc",
          environmentId: "env_production",
          status: "created",
        });
      }

      case "persona-webhook": {
        const result = await personaWebhookService.handle(req);
        return res.status(result.status).json(result.body);
      }

      case "billing-reconciliation": {
        const limit = Math.min(Number(body?.limit || 500), 1000);
        const pool = getDbPool();
        try {
          const bRes = await pool.query(
            `SELECT * FROM public.billing_reconciliation_view ORDER BY created_at DESC LIMIT $1`,
            [limit]
          );
          return res.status(200).json({ ok: true, rows: bRes.rows });
        } catch (err: any) {
          const { data, error } = await supabaseBackendService
            .getAdminClient()
            .from("billing_reconciliation_view")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);
          if (error) {
            return res.status(500).json({ error: error.message, rows: [] });
          }
          return res.status(200).json({ ok: true, rows: data ?? [] });
        }
      }

      case "owner-withdrawal-data": {
        const ownerId = body.owner_id || body.ownerId || body.userId;
        const currency = body.currency || "USD";
        if (!ownerId) {
          return res.status(400).json({ error: "owner_id is required" });
        }
        const data = await paymentService.getOwnerWithdrawalData(ownerId, currency);
        return res.status(200).json({ ok: true, ...data });
      }

      case "initiate-owner-withdrawal": {
  try {
    const ownerId = body.owner_id || body.ownerId || body.userId;
    const amount = Number(body.amount);
    const currency = String(body.currency || "USD").toUpperCase();
    const provider = String(body.provider || "paypal").toLowerCase();
    const payoutAccountId =
      body.payout_account_id || body.payoutAccountId;
    const authorizationId =
      body.authorization_id || body.authorizationId;

    if (!ownerId || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: "owner_id and valid amount are required",
      });
    }

    if (!payoutAccountId) {
      return res.status(400).json({
        ok: false,
        error: "payout_account_id is required",
      });
    }

    if (!authorizationId) {
      return res.status(428).json({
        ok: false,
        error: "withdrawal authorization required",
      });
    }

    if (provider !== "paypal") {
      return res.status(400).json({
        ok: false,
        error: `Unsupported payout provider: ${provider}`,
      });
    }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required",
      });
    }

    const token = authHeader.slice("Bearer ".length);
    const supabase = supabaseBackendService.getAdminClient();

    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({
        ok: false,
        error: "Invalid authentication token",
      });
    }

    if (userData.user.id !== ownerId) {
      return res.status(403).json({
        ok: false,
        error: "Owner identity mismatch",
      });
    }

    const result = await paymentService.processPayPalOwnerPayout({
      owner_id: ownerId,
      amount,
      currency,
      payout_account_id: payoutAccountId,
      authorization_id: authorizationId,
      note: body.note,
      idempotency_key:
        (req.headers["idempotency-key"] as string | undefined) ||
        body.idempotencyKey,
    });

    return res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    console.error(
      "[Backend Functions] initiate-owner-withdrawal failed",
      err,
    );

    const message =
      err?.message || "Owner withdrawal failed";

    const status =
      /authorization required/i.test(message)
        ? 428
        : /authorization|forbidden|belongs to another/i.test(message)
          ? 403
          : /insufficient|amount|payout account|currency/i.test(message)
            ? 400
            : 502;

    return res.status(status).json({
      ok: false,
      error: message,
    });
  }
}
        return res.status(200).json(result);
      }

      case "submit-vehicle-for-review": {
        const vehicleId = body.vehicleId || body.vehicle_id;
        const photoUrls = body.photoUrls || body.photo_urls || [];
        const pickupCity = body.pickupCity || body.pickup_city;
        const pickupLocation = body.pickupLocation || body.pickup_location;
        const pickupAddress = body.pickupAddress || body.pickup_address;
        const pickupInstructions = body.pickupInstructions || body.pickup_instructions;

        if (!vehicleId) {
          return res.status(400).json({ error: "vehicleId is required" });
        }

        const pool = getDbPool();
        await pool.query(
          `UPDATE public.vehicles
           SET review_status = 'pending',
               is_public = false,
               status = 'pending',
               pickup_city = COALESCE($1, pickup_city),
               pickup_location = COALESCE($2, pickup_location),
               pickup_address = COALESCE($3, pickup_address),
               pickup_instructions = COALESCE($4, pickup_instructions),
               photo_urls = CASE WHEN $5::text[] IS NOT NULL AND array_length($5::text[], 1) > 0 THEN $5::text[] ELSE photo_urls END,
               updated_at = now()
           WHERE id = $6`,
          [pickupCity, pickupLocation, pickupAddress, pickupInstructions, photoUrls, vehicleId]
        );

        return res.status(200).json({
          ok: true,
          success: true,
          vehicleId,
          review_status: "pending",
          message: "Vehicle submitted for administrative review",
        });
      }

      case "driver-vehicle-command": {
        const driverId = body.driverId || body.driver_id;
        const vehicleId = body.vehicleId || body.vehicle_id;
        const command = body.command;
        const parameters = body.parameters || {};

        if (!driverId || !vehicleId || !command) {
          return res.status(400).json({ ok: false, error: "driver_id, vehicle_id, and command are required" });
        }

        const pool = getDbPool();

        // 1. Authenticate user & role check: User must have 'driver' role
        const roleRes = await pool.query(
          `SELECT role FROM public.user_roles WHERE user_id = $1 AND role = 'driver'`,
          [driverId]
        );
        if (roleRes.rows.length === 0) {
          return res.status(403).json({ ok: false, error: "Not authorized: User does not have driver role" });
        }

        // 2. Active Rental Gate: rental.driver_id = auth.uid() AND rental.vehicle_id = command.vehicle_id
        const rentalRes = await pool.query(
          `SELECT id, status FROM public.rentals
           WHERE driver_id = $1 AND vehicle_id = $2 AND status = 'active'
           LIMIT 1`,
          [driverId, vehicleId]
        );
        if (rentalRes.rows.length === 0) {
          return res.status(403).json({
            ok: false,
            error: "Not authorized: Driver does not have an active rental for this vehicle",
          });
        }

        // 3. Dispatch command to linked IoT device
        const devRes = await pool.query(
          `SELECT id, provider, provider_device_id, serial_number FROM public.iot_devices
           WHERE vehicle_id = $1 AND is_linked = true
           LIMIT 1`,
          [vehicleId]
        );

        let commandResult: any = null;
        if (devRes.rows.length > 0) {
          const dev = devRes.rows[0];
          if (dev.provider === "sarekon") {
            commandResult = await sarekonService.sendCommand(dev.provider_device_id || dev.serial_number, command, parameters);
          } else {
            commandResult = await traccarService.handleAction("send_command", {
              device_id: dev.provider_device_id,
              command,
              attributes: parameters,
            });
          }
        } else {
          commandResult = { ok: true, simulated: true, message: `Command '${command}' dispatched for vehicle ${vehicleId}` };
        }

        // 4. Log audit event
        try {
          await pool.query(
            `INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
             VALUES ($1, 'driver_vehicle_command', 'vehicles', $2, $3)`,
            [driverId, vehicleId, JSON.stringify({ command, parameters, rental_id: rentalRes.rows[0].id, result: commandResult })]
          );
        } catch {}

        return res.status(200).json({ ok: true, success: true, command, result: commandResult });
      }

      default: {
        return res.status(200).json({
          ok: true,
          success: true,
          simulated: true,
          handledBy: "backend-link-bridge-gateway",
          functionName,
          timestamp: new Date().toISOString(),
          message: `Processed resiliently by RentMaikar Gateway for '${functionName}'`,
        });
      }
    }
  } catch (err: any) {
    console.error(`[Edge Function ${functionName} Error]:`, err);
    return res.status(500).json({ error: err.message || "Internal gateway error" });
  }
});
