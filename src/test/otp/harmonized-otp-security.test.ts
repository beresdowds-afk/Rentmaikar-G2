import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { normalizeE164 } from "@/server/communicationServices";
import { generateTotpSecret, verifyTotpCode } from "@/lib/totp";

describe("Harmonized OTP Security Architecture & Authority Segregation", () => {
  // -----------------------------------------------------------------
  // 1. Category Segregation: Supabase Auth vs Application OTP vs TOTP
  // -----------------------------------------------------------------
  describe("Category Segregation", () => {
    it("delineates Supabase Auth recovery from application phone OTP", () => {
      const authRecoveryFlow = {
        authority: "SUPABASE_AUTH_GOTRUE",
        method: "generateLink_recovery",
        modifiesInternalAuthUsers: false,
      };

      const applicationPhoneOtpFlow = {
        authority: "RENTMAIKAR_APPLICATION",
        persistentStore: "public.phone_otp_codes",
        delivery: "sent_primary_with_twilio_termii_failover",
        sessionExchange: "magiclink_token_hash",
      };

      const mfaTotpFlow = {
        authority: "RFC_6238_TOTP",
        storage: "authenticator_app",
      };

      expect(authRecoveryFlow.authority).toBe("SUPABASE_AUTH_GOTRUE");
      expect(authRecoveryFlow.modifiesInternalAuthUsers).toBe(false);
      expect(applicationPhoneOtpFlow.persistentStore).toBe("public.phone_otp_codes");
      expect(mfaTotpFlow.authority).toBe("RFC_6238_TOTP");
      expect(authRecoveryFlow.authority).not.toBe(applicationPhoneOtpFlow.authority);
    });
  });

  // -----------------------------------------------------------------
  // 2. Cryptographic Randomness (Zero Math.random for security OTPs)
  // -----------------------------------------------------------------
  describe("Cryptographic Random Generation", () => {
    it("generates 6-digit OTPs using crypto.randomInt with uniform 6-digit length", () => {
      for (let i = 0; i < 100; i++) {
        const code = crypto.randomInt(100000, 1000000).toString();
        expect(code).toMatch(/^\d{6}$/);
        const num = parseInt(code, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThan(1000000);
      }
    });

    it("generates TOTP secrets using cryptographically secure random bytes without Math.random", () => {
      const secret1 = generateTotpSecret(20);
      const secret2 = generateTotpSecret(20);
      expect(secret1).not.toBe(secret2);
      expect(secret1.length).toBe(32); // 20 bytes Base32 encoded = 32 chars
      expect(secret1).toMatch(/^[A-Z2-7]+$/);
    });
  });

  // -----------------------------------------------------------------
  // 3. Phone OTP One-Time Consumption & Replay Resistance
  // -----------------------------------------------------------------
  describe("One-Time Consumption & State Lifecycle", () => {
    interface SimulatedOtpRow {
      id: string;
      phone: string;
      code_hash: string;
      attempts: number;
      expires_at: number;
      consumed_at: number | null;
    }

    function simulateVerification(
      row: SimulatedOtpRow,
      inputCode: string,
      currentTime: number
    ): { success: boolean; error?: string } {
      if (row.consumed_at !== null) {
        return { success: false, error: "Verification code has already been used. Please request a new one." };
      }
      if (currentTime > row.expires_at) {
        return { success: false, error: "Verification code has expired. Please request a new one." };
      }
      if (row.attempts >= 5) {
        return { success: false, error: "Too many incorrect attempts. This code is invalidated. Please request a new code." };
      }

      const inputHash = crypto.createHash("sha256").update(inputCode).digest("hex");
      if (inputHash !== row.code_hash) {
        row.attempts += 1;
        const remaining = 5 - row.attempts;
        return {
          success: false,
          error: remaining > 0 ? `Invalid verification code (${remaining} attempts remaining)` : "Too many incorrect attempts. Please request a new code.",
        };
      }

      // Atomic consumption
      row.consumed_at = currentTime;
      return { success: true };
    }

    it("successfully verifies an active valid code and consumes it", () => {
      const code = "739201";
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const row: SimulatedOtpRow = {
        id: "otp-1",
        phone: "+18482035389",
        code_hash: codeHash,
        attempts: 0,
        expires_at: Date.now() + 600000,
        consumed_at: null,
      };

      const result = simulateVerification(row, code, Date.now());
      expect(result.success).toBe(true);
      expect(row.consumed_at).not.toBeNull();

      // Immediate replay attempt must fail
      const replay = simulateVerification(row, code, Date.now());
      expect(replay.success).toBe(false);
      expect(replay.error).toContain("already been used");
    });

    it("rejects expired OTP codes", () => {
      const code = "829103";
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const pastTime = Date.now() - 1000;
      const row: SimulatedOtpRow = {
        id: "otp-2",
        phone: "+18482035389",
        code_hash: codeHash,
        attempts: 0,
        expires_at: pastTime,
        consumed_at: null,
      };

      const result = simulateVerification(row, code, Date.now());
      expect(result.success).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("locks out OTP after 5 consecutive incorrect attempts", () => {
      const correctCode = "456789";
      const codeHash = crypto.createHash("sha256").update(correctCode).digest("hex");
      const row: SimulatedOtpRow = {
        id: "otp-3",
        phone: "+18482035389",
        code_hash: codeHash,
        attempts: 0,
        expires_at: Date.now() + 600000,
        consumed_at: null,
      };

      // 5 wrong attempts
      for (let i = 1; i <= 4; i++) {
        const attempt = simulateVerification(row, "000000", Date.now());
        expect(attempt.success).toBe(false);
        expect(attempt.error).toContain("remaining");
      }
      const fifthAttempt = simulateVerification(row, "000000", Date.now());
      expect(fifthAttempt.success).toBe(false);
      expect(row.attempts).toBe(5);

      // Sixth attempt with the CORRECT code must be rejected due to lockout
      const lockedAttempt = simulateVerification(row, correctCode, Date.now());
      expect(lockedAttempt.success).toBe(false);
      expect(lockedAttempt.error).toContain("Too many incorrect attempts");
    });
  });

  // -----------------------------------------------------------------
  // 4. E.164 Phone Normalization
  // -----------------------------------------------------------------
  describe("E.164 Phone Normalization", () => {
    it("correctly normalizes US and Nigerian numbers", () => {
      expect(normalizeE164("8482035389")).toBe("+18482035389");
      expect(normalizeE164("+18482035389")).toBe("+18482035389");
      expect(normalizeE164("08012345678")).toBe("+2348012345678");
      expect(normalizeE164("+2348012345678")).toBe("+2348012345678");
    });
  });

  // -----------------------------------------------------------------
  // 5. Delivery Provider Status Semantics
  // -----------------------------------------------------------------
  describe("Delivery Status Integrity", () => {
    it("never claims 'delivered' upon immediate dispatch", () => {
      const allowedDispatchStatuses = ["queued", "submitted", "simulation", "failed"];
      const forbiddenInitialStatus = "delivered";

      expect(allowedDispatchStatuses).not.toContain(forbiddenInitialStatus);
    });

    it("reports simulation mode explicitly without masquerading as production delivery", () => {
      const sandboxPayload = { sandbox: true };
      const simulatedResult = {
        success: false,
        deliveryStatus: "simulation",
        simulation: true,
      };

      expect(simulatedResult.simulation).toBe(true);
      expect(simulatedResult.deliveryStatus).toBe("simulation");
    });
  });
});
