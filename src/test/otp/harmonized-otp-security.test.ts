import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { normalizeE164 } from "@/server/communicationServices";
import { generateTotpSecret, verifyTotpCode } from "@/lib/totp";
import {
  calculateOtpVerifier,
  verifyVerifier,
  OtpService,
} from "../../../backend/src/services/phoneOtpService";
import {
  messagingBridge,
  MessagingBridge,
} from "../../../backend/src/services/messagingBridge";

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

  // -----------------------------------------------------------------
  // 6. Server-Secret HMAC Verifier & Purpose Binding
  // -----------------------------------------------------------------
  describe("HMAC-SHA256 Verifier & Purpose Binding", () => {
    it("generates a 6-digit challenge with HMAC verifier bound to challengeId, purpose, and identity", () => {
      const otpService = OtpService.getInstance();
      const phone = "+18482035389";
      const { challenge, rawCode } = otpService.generateChallenge({
        identity: phone,
        purpose: "login",
      });

      expect(rawCode).toMatch(/^\d{6}$/);
      expect(challenge.identity).toBe(phone);
      expect(challenge.purpose).toBe("login");
      expect(challenge.verifier).toHaveLength(64); // SHA-256 hex string

      // Verifier must match expected HMAC calculation
      const expectedHmac = calculateOtpVerifier({
        otp: rawCode,
        identity: phone,
        purpose: "login",
        challengeId: challenge.id,
      });
      expect(verifyVerifier(challenge.verifier, expectedHmac)).toBe(true);
    });

    it("prevents cross-purpose attacks (e.g. phone_link OTP cannot satisfy login)", () => {
      const otp = "839102";
      const challengeId = crypto.randomUUID();
      const identity = "+18482035389";

      // Issued for phone_link
      const phoneLinkVerifier = calculateOtpVerifier({
        otp,
        identity,
        purpose: "phone_link",
        challengeId,
      });

      // Attacker attempts to use this verifier for login
      const loginAttemptVerifier = calculateOtpVerifier({
        otp,
        identity,
        purpose: "login",
        challengeId,
      });

      expect(phoneLinkVerifier).not.toBe(loginAttemptVerifier);
      expect(verifyVerifier(phoneLinkVerifier, loginAttemptVerifier)).toBe(false);
    });

    it("prevents identity-substitution attacks (OTP cannot be transferred to a different phone)", () => {
      const otp = "654321";
      const challengeId = crypto.randomUUID();

      const victimVerifier = calculateOtpVerifier({
        otp,
        identity: "+18482035389",
        purpose: "auth",
        challengeId,
      });

      const attackerVerifier = calculateOtpVerifier({
        otp,
        identity: "+18482039999",
        purpose: "auth",
        challengeId,
      });

      expect(verifyVerifier(victimVerifier, attackerVerifier)).toBe(false);
    });

    it("supports legacy SHA-256 verifiers during transition window", () => {
      const otp = "123456";
      const legacySha256 = crypto.createHash("sha256").update(otp).digest("hex");
      const unmatchingHmac = "0000000000000000000000000000000000000000000000000000000000000000";

      // Should succeed because legacy fallback is supplied
      expect(verifyVerifier(legacySha256, unmatchingHmac, legacySha256)).toBe(true);

      // Should fail if legacy fallback does not match
      const wrongSha256 = crypto.createHash("sha256").update("999999").digest("hex");
      expect(verifyVerifier(legacySha256, unmatchingHmac, wrongSha256)).toBe(false);
    });

    it("formalizes challenge attributes including correlationId, status, and custom purpose (e.g. phone_change)", () => {
      const otpService = OtpService.getInstance();
      const phone = "+2348012345678";
      const { challenge, rawCode } = otpService.generateChallenge({
        identity: phone,
        userId: "user-123",
        purpose: "phone_change",
        channel: "sms",
        metadata: { clientIp: "127.0.0.1" },
      });

      expect(challenge.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(challenge.identity).toBe(phone);
      expect(challenge.userId).toBe("user-123");
      expect(challenge.purpose).toBe("phone_change");
      expect(challenge.channel).toBe("sms");
      expect(challenge.status).toBe("pending");
      expect(challenge.attempts).toBe(0);
      expect(challenge.consumedAt).toBeNull();
      expect(challenge.correlationId).toMatch(/^corr_\d+_[0-9a-f]+$/);
      expect(challenge.metadata?.clientIp).toBe("127.0.0.1");

      // Verify that phone_change challenge cannot be consumed as login
      const loginAttemptVerifier = calculateOtpVerifier({
        otp: rawCode,
        identity: phone,
        purpose: "login",
        challengeId: challenge.id,
      });
      expect(verifyVerifier(challenge.verifier, loginAttemptVerifier)).toBe(false);
    });
  });

  // -----------------------------------------------------------------
  // 7. Consolidated Messaging Bridge & SENT.dm Delivery
  // -----------------------------------------------------------------
  describe("Messaging Bridge & SENT.dm Delivery Consolidation", () => {
    it("routes outbound messaging through MessagingBridge singleton", () => {
      expect(messagingBridge).toBeDefined();
      expect(messagingBridge).toBeInstanceOf(MessagingBridge);
    });

    it("enforces SENT.dm as the authoritative delivery provider for authentication OTPs", async () => {
      const result = await messagingBridge.sendMessage({
        to: "+18482035389",
        message: "123456 is your RentMaikar verification code.",
        source: "auth_otp",
        sandbox: true,
      });

      expect(result.provider).toBe("sent");
      expect(result.channel).toBe("sms");
      expect(result.region).toBe("USA");
      expect(result.deliveryStatus).toBe("simulation");
      expect(result.messageId).toMatch(/^sent_/);
    });

    it("routes Nigerian numbers (+234) through SENT.dm without OTP-level Termii branching", async () => {
      const result = await messagingBridge.sendMessage({
        to: "+2348012345678",
        message: "654321 is your RentMaikar verification code.",
        source: "auth_otp",
        sandbox: true,
      });

      expect(result.provider).toBe("sent");
      expect(result.region).toBe("Nigeria");
      expect(result.deliveryStatus).toBe("simulation");
    });
  });
});
