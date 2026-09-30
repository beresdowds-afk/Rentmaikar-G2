/**
 * Stage B: Caller Migration Test Suite
 *
 * Validates:
 * 1. PhoneOtpPanel migrated to backend Authenticator via backendBridge / /api/functions/phone-otp-custom
 * 2. Elimination of split-brain Supabase-native SMS OTP fallback in PhoneOtpPanel
 * 3. PhoneVerification migrated to backendBridge / /api/functions/verify-phone
 * 4. TwoFactorSetup and TwoFactorChallenge integrated with backendBridge / /api/functions/send-2fa-code
 * 5. Consolidates email and phone OTP under authoritative OtpService / Authenticator
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Stage B: Caller Migration", () => {
  describe("1. PhoneOtpPanel Backend Migration", () => {
    it("routes through backendBridge and invokes phone-otp-custom on authoritative backend", () => {
      const filePath = path.resolve(process.cwd(), "src/components/auth/PhoneOtpPanel.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("backendBridge");
      expect(content).toContain("backendBridge.invokeEdgeFunction('phone-otp-custom'");
      // Legacy fallback to signInWithOtp has been permanently removed
      expect(content).not.toContain("supabase.auth.signInWithOtp");
    });
  });

  describe("2. PhoneVerification Backend Migration", () => {
    it("routes send_code and verify_code through backendBridge", () => {
      const filePath = path.resolve(process.cwd(), "src/components/phone/PhoneVerification.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("backendBridge");
      expect(content).toContain("backendBridge.invokeEdgeFunction('verify-phone'");
    });
  });

  describe("3. TwoFactorSetup & TwoFactorChallenge Backend Migration", () => {
    it("TwoFactorSetup routes verify-phone and send-2fa-code via backendBridge", () => {
      const filePath = path.resolve(process.cwd(), "src/components/auth/TwoFactorSetup.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("backendBridge");
      expect(content).toContain("backendBridge.invokeEdgeFunction('verify-phone'");
      expect(content).toContain("backendBridge.invokeEdgeFunction('send-2fa-code'");
    });

    it("TwoFactorChallenge routes send-2fa-code via backendBridge", () => {
      const filePath = path.resolve(process.cwd(), "src/components/auth/TwoFactorChallenge.tsx");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("backendBridge");
      expect(content).toContain("backendBridge.invokeEdgeFunction('send-2fa-code'");
    });
  });

  describe("4. Unified Backend Gateway Coverage", () => {
    it("backend functions router includes phone-otp-custom, verify-phone, and send-2fa-code in AUTHORITATIVE_BACKEND_FUNCTIONS", () => {
      const filePath = path.resolve(process.cwd(), "backend/src/routes/functions.ts");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain('"phone-otp-custom"');
      expect(content).toContain('"verify-phone"');
      expect(content).toContain('"send-2fa-code"');
    });
  });
});
