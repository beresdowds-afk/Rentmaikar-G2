/**
 * Authoritative Authenticator for RentMaikar
 *
 * Architecture:
 * - Generator generates: OtpService creates cryptographically bound challenges
 * - Delivery delivers: MessagingBridge -> SENT.dm (Single Delivery Provider)
 * - Authenticator verifies: Authenticator validates challenges, enforces expiry,
 *   attempts lockout, replay protection, purpose binding, and identity binding
 * - Supabase records and participates in the authenticated identity/session:
 *   Supabase GoTrue Admin generates magiclink token_hash for browser session exchange.
 *   (NEVER touches or tampers with internal auth.users recovery_token)
 */

import crypto from "crypto";
import { getDbPool } from "./dbPool";
import { otpService, OtpPurpose } from "./phoneOtpService";
import { supabaseBackendService } from "./supabaseService";

const PHONE_EMAIL_DOMAIN = "phone.rentmaikar.com";

function syntheticEmail(phone: string): string {
  return `phone${phone.replace(/\D/g, "")}@${PHONE_EMAIL_DOMAIN}`;
}

export interface AuthenticatorVerifyParams {
  identity: string;
  code: string;
  type?: "phone" | "email";
  purpose?: OtpPurpose;
  action?: "verify" | "link_verify" | "verify_code" | "login" | "signup";
  callerId?: string;
  full_name?: string;
  role?: string;
  correlationId?: string;
}

export interface AuthenticatorVerifyResult {
  success: boolean;
  valid: boolean;
  user_id?: string;
  is_new_user?: boolean;
  token_hash?: string;
  purpose?: OtpPurpose;
  message?: string;
  error?: string;
}

export class Authenticator {
  private static instance: Authenticator | null = null;

  public static getInstance(): Authenticator {
    if (!Authenticator.instance) {
      Authenticator.instance = new Authenticator();
    }
    return Authenticator.instance;
  }

  /**
   * Primary verification entry point:
   * 1. Normalizes identity & validates code format
   * 2. Delegates challenge verification & atomic consumption to OtpService
   * 3. Handles linking if action is link_verify / phone_link
   * 4. Resolves or creates user via Supabase GoTrue Admin
   * 5. Synchronizes public.profiles and public.user_roles
   * 6. Mints GoTrue magiclink token_hash for native client session exchange
   * 7. Records audit event
   */
  public async verifyOtp(params: AuthenticatorVerifyParams): Promise<AuthenticatorVerifyResult> {
    const type = params.type || "phone";
    const identity = otpService.normalizeIdentity(params.identity, type);
    const code = (params.code || "").trim();

    if (!identity) {
      return {
        success: false,
        valid: false,
        error: type === "phone" ? "Valid E.164 phone number required" : "Valid email address required",
      };
    }

    if (!code || !/^\d{6}$/.test(code)) {
      return {
        success: false,
        valid: false,
        error: "A 6-digit verification code is required",
      };
    }

    const action = params.action || "verify";
    const purpose: OtpPurpose =
      params.purpose ||
      (action === "link_verify" || action === "verify_code" ? "phone_link" : "login");

    // 1. Atomically consume challenge via OtpService (enforces expiry, attempts, timing-safe verifier, single consumption)
    const consumeResult = await otpService.consumeChallenge({
      identity,
      code,
      purpose,
    });

    const pool = getDbPool();

    if (!consumeResult.success) {
      // Audit log failed attempt if pool is available
      if (pool) {
        await pool.query(
          `INSERT INTO public.verification_event_log (
            id, correlation_id, stage, step, outcome, failure_code, message, context, created_at
          ) VALUES (gen_random_uuid(), $1, 'authenticator_verify', 'challenge_consumption', 'failure', 'invalid_or_expired', $2, $3, NOW())`,
          [
            params.correlationId || `corr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
            consumeResult.error || "Verification failed",
            JSON.stringify({ identity, purpose, action }),
          ]
        ).catch(() => {});
      }

      return {
        success: false,
        valid: false,
        error: consumeResult.error || "Invalid or expired verification code",
      };
    }

    if (!pool) {
      return {
        success: false,
        valid: false,
        error: "Database service unavailable",
      };
    }

    // 2. Case MFA: Two-factor verification
    if (purpose === "mfa") {
      const callerId = params.callerId || consumeResult.userId;
      return {
        success: true,
        valid: true,
        user_id: callerId,
        purpose: "mfa",
        message: "Two-factor authentication verified successfully",
      };
    }

    // 3. Case A: Authenticated user linking phone number (link_verify / verify_code / phone_link)
    if (action === "link_verify" || action === "verify_code" || purpose === "phone_link") {
      const callerId = params.callerId || consumeResult.userId;
      if (!callerId) {
        return {
          success: false,
          valid: false,
          error: "Authentication required to link phone number",
        };
      }

      try {
        await pool.query(
          `UPDATE public.profiles
           SET phone = $1, phone_verified = true, updated_at = NOW()
           WHERE user_id = $2`,
          [identity, callerId]
        );

        await pool.query(
          `UPDATE auth.users
           SET phone = $1, phone_confirmed_at = NOW()
           WHERE id = $2`,
          [identity.replace(/^\+/, ""), callerId]
        ).catch(() => {});

        // Audit success log
        await pool.query(
          `INSERT INTO public.verification_event_log (
            id, user_id, correlation_id, stage, step, outcome, provider, message, context, created_at
          ) VALUES (gen_random_uuid(), $1, $2, 'authenticator_verify', 'phone_link', 'success', 'sent', 'Phone number verified and linked', $3, NOW())`,
          [
            callerId,
            params.correlationId || `corr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
            JSON.stringify({ identity, purpose, action }),
          ]
        ).catch(() => {});
      } catch (linkErr: any) {
        console.warn("[Authenticator] Profile phone update warning:", linkErr.message);
      }

      return {
        success: true,
        valid: true,
        user_id: callerId,
        purpose,
        message: "Phone number verified and linked successfully",
      };
    }

    // 3. Case B: Authenticate user & mint GoTrue magiclink session exchange token
    const admin = supabaseBackendService.getAdminClient();
    const barePhone = identity.replace(/^\+/, "");
    let userId: string | null = null;
    let signInEmail: string | null = null;
    let isNewUser = false;

    // Resolve user ID from profiles
    try {
      const profHit = await pool.query(
        `SELECT user_id, email FROM public.profiles WHERE phone = $1 OR phone = $2 LIMIT 1`,
        [identity, barePhone]
      );
      if (profHit.rows.length > 0) {
        userId = profHit.rows[0].user_id;
        signInEmail = profHit.rows[0].email;
      }
    } catch (e: any) {
      console.warn("[Authenticator] Profiles lookup warning:", e.message);
    }

    // Resolve user ID from auth.users if not found in profiles
    if (!userId) {
      try {
        const authHit = await pool.query(
          `SELECT id, email FROM auth.users WHERE phone = $1 OR phone = $2 LIMIT 1`,
          [identity, barePhone]
        );
        if (authHit.rows.length > 0) {
          userId = authHit.rows[0].id;
          signInEmail = authHit.rows[0].email;
        }
      } catch (e: any) {
        console.warn("[Authenticator] Auth.users lookup warning:", e.message);
      }
    }

    // Create new user if not existing
    if (!userId) {
      isNewUser = true;
      signInEmail = syntheticEmail(identity);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        phone: identity,
        email: signInEmail,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: {
          full_name: params.full_name || null,
          phone: identity,
          signup_method: "phone_otp",
        },
      });

      if (createErr || !created?.user?.id) {
        console.error("[Authenticator] User creation failed:", createErr?.message);
        if (consumeResult.challengeId && pool) {
          await pool.query(
            `UPDATE public.phone_otp_codes SET consumed_at = NULL, status = 'delivered' WHERE id = $1`,
            [consumeResult.challengeId]
          ).catch(() => {});
        }
        return {
          success: false,
          valid: false,
          error: "Could not create user account for this phone number. Please try again.",
        };
      }
      userId = created.user.id;
    }

    if (!signInEmail) {
      signInEmail = syntheticEmail(identity);
    }

    // Synchronize profile and role idempotently
    try {
      await pool.query(
        `INSERT INTO public.profiles (user_id, email, phone, phone_verified, full_name, created_at, updated_at)
         VALUES ($1, $2, $3, true, $4, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET phone = EXCLUDED.phone,
             phone_verified = true,
             full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
             updated_at = NOW()`,
        [userId, signInEmail, identity, params.full_name || null]
      );

      const requestedRole = params.role === "owner" ? "owner" : "driver";
      await pool.query(
        `INSERT INTO public.user_roles (id, user_id, role)
         VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, requestedRole]
      );
    } catch (profErr: any) {
      console.warn("[Authenticator] Profile/role sync warning:", profErr.message);
    }

    // Mint GoTrue magiclink token_hash for native client session exchange
    // CRITICAL: NEVER write to or tamper with internal auth.users.recovery_token
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: signInEmail,
    });

    if (linkErr || !link?.properties?.hashed_token) {
      console.error("[Authenticator] generateLink failed:", linkErr?.message);
      if (consumeResult.challengeId && pool) {
        await pool.query(
          `UPDATE public.phone_otp_codes SET consumed_at = NULL, status = 'delivered' WHERE id = $1`,
          [consumeResult.challengeId]
        ).catch(() => {});
      }
      return {
        success: false,
        valid: false,
        user_id: userId,
        purpose,
        error: "Failed to establish authenticated session link. Please try again.",
      };
    }

    // Audit log success
    try {
      await pool.query(
        `INSERT INTO public.verification_event_log (
          id, user_id, correlation_id, stage, step, outcome, provider, message, context, created_at
        ) VALUES (gen_random_uuid(), $1, $2, 'authenticator_verify', 'session_mint', 'success', 'sent', 'Phone OTP verified and session minted', $3, NOW())`,
        [
          userId,
          params.correlationId || `corr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
          JSON.stringify({ identity, purpose, isNewUser }),
        ]
      );
    } catch (logErr: any) {
      console.warn("[Authenticator] Audit log warning:", logErr.message);
    }

    return {
      success: true,
      valid: true,
      user_id: userId,
      is_new_user: isNewUser,
      purpose,
      token_hash: link.properties.hashed_token,
      message: "Phone verified successfully",
    };
  }
}

export const authenticator = Authenticator.getInstance();
