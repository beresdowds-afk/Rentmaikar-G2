/**
 * Unified, Cryptographically Secure Phone OTP Service for RentMaikar
 * 
 * Authorities & Boundaries:
 * - Persistent Store: public.phone_otp_codes (PostgreSQL)
 * - Cryptography: crypto.randomInt (6-digit), SHA-256 verifier hash
 * - Delivery Hierarchy: SENT.dm (Primary) -> Twilio (Fallback) -> Termii (Fallback)
 * - Session Exchange: Supabase GoTrue Admin generateLink (magiclink) -> client verifyOtp
 * 
 * Enforces:
 * - One-time atomic consumption (consumed_at)
 * - Strict 10-minute expiration (expires_at)
 * - Failed attempt limiting (max 5 attempts, then invalidated)
 * - Rate limiting (60s minimum cooldown, max 3 requests per 10m)
 * - Zero plaintext OTP storage or logging
 * - Never tampering with internal auth.users recovery_token
 */

import crypto from "crypto";
import { getDbPool } from "./dbPool";
import { sendApplicationMessage } from "./smsService";
import { supabaseBackendService } from "./supabaseService";

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

export interface SendOtpParams {
  phone: string;
  channel?: "sms" | "whatsapp";
  action?: "send" | "link_send" | "send_code";
  callerId?: string;
  sandbox?: boolean;
}

export interface VerifyOtpParams {
  phone: string;
  code: string;
  action?: "verify" | "link_verify" | "verify_code";
  callerId?: string;
  full_name?: string;
  role?: string;
}

/**
 * 1. Dispatch a cryptographically secure Phone OTP
 */
export async function sendPhoneOtp(params: SendOtpParams): Promise<{
  success: boolean;
  message: string;
  provider?: string;
  channel?: string;
  expiresIn?: number;
  error?: string;
}> {
  const phone = normalizeE164(params.phone);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { success: false, message: "Valid E.164 phone number required (e.g. +18482035389)" };
  }

  const pool = getDbPool();
  if (!pool) {
    return { success: false, message: "Database connection unavailable for OTP generation" };
  }

  const channel = params.channel === "whatsapp" ? "whatsapp" : "sms";

  // Check linking constraints if this is link_send
  if (params.action === "link_send" || params.action === "send_code") {
    if (!params.callerId) {
      return { success: false, message: "Authentication required to link a phone number" };
    }

    try {
      const existingProfile = await pool.query(
        `SELECT user_id FROM public.profiles WHERE phone = $1 AND user_id != $2 LIMIT 1`,
        [phone, params.callerId]
      );
      if (existingProfile.rows.length > 0) {
        return { success: false, message: "That phone number is already linked to another account." };
      }
    } catch (e: any) {
      console.warn("[phoneOtpService] Conflict check warning:", e.message);
    }
  }

  // Rate Limiting & Cooldown Protection
  try {
    // Cooldown: at least 60 seconds between consecutive requests for the same phone
    const recentCheck = await pool.query(
      `SELECT id FROM public.phone_otp_codes 
       WHERE phone = $1 AND created_at >= NOW() - INTERVAL '60 seconds' 
       LIMIT 1`,
      [phone]
    );
    if (recentCheck.rows.length > 0) {
      return { success: false, message: "Please wait at least 60 seconds before requesting a new code." };
    }

    // Velocity check: max 3 in the last 10 minutes
    const velocityCheck = await pool.query(
      `SELECT COUNT(*)::int as count FROM public.phone_otp_codes 
       WHERE phone = $1 AND created_at >= NOW() - INTERVAL '10 minutes'`,
      [phone]
    );
    if (velocityCheck.rows[0]?.count >= 3) {
      return { success: false, message: "Too many code requests. Please wait a few minutes." };
    }
  } catch (err: any) {
    console.warn("[phoneOtpService] Rate limit query warning:", err.message);
  }

  // Invalidate any previously unconsumed OTPs for this phone to prevent concurrent codes
  try {
    await pool.query(
      `UPDATE public.phone_otp_codes 
       SET consumed_at = NOW() 
       WHERE phone = $1 AND consumed_at IS NULL`,
      [phone]
    );
  } catch (e: any) {
    console.warn("[phoneOtpService] Invalidate prior codes warning:", e.message);
  }

  // Generate cryptographically secure 6-digit random code
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Persist to Postgres phone_otp_codes table
  let recordId: string | null = null;
  try {
    const insertRes = await pool.query(
      `INSERT INTO public.phone_otp_codes (phone, code_hash, channel, attempts, expires_at, created_at)
       VALUES ($1, $2, $3, 0, $4, NOW())
       RETURNING id`,
      [phone, codeHash, channel, expiresAt.toISOString()]
    );
    recordId = insertRes.rows[0]?.id;
  } catch (dbErr: any) {
    console.error("[phoneOtpService] Database insert error:", dbErr.message);
    return { success: false, message: "Failed to persist verification state." };
  }

  // Dispatch message via Communications Hierarchy: SENT.dm -> Twilio -> Termii
  const messageBody = `${code} is your RentMaikar verification code. Valid for 10 minutes.`;
  const dispatchRes = await sendApplicationMessage({
    to: phone,
    message: messageBody,
    channel,
    sandbox: params.sandbox,
    whatsappTemplateId: "efe28f88-ad8d-48a5-af69-33529169d58d",
    whatsappTemplateParams: {
      "6 digit code": code,
      var_1: code,
      code,
    },
    notificationType: "phone_otp",
    metadata: {
      otp_record_id: recordId,
      action: params.action,
    },
  });

  if (!dispatchRes.success && !dispatchRes.simulation) {
    // Fail Closed: invalidate the stored OTP so an undelivered code cannot be guessed
    if (recordId) {
      await pool.query(
        `UPDATE public.phone_otp_codes SET consumed_at = NOW() WHERE id = $1`,
        [recordId]
      ).catch(() => {});
    }
    return {
      success: false,
      message: `Failed to deliver verification code: ${dispatchRes.error || "Upstream CPaaS providers unavailable"}`,
    };
  }

  return {
    success: true,
    message: `Verification code sent to ${phone}`,
    provider: dispatchRes.provider,
    channel,
    expiresIn: 600,
  };
}

/**
 * 2. Verify an application Phone OTP with atomic one-time consumption
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
  const phone = normalizeE164(params.phone);
  const code = (params.code || "").trim();

  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { success: false, valid: false, error: "Valid phone number required" };
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { success: false, valid: false, error: "A 6-digit verification code is required" };
  }

  const pool = getDbPool();
  if (!pool) {
    return { success: false, valid: false, error: "Database service unavailable" };
  }

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  // Fetch the latest active OTP record for this phone
  let otpRow: { id: string; code_hash: string; attempts: number; expires_at: Date; consumed_at: Date | null } | null = null;
  try {
    const res = await pool.query(
      `SELECT id, code_hash, attempts, expires_at, consumed_at 
       FROM public.phone_otp_codes 
       WHERE phone = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [phone]
    );
    if (res.rows.length > 0) {
      otpRow = res.rows[0];
    }
  } catch (err: any) {
    console.error("[phoneOtpService] Query error:", err.message);
    return { success: false, valid: false, error: "Failed to verify code at this time" };
  }

  if (!otpRow) {
    return { success: false, valid: false, error: "No verification code requested for this phone number" };
  }

  if (otpRow.consumed_at) {
    return { success: false, valid: false, error: "Verification code has already been used. Please request a new one." };
  }

  if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
    return { success: false, valid: false, error: "Verification code has expired. Please request a new one." };
  }

  if ((otpRow.attempts || 0) >= 5) {
    return { success: false, valid: false, error: "Too many incorrect attempts. This code is invalidated. Please request a new code." };
  }

  // Check code hash
  if (otpRow.code_hash !== codeHash) {
    // Atomically increment failed attempts
    await pool.query(
      `UPDATE public.phone_otp_codes 
       SET attempts = attempts + 1 
       WHERE id = $1 AND consumed_at IS NULL`,
      [otpRow.id]
    ).catch(() => {});

    const remaining = 5 - (otpRow.attempts + 1);
    const retryMsg = remaining > 0 
      ? `Invalid verification code. (${remaining} attempts remaining)` 
      : "Too many incorrect attempts. Please request a new code.";
    return { success: false, valid: false, error: retryMsg };
  }

  // Atomically consume the OTP (Race condition & Replay defense)
  const consumeRes = await pool.query(
    `UPDATE public.phone_otp_codes 
     SET consumed_at = NOW() 
     WHERE id = $1 AND consumed_at IS NULL 
     RETURNING id`,
    [otpRow.id]
  );

  if (consumeRes.rowCount === 0) {
    return { success: false, valid: false, error: "Verification code already consumed or invalid" };
  }

  // -----------------------------------------------------------------
  // Action Handlers
  // -----------------------------------------------------------------
  const action = params.action || "verify";

  // Case A: link_verify or verify_code (Authenticated user associating phone)
  if (action === "link_verify" || action === "verify_code") {
    const callerId = params.callerId;
    if (!callerId) {
      return { success: false, valid: false, error: "Authentication required to link phone number" };
    }

    try {
      await pool.query(
        `UPDATE public.profiles 
         SET phone = $1, phone_verified = true, updated_at = NOW() 
         WHERE user_id = $2`,
        [phone, callerId]
      );

      await pool.query(
        `UPDATE auth.users 
         SET phone = $1, phone_confirmed_at = NOW() 
         WHERE id = $2`,
        [phone.replace(/^\+/, ""), callerId]
      ).catch(() => {});
    } catch (e: any) {
      console.warn("[phoneOtpService] Profile update warning:", e.message);
    }

    return {
      success: true,
      valid: true,
      verified: true,
      user_id: callerId,
      message: "Phone number verified and linked successfully",
    };
  }

  // Case B: verify (Sign Up / Sign In via Phone OTP)
  // Authoritative Session Token Minting via Supabase GoTrue Admin API
  const admin = supabaseBackendService.getAdminClient();
  const barePhone = phone.replace(/^\+/, "");
  let userId: string | null = null;
  let signInEmail: string | null = null;
  let isNewUser = false;

  // 1. Resolve user ID from profiles
  try {
    const profHit = await pool.query(
      `SELECT user_id, email FROM public.profiles WHERE phone = $1 OR phone = $2 LIMIT 1`,
      [phone, barePhone]
    );
    if (profHit.rows.length > 0) {
      userId = profHit.rows[0].user_id;
      signInEmail = profHit.rows[0].email;
    }
  } catch (e: any) {
    console.warn("[phoneOtpService] Profiles lookup warning:", e.message);
  }

  // 2. Resolve user ID from auth.users if not found in profiles
  if (!userId) {
    try {
      const authHit = await pool.query(
        `SELECT id, email FROM auth.users WHERE phone = $1 OR phone = $2 LIMIT 1`,
        [phone, barePhone]
      );
      if (authHit.rows.length > 0) {
        userId = authHit.rows[0].id;
        signInEmail = authHit.rows[0].email;
      }
    } catch (e: any) {
      console.warn("[phoneOtpService] Auth.users lookup warning:", e.message);
    }
  }

  // 3. Create new user if not found
  if (!userId) {
    isNewUser = true;
    signInEmail = syntheticEmail(phone);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      phone,
      email: signInEmail,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: {
        full_name: params.full_name || null,
        phone,
      },
    });

    if (createErr || !created?.user?.id) {
      console.error("[phoneOtpService] User creation failed:", createErr?.message);
      return { success: false, valid: false, error: "Could not create user account for this phone number" };
    }
    userId = created.user.id;
  }

  if (!signInEmail) {
    signInEmail = syntheticEmail(phone);
  }

  // 4. Update profile & roles
  try {
    await pool.query(
      `INSERT INTO public.profiles (user_id, email, phone, phone_verified, full_name, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET phone = EXCLUDED.phone,
           phone_verified = true,
           full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
           updated_at = NOW()`,
      [userId, signInEmail, phone, params.full_name || null]
    );

    const role = params.role === "owner" ? "owner" : "driver";
    await pool.query(
      `INSERT INTO public.user_roles (id, user_id, role)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, role]
    );
  } catch (profErr: any) {
    console.warn("[phoneOtpService] Profile/role sync warning:", profErr.message);
  }

  // 5. Mint GoTrue magiclink token_hash for native client session exchange
  // NEVER write to internal auth.users.recovery_token
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: signInEmail,
  });

  if (linkErr || !link?.properties?.hashed_token) {
    console.error("[phoneOtpService] generateLink failed:", linkErr?.message);
    return {
      success: true,
      valid: true,
      user_id: userId,
      is_new_user: isNewUser,
      message: "Phone verified, but session link generation failed. Please sign in.",
    };
  }

  return {
    success: true,
    valid: true,
    user_id: userId,
    is_new_user: isNewUser,
    token_hash: link.properties.hashed_token,
    message: "Phone verified successfully",
  };
}
