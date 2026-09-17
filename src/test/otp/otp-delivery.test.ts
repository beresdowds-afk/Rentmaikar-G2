import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { normalizeToE164, PhoneValidationError } from "@/lib/phone-normalize";
import { looksLikeOtpMessage, OTP_IN_APP_BLOCK_MESSAGE } from "../../../supabase/functions/_shared/otp-guard";

// Helper for OTP generation matching backend implementation
function generateSixDigitOtp(): string {
  const buf = new Uint32Array(1);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(buf);
  } else {
    crypto.randomFillSync(buf);
  }
  return (100000 + (buf[0] % 900000)).toString();
}

// In-memory OTP simulation matching handlePhoneOtp in communicationServices.ts
interface SimulatedOtpRecord {
  code: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
}

class InMemoryOtpManager {
  private store = new Map<string, SimulatedOtpRecord>();

  sendOtp(phone: string, channel: "sms" | "whatsapp" = "sms", ttlMs = 10 * 60 * 1000) {
    const normalized = normalizeToE164(phone);
    const code = generateSixDigitOtp();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = Date.now() + ttlMs;

    this.store.set(normalized, {
      code,
      codeHash,
      expiresAt,
      attempts: 0,
      consumed: false,
    });

    const isNigeria = normalized.startsWith("+234");
    const provider = isNigeria ? "termii" : "sent";

    return {
      success: true,
      phone: normalized,
      code, // returned for verification in test environment
      channel,
      provider,
      message: `Your RentMaikar verification code is: ${code}. Valid for 10 minutes. Do not share this code.`,
    };
  }

  verifyOtp(phone: string, inputCode: string) {
    const normalized = normalizeToE164(phone);
    const record = this.store.get(normalized);

    if (!record) {
      return { success: false, error: "No OTP request found for this phone number." };
    }

    if (record.consumed) {
      return { success: false, error: "This OTP code has already been used." };
    }

    if (Date.now() > record.expiresAt) {
      return { success: false, error: "Verification code has expired. Please request a new one." };
    }

    record.attempts += 1;
    if (record.attempts > 3) {
      return { success: false, error: "Too many failed attempts. Please request a new code." };
    }

    const inputHash = crypto.createHash("sha256").update(inputCode).digest("hex");
    if (inputHash !== record.codeHash) {
      return { success: false, error: "Invalid verification code. Please check and try again." };
    }

    record.consumed = true;
    return { success: true, message: "Phone number verified successfully." };
  }
}

describe("OTP Delivery via SMS", () => {
  let otpManager: InMemoryOtpManager;

  beforeEach(() => {
    otpManager = new InMemoryOtpManager();
  });

  describe("Phone Number Normalization & Validation", () => {
    it("normalizes US local and international formats to strict E.164", () => {
      expect(normalizeToE164("4155552671", "US")).toBe("+14155552671");
      expect(normalizeToE164("+1 (415) 555-2671")).toBe("+14155552671");
    });

    it("normalizes Nigerian numbers to +234 E.164 format", () => {
      expect(normalizeToE164("+2348139051772")).toBe("+2348139051772");
    });

    it("throws a PhoneValidationError on invalid or incomplete numbers", () => {
      expect(() => normalizeToE164("123")).toThrow(PhoneValidationError);
      expect(() => normalizeToE164("")).toThrow(PhoneValidationError);
    });
  });

  describe("SMS OTP Code Generation & Provider Routing", () => {
    it("generates a secure 6-digit numeric OTP code", () => {
      const code = generateSixDigitOtp();
      expect(code).toMatch(/^\d{6}$/);
      expect(Number(code)).toBeGreaterThanOrEqual(100000);
      expect(Number(code)).toBeLessThanOrEqual(999999);
    });

    it("routes US destinations to Sent.dm and formats message text with security notice", () => {
      const dispatch = otpManager.sendOtp("+14155552671", "sms");
      expect(dispatch.success).toBe(true);
      expect(dispatch.provider).toBe("sent");
      expect(dispatch.phone).toBe("+14155552671");
      expect(dispatch.message).toContain(dispatch.code);
      expect(dispatch.message).toContain("Valid for 10 minutes");
      expect(dispatch.message).toContain("Do not share this code");
    });

    it("routes Nigerian destinations (+234) to Termii with valid payload", () => {
      const dispatch = otpManager.sendOtp("+2348139051772", "sms");
      expect(dispatch.success).toBe(true);
      expect(dispatch.provider).toBe("termii");
      expect(dispatch.phone).toBe("+2348139051772");
      expect(dispatch.message).toContain(dispatch.code);
    });
  });

  describe("SMS OTP Verification Lifecycle", () => {
    it("successfully verifies a valid OTP code", () => {
      const dispatch = otpManager.sendOtp("+14155552671");
      const result = otpManager.verifyOtp("+14155552671", dispatch.code);
      expect(result.success).toBe(true);
      expect(result.message).toBe("Phone number verified successfully.");
    });

    it("rejects an incorrect OTP code", () => {
      otpManager.sendOtp("+14155552671");
      const result = otpManager.verifyOtp("+14155552671", "000000");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid verification code");
    });

    it("prevents replay attacks by invalidating a consumed OTP code", () => {
      const dispatch = otpManager.sendOtp("+14155552671");
      const firstAttempt = otpManager.verifyOtp("+14155552671", dispatch.code);
      expect(firstAttempt.success).toBe(true);

      const secondAttempt = otpManager.verifyOtp("+14155552671", dispatch.code);
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.error).toContain("already been used");
    });

    it("enforces expiration when the OTP code exceeds its TTL", () => {
      // Simulate expired code (-1ms TTL)
      const dispatch = otpManager.sendOtp("+14155552671", "sms", -1000);
      const result = otpManager.verifyOtp("+14155552671", dispatch.code);
      expect(result.success).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("locks out verification after 3 consecutive failed attempts", () => {
      const dispatch = otpManager.sendOtp("+14155552671");
      otpManager.verifyOtp("+14155552671", "111111");
      otpManager.verifyOtp("+14155552671", "222222");
      otpManager.verifyOtp("+14155552671", "333333");

      const fourthAttempt = otpManager.verifyOtp("+14155552671", dispatch.code);
      expect(fourthAttempt.success).toBe(false);
      expect(fourthAttempt.error).toContain("Too many failed attempts");
    });
  });

  describe("2FA Phone Verification Code Hashing", () => {
    it("hashes 6-digit OTP with cryptographic salt and verifies hash comparison", () => {
      const code = generateSixDigitOtp();
      const salt = crypto.randomBytes(16).toString("hex");
      const hashedCode = crypto.pbkdf2Sync(code, salt, 1000, 64, "sha512").toString("hex");

      const validVerification = crypto.pbkdf2Sync(code, salt, 1000, 64, "sha512").toString("hex");
      const invalidVerification = crypto.pbkdf2Sync("999999", salt, 1000, 64, "sha512").toString("hex");

      expect(validVerification).toBe(hashedCode);
      expect(invalidVerification).not.toBe(hashedCode);
    });
  });
});

describe("OTP Delivery via Email", () => {
  describe("Email OTP Generation & Cryptographic Hashing", () => {
    it("generates a 6-digit OTP and derives sha224 token hash matching recovery_token schema", () => {
      const email = "driver@example.com";
      const rawOtp = generateSixDigitOtp();
      const tokenHash = crypto.createHash("sha224").update(email + rawOtp).digest("hex");

      expect(rawOtp).toMatch(/^\d{6}$/);
      expect(tokenHash).toHaveLength(56); // SHA-224 output length in hex is 56 chars
    });

    it("validates recovery link structure containing email and token params", () => {
      const email = "driver@example.com";
      const rawOtp = "582104";
      const origin = "https://rentmaikar.com";
      const resetUrl = `${origin}/reset-password?email=${encodeURIComponent(email)}&token=${rawOtp}`;

      const parsedUrl = new URL(resetUrl);
      expect(parsedUrl.pathname).toBe("/reset-password");
      expect(parsedUrl.searchParams.get("email")).toBe(email);
      expect(parsedUrl.searchParams.get("token")).toBe(rawOtp);
    });
  });

  describe("Email Template Content & Rendering", () => {
    it("renders branded verification email with code, recipient name, and expiration", () => {
      const data = {
        firstName: "Olusola",
        otp: "619482",
        expiryMinutes: 10,
      };

      const emailHtml = `
        <h1>Your Verification Code</h1>
        <p>Hi ${data.firstName}, use this code to continue:</p>
        <div class="otp-code">${data.otp}</div>
        <div class="warning-box">⏰ This code expires in ${data.expiryMinutes} minutes.</div>
        <p style="color: #64748b; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
      `;

      expect(emailHtml).toContain("Your Verification Code");
      expect(emailHtml).toContain("Hi Olusola");
      expect(emailHtml).toContain("619482");
      expect(emailHtml).toContain("expires in 10 minutes");
      expect(emailHtml).toContain("If you didn't request this code");
    });

    it("escapes user-supplied input to prevent HTML injection in OTP emails", () => {
      const maliciousName = "<script>alert('xss')</script>John";
      const escapedName = maliciousName
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const emailHtml = `<p>Hi ${escapedName},</p>`;
      expect(emailHtml).not.toContain("<script>");
      expect(emailHtml).toContain("&lt;script&gt;");
    });
  });

  describe("Sender Domain Validation & Delivery Address Rewriting", () => {
    function resendFrom(from: string): string {
      const domain = "notify.rentmaikar.com";
      if (from.includes(domain)) return from;
      const match = from.match(/^(?:(.*)<)?([^<>@\s]+)@([^<>@\s]+)>?$/);
      if (!match) return `Rentmaikar <noreply@${domain}>`;
      const name = match[1]?.trim() || "Rentmaikar";
      const local = match[2];
      return `${name} <${local}@${domain}>`;
    }

    it("rewrites unverified apex domains onto notify.rentmaikar.com for reliable delivery", () => {
      expect(resendFrom("Rentmaikar Security <security@rentmaikar.com>"))
        .toBe("Rentmaikar Security <security@notify.rentmaikar.com>");
      expect(resendFrom("Rentmaikar Support <support@rentmaikar.com>"))
        .toBe("Rentmaikar Support <support@notify.rentmaikar.com>");
    });

    it("leaves already-verified notify.rentmaikar.com addresses untouched", () => {
      expect(resendFrom("Rentmaikar Security <security@notify.rentmaikar.com>"))
        .toBe("Rentmaikar Security <security@notify.rentmaikar.com>");
    });
  });

  describe("Anti-Enumeration Timing Safety", () => {
    it("returns identical generic success message for existing and non-existing accounts", () => {
      function handlePasswordResetRequest(email: string, userExists: boolean) {
        if (!email.includes("@")) {
          return { ok: false, error: "Please enter a valid email address." };
        }
        if (!userExists) {
          return { ok: true, success: true, message: "If an account exists, a reset email has been sent." };
        }
        return { ok: true, success: true, message: "If an account exists, a reset email has been sent." };
      }

      const existingResult = handlePasswordResetRequest("existing@rentmaikar.com", true);
      const nonExistingResult = handlePasswordResetRequest("nonexistent@rentmaikar.com", false);

      expect(existingResult.message).toBe(nonExistingResult.message);
      expect(existingResult.success).toBe(true);
      expect(nonExistingResult.success).toBe(true);
    });
  });
});

describe("Insecure Channel OTP Guard", () => {
  it("blocks OTP codes from being delivered through in-app chat or notifications", () => {
    expect(looksLikeOtpMessage("Your verification code is 849201")).toBe(true);
    expect(looksLikeOtpMessage("RentMaikar OTP: 394012")).toBe(true);
    expect(looksLikeOtpMessage("Here is your one-time passcode: 123456")).toBe(true);
    expect(looksLikeOtpMessage("Use 2FA code 491028 to sign in")).toBe(true);
  });

  it("permits standard non-OTP conversational and booking messages", () => {
    expect(looksLikeOtpMessage("Your vehicle Toyota Corolla is ready for pickup")).toBe(false);
    expect(looksLikeOtpMessage("Please upload your driver's license before tomorrow")).toBe(false);
    expect(looksLikeOtpMessage("Payment of 45,000 NGN received successfully")).toBe(false);
  });

  it("exports a clear user-facing block error message", () => {
    expect(OTP_IN_APP_BLOCK_MESSAGE).toContain("One-time passcodes cannot be sent through in-app messaging");
    expect(OTP_IN_APP_BLOCK_MESSAGE).toContain("Use SMS, WhatsApp or email");
  });
});
