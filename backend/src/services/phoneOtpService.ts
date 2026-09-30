/**
 * Unified, Cryptographically Secure Phone OTP Service for RentMaikar
 *
 * Authorities & Boundaries:
 * - Persistent Store: public.phone_otp_codes (PostgreSQL)
 * - Cryptography: crypto.randomInt (6-digit), Server-Secret HMAC-SHA-256 verifier
 * - Verifier Binding: HMAC-SHA256(OTP_AUTH_SECRET, challenge_id + purpose + identity + OTP)
 * - Delivery: Authoritative Backend Messaging Bridge -> SENT.dm (Single Delivery Provider)
 * - Session Exchange: Supabase GoTrue Admin generateLink (magiclink) -> client verifyOtp
 *
 * Enforces:
 * - One-time atomic consumption (consumed_at)
 * - Strict 10-minute expiration (expires_at)
 * - Failed attempt limiting (max 5 attempts, then invalidated)
 * - Rate limiting (60s minimum cooldown, max 3 requests per 10m)
 * - Purpose binding: challenges issued for one purpose (e.g. phone_change) cannot be consumed for another (e.g. login)
 * - Zero plaintext OTP storage or logging
 * - Never tampering with internal auth.users recovery_token
 */

import crypto from "crypto";
import { getDbPool } from "./dbPool";
import { messagingBridge } from "./messagingBridge";
import { supabaseBackendService } from "./supabaseService";

import { authenticator } from "./authenticator";

export function normalizeE164(phone: string): string {
  const cleaned = (phone || "").trim().replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.startsWith("234") && cleaned.length === 13) return `+${cleaned}`;
  if (cleaned.startsWith("0") && cleaned.length === 11) return `+234${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

const PHONE_EMAIL_DOMAIN = "phone.rentmaikar.com";

function syntheticEmail(phone: string): string {
  return `phone${phone.replace(/\D/g, "")}@${PHONE_EMAIL_DOMAIN}`;
}

export type OtpChannel = "sms" | "whatsapp" | "email";

export type OtpPurpose =
  | "auth"
  | "login"
  | "signup"
  | "phone_verification"
  | "phone_link"
  | "phone_change"
  | "password_reset"
  | "email_verification"
  | "mfa";

export type OtpChallengeStatus = "pending" | "delivered" | "consumed" | "expired" | "failed";

export interface OtpChallenge {
  id: string;
  identity: string;
  userId?: string | null;
  channel: OtpChannel;
  purpose: OtpPurpose;
  verifier: string;
  attempts: number;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
  status: OtpChallengeStatus;
  correlationId: string;
  provider?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, any>;
}

export interface GenerateChallengeParams {
  identity: string;
  userId?: string | null;
  channel?: OtpChannel;
  purpose?: OtpPurpose;
  expiresInSeconds?: number;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface PersistChallengeParams {
  challenge: OtpChallenge;
  action?: string;
  callerId?: string;
}

export interface DispatchChallengeParams {
  challenge: OtpChallenge;
  rawOtp: string;
  sandbox?: boolean;
}

export interface ConsumeChallengeParams {
  identity: string;
  code: string;
  purpose?: OtpPurpose;
}

export interface SendOtpParams {
  phone: string;
  channel?: "sms" | "whatsapp";
  action?: "send" | "link_send" | "send_code";
  purpose?: OtpPurpose;
  callerId?: string;
  sandbox?: boolean;
}

export interface VerifyOtpParams {
  phone: string;
  code: string;
  action?: "verify" | "link_verify" | "verify_code";
  purpose?: OtpPurpose;
  callerId?: string;
  full_name?: string;
  role?: string;
}

/**
 * Returns the authoritative server secret for HMAC-SHA256 verifier computation.
 * Never stores or leaks this secret to the client.
 * Strictly requires configured environment secret; zero hardcoded fallback in production.
 */
export function getOtpAuthSecret(): string {
  const secret =
    process.env.OTP_AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "test" || process.env.VITEST ? "test_otp_secret_key_for_unit_tests" : "");

  if (!secret) {
    throw new Error(
      "CRITICAL SECURITY CONFIGURATION MISSING: OTP_AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured."
    );
  }
  return secret;
}

/**
 * Computes a server-secret-bound HMAC-SHA256 verifier for an OTP challenge:
 * HMAC-SHA256(OTP_AUTH_SECRET, challengeId + ":" + purpose + ":" + identity + ":" + OTP)
 */
export function calculateOtpVerifier(params: {
  otp: string;
  identity: string;
  purpose: string;
  challengeId: string;
}): string {
  const secret = getOtpAuthSecret();
  const payload = `${params.challengeId}:${params.purpose}:${params.identity}:${params.otp}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Strict timing-safe verifier comparison.
 * Strictly enforces server-secret HMAC-SHA256; legacy un-keyed SHA-256 is permanently rejected.
 */
export function verifyVerifier(
  storedHash: string,
  expectedHash: string
): boolean {
  try {
    const storedBuf = Buffer.from(storedHash, "hex");
    const expectedBuf = Buffer.from(expectedHash, "hex");
    if (storedBuf.length === expectedBuf.length && crypto.timingSafeEqual(storedBuf, expectedBuf)) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Authoritative OTP Engine for RentMaikar
 * Encapsulates identity normalization, challenge generation, persistence, dispatch, and consumption.
 */
export class OtpService {
  private static instance: OtpService | null = null;

  public static getInstance(): OtpService {
    if (!OtpService.instance) {
      OtpService.instance = new OtpService();
    }
    return OtpService.instance;
  }

  /**
   * 1. Normalize identity (Phone to E.164, Email to trimmed lowercase)
   */
  public normalizeIdentity(identity: string, type: "phone" | "email" = "phone"): string {
    if (type === "phone") {
      return normalizeE164(identity);
    }
    return (identity || "").trim().toLowerCase();
  }

  /**
   * 2. Generate a cryptographically secure 6-digit challenge bound to identity and purpose
   */
  public generateChallenge(params: GenerateChallengeParams): {
    challenge: OtpChallenge;
    rawCode: string;
  } {
    // Generate cryptographically secure 6-digit random code
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID();
    const channel: OtpChannel = params.channel || "sms";
    const purpose: OtpPurpose = params.purpose || "login";
    const expiresIn = params.expiresInSeconds || 600; // 10 minutes default
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const createdAt = new Date();
    const correlationId = params.correlationId || `corr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    const verifier = calculateOtpVerifier({
      otp: rawCode,
      identity: params.identity,
      purpose,
      challengeId,
    });

    const challenge: OtpChallenge = {
      id: challengeId,
      identity: params.identity,
      userId: params.userId || null,
      channel,
      purpose,
      verifier,
      attempts: 0,
      expiresAt,
      consumedAt: null,
      createdAt,
      status: "pending",
      correlationId,
      metadata: params.metadata || {},
    };

    return { challenge, rawCode };
  }

  /**
   * 3. Persist challenge with rate limiting, cooldown, and prior code invalidation
   */
  public async persistChallenge(params: PersistChallengeParams): Promise<{
    success: boolean;
    error?: string;
  }> {
    const pool = getDbPool();
    if (!pool) {
      return { success: false, error: "Database connection unavailable for OTP generation" };
    }

    const { challenge } = params;

    // Check linking constraints if this is link_send / send_code
    if (params.action === "link_send" || params.action === "send_code" || challenge.purpose === "phone_link") {
      if (!params.callerId) {
        return { success: false, error: "Authentication required to link a phone number" };
      }

      try {
        const existingProfile = await pool.query(
          `SELECT user_id FROM public.profiles WHERE phone = $1 AND user_id != $2 LIMIT 1`,
          [challenge.identity, params.callerId]
        );
        if (existingProfile.rows.length > 0) {
          return { success: false, error: "That phone number is already linked to another account." };
        }
      } catch (e: any) {
        console.warn("[OtpService] Conflict check warning:", e.message);
      }
    }

    // Rate Limiting & Cooldown Protection (Strict Fail-Closed Policy)
    try {
      // Cooldown: at least 60 seconds between consecutive requests for the same identity
      const recentCheck = await pool.query(
        `SELECT id FROM public.phone_otp_codes
         WHERE (phone = $1 OR identity = $1) AND created_at >= NOW() - INTERVAL '60 seconds'
         LIMIT 1`,
        [challenge.identity]
      );
      if (recentCheck.rows.length > 0) {
        return { success: false, error: "Please wait at least 60 seconds before requesting a new code." };
      }

      // Velocity check: max 3 in the last 10 minutes
      const velocityCheck = await pool.query(
        `SELECT COUNT(*)::int as count FROM public.phone_otp_codes
         WHERE (phone = $1 OR identity = $1) AND created_at >= NOW() - INTERVAL '10 minutes'`,
        [challenge.identity]
      );
      if (velocityCheck.rows[0]?.count >= 3) {
        return { success: false, error: "Too many code requests. Please wait a few minutes." };
      }
    } catch (err: any) {
      console.error("[OtpService] Rate limit query failed closed:", err.message);
      return {
        success: false,
        error: "Security rate limit verification failed. Request rejected.",
      };
    }

    // Invalidate any previously unconsumed OTPs for this identity AND purpose to prevent concurrent codes
    try {
      await pool.query(
        `UPDATE public.phone_otp_codes
         SET consumed_at = NOW(), status = 'expired'
         WHERE (phone = $1 OR identity = $1) AND purpose = $2 AND consumed_at IS NULL`,
        [challenge.identity, challenge.purpose]
      );
    } catch (e: any) {
      console.error("[OtpService] Invalidate prior codes failed closed:", e.message);
      return {
        success: false,
        error: "Failed to initialize verification challenge state.",
      };
    }

    // Persist to Postgres phone_otp_codes table (attempt formalized columns first, fall back to base)
    try {
      await pool.query(
        `INSERT INTO public.phone_otp_codes (
          id, phone, code_hash, channel, attempts, expires_at, created_at,
          identity, user_id, purpose, status, correlation_id, provider, metadata
        ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          challenge.id,
          challenge.identity,
          challenge.verifier,
          challenge.channel,
          challenge.expiresAt.toISOString(),
          challenge.createdAt.toISOString(),
          challenge.identity,
          challenge.userId || null,
          challenge.purpose,
          challenge.status,
          challenge.correlationId,
          challenge.provider || null,
          JSON.stringify(challenge.metadata || {}),
        ]
      );
      return { success: true };
    } catch (dbErr: any) {
      // Fallback if migration hasn't been executed on the target database yet
      if (dbErr.code === "42703" || dbErr.message?.includes("column")) {
        try {
          await pool.query(
            `INSERT INTO public.phone_otp_codes (id, phone, code_hash, channel, attempts, expires_at, created_at)
             VALUES ($1, $2, $3, $4, 0, $5, $6)`,
            [
              challenge.id,
              challenge.identity,
              challenge.verifier,
              challenge.channel,
              challenge.expiresAt.toISOString(),
              challenge.createdAt.toISOString(),
            ]
          );
          return { success: true };
        } catch (fallbackErr: any) {
          console.error("[OtpService] Fallback database insert error:", fallbackErr.message);
          return { success: false, error: "Failed to persist verification state." };
        }
      }
      console.error("[OtpService] Database insert error:", dbErr.message);
      return { success: false, error: "Failed to persist verification state." };
    }
  }

  /**
   * 4. Dispatch challenge through delivery hierarchy (SENT.dm primary)
   */
  public async dispatchChallenge(params: DispatchChallengeParams): Promise<{
    success: boolean;
    provider?: string;
    channel?: string;
    error?: string;
  }> {
    const { challenge, rawOtp, sandbox } = params;
    const messageBody = `${rawOtp} is your RentMaikar verification code. Valid for 10 minutes.`;

    const dispatchRes = await messagingBridge.sendMessage({
      to: challenge.identity,
      message: messageBody,
      channel: challenge.channel === "whatsapp" ? "whatsapp" : "sms",
      templateId: "efe28f88-ad8d-48a5-af69-33529169d58d",
      templateParams: {
        "6 digit code": rawOtp,
        var_1: rawOtp,
        code: rawOtp,
      },
      source: "auth_otp",
      notificationType: "phone_otp",
      correlationId: challenge.correlationId,
      sandbox,
      metadata: {
        otp_record_id: challenge.id,
        purpose: challenge.purpose,
      },
    });

    const pool = getDbPool();

    if (!dispatchRes.success && !dispatchRes.simulation) {
      // Fail Closed: invalidate the stored OTP so an undelivered code cannot be guessed
      if (pool) {
        await pool.query(
          `UPDATE public.phone_otp_codes SET consumed_at = NOW(), status = 'failed' WHERE id = $1`,
          [challenge.id]
        ).catch(() => {});
      }
      return {
        success: false,
        error: `Failed to deliver verification code: ${dispatchRes.error || "SENT.dm delivery unavailable"}`,
      };
    }

    // Update status to delivered if successfully dispatched
    if (pool) {
      await pool.query(
        `UPDATE public.phone_otp_codes
         SET status = 'delivered', provider = 'sent', provider_message_id = $2
         WHERE id = $1`,
        [challenge.id, dispatchRes.messageId || null]
      ).catch(() => {});
    }

    return {
      success: true,
      provider: "sent",
      channel: challenge.channel,
    };
  }

  /**
   * 5. Atomically verify and consume challenge
   */
  public async consumeChallenge(params: ConsumeChallengeParams): Promise<{
    success: boolean;
    challengeId?: string;
    userId?: string | null;
    purpose?: OtpPurpose;
    error?: string;
  }> {
    const pool = getDbPool();
    if (!pool) {
      return { success: false, error: "Database service unavailable" };
    }

    const { identity, code } = params;
    const purpose: OtpPurpose = params.purpose || "login";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Strict identity + purpose query with row-level transaction lock (FOR UPDATE)
      let otpRow: {
        id: string;
        code_hash: string;
        attempts: number;
        expires_at: Date;
        consumed_at: Date | null;
        purpose?: string;
        user_id?: string | null;
        status?: string;
      } | null = null;

      try {
        const res = await client.query(
          `SELECT id, code_hash, attempts, expires_at, consumed_at,
                  purpose, user_id, status
           FROM public.phone_otp_codes
           WHERE (identity = $1 OR phone = $1) AND purpose = $2
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [identity, purpose]
        );
        if (res.rows.length > 0) {
          otpRow = res.rows[0];
        }
      } catch (err: any) {
        // Fallback for legacy schema before formalize migration
        try {
          const fallbackRes = await client.query(
            `SELECT id, code_hash, attempts, expires_at, consumed_at
             FROM public.phone_otp_codes
             WHERE (identity = $1 OR phone = $1)
             ORDER BY created_at DESC
             LIMIT 1
             FOR UPDATE`,
            [identity]
          );
          if (fallbackRes.rows.length > 0) {
            otpRow = {
              ...fallbackRes.rows[0],
              purpose,
            };
          }
        } catch (innerErr: any) {
          await client.query("ROLLBACK").catch(() => {});
          console.error("[OtpService] Query error:", innerErr.message);
          return { success: false, error: "Failed to verify code at this time" };
        }
      }

      if (!otpRow) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: "No active verification code requested for this phone number and purpose.",
        };
      }

      if (otpRow.consumed_at) {
        await client.query("ROLLBACK");
        return { success: false, error: "Verification code has already been used. Please request a new one." };
      }

      if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
        await client.query("ROLLBACK");
        return { success: false, error: "Verification code has expired. Please request a new one." };
      }

      if ((otpRow.attempts || 0) >= 5) {
        await client.query("ROLLBACK");
        return { success: false, error: "Too many incorrect attempts. This code is invalidated. Please request a new code." };
      }

      // Strict Purpose Check: No cross-purpose bypass permitted
      if (otpRow.purpose && otpRow.purpose !== purpose) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: "Verification code was issued for a different purpose. Request rejected.",
        };
      }

      // Calculate expected server-secret-bound HMAC verifier (Strict HMAC-SHA256)
      const expectedHmac = calculateOtpVerifier({
        otp: code,
        identity,
        purpose,
        challengeId: otpRow.id,
      });

      const isValid = verifyVerifier(otpRow.code_hash, expectedHmac);

      if (!isValid) {
        const newAttempts = (otpRow.attempts || 0) + 1;
        const newStatus = newAttempts >= 5 ? "expired" : (otpRow.status || "pending");

        await client.query(
          `UPDATE public.phone_otp_codes
           SET attempts = $1, status = $2
           WHERE id = $3 AND consumed_at IS NULL`,
          [newAttempts, newStatus, otpRow.id]
        );
        await client.query("COMMIT");

        const remaining = Math.max(0, 5 - newAttempts);
        const retryMsg = remaining > 0
          ? `Invalid verification code. (${remaining} attempts remaining)`
          : "Too many incorrect attempts. Please request a new code.";
        return { success: false, error: retryMsg };
      }

      // Atomically consume the OTP (Race condition & Replay defense)
      const consumeRes = await client.query(
        `UPDATE public.phone_otp_codes
         SET consumed_at = NOW(), status = 'consumed'
         WHERE id = $1 AND consumed_at IS NULL
         RETURNING id`,
        [otpRow.id]
      );

      if (consumeRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return { success: false, error: "Verification code already consumed or invalid" };
      }

      await client.query("COMMIT");

      return {
        success: true,
        challengeId: otpRow.id,
        userId: otpRow.user_id,
        purpose: (otpRow.purpose as OtpPurpose) || purpose,
      };
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[OtpService] Atomic consume transaction error:", err.message);
      return { success: false, error: "Database transaction failed during code verification." };
    } finally {
      client.release();
    }
  }
}

export const otpService = OtpService.getInstance();

/**
 * 1. Dispatch a cryptographically secure Phone OTP (delegates to authoritative OtpService)
 */
export async function sendPhoneOtp(params: SendOtpParams): Promise<{
  success: boolean;
  message: string;
  provider?: string;
  channel?: string;
  expiresIn?: number;
  error?: string;
}> {
  const phone = otpService.normalizeIdentity(params.phone, "phone");
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { success: false, message: "Valid E.164 phone number required (e.g. +18482035389)" };
  }

  const purpose: OtpPurpose = params.purpose || ((params.action === "link_send" || params.action === "send_code") ? "phone_link" : "login");
  const channel: OtpChannel = params.channel === "whatsapp" ? "whatsapp" : "sms";

  const { challenge, rawCode } = otpService.generateChallenge({
    identity: phone,
    userId: params.callerId,
    channel,
    purpose,
  });

  const persistResult = await otpService.persistChallenge({
    challenge,
    action: params.action,
    callerId: params.callerId,
  });

  if (!persistResult.success) {
    return { success: false, message: persistResult.error || "Failed to persist verification state." };
  }

  const dispatchResult = await otpService.dispatchChallenge({
    challenge,
    rawOtp: rawCode,
    sandbox: params.sandbox,
  });

  if (!dispatchResult.success) {
    return { success: false, message: dispatchResult.error || "Failed to deliver verification code." };
  }

  return {
    success: true,
    message: `Verification code sent to ${phone}`,
    provider: dispatchResult.provider,
    channel: dispatchResult.channel,
    expiresIn: 600,
  };
}

/**
 * 2. Verify an application Phone OTP with atomic one-time consumption (delegates to authoritative Authenticator)
 */
export async function verifyPhoneOtp(params: VerifyOtpParams): Promise<{
  success: boolean;
  valid: boolean;
  verified?: boolean;
  token_hash?: string;
  user_id?: string;
  is_new_user?: boolean;
  message?: string;
  error?: string;
}> {
  return authenticator.verifyOtp({
    identity: params.phone,
    code: params.code,
    type: "phone",
    action: params.action,
    purpose: params.purpose,
    callerId: params.callerId,
    full_name: params.full_name,
    role: params.role,
  });
}
