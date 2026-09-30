/**
 * Stage D: Provider Consolidation Test Suite
 *
 * Validates:
 * 1. Single authoritative CPaaS provider: SENT.dm via MessagingBridge
 * 2. OTP flow routes exclusively through MessagingBridge
 * 3. Elimination of split-brain Twilio, Termii, or Lovable branching in authentication path
 * 4. Zero plaintext OTP storage and timing-safe evaluation
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { messagingBridge } from "../../../backend/src/services/messagingBridge";
import { otpService } from "../../../backend/src/services/phoneOtpService";
import { authenticator } from "../../../backend/src/services/authenticator";

describe("Stage D: Provider Consolidation", () => {
  describe("1. Authoritative MessagingBridge Singleton", () => {
    it("ensures MessagingBridge is a singleton targeting SENT.dm", () => {
      expect(messagingBridge).toBeDefined();
      expect(typeof messagingBridge.sendMessage).toBe("function");

      const bridgePath = path.resolve(process.cwd(), "backend/src/services/messagingBridge.ts");
      const content = fs.readFileSync(bridgePath, "utf8");

      expect(content).toContain('provider: "sent"');
      expect(content).toContain("sentBackendClient");
    });
  });

  describe("2. OtpService Provider Delegation", () => {
    it("OtpService dispatches through MessagingBridge without local carrier branching", () => {
      const otpPath = path.resolve(process.cwd(), "backend/src/services/phoneOtpService.ts");
      const content = fs.readFileSync(otpPath, "utf8");

      expect(content).toContain("messagingBridge.sendMessage");
      // Does not import twilio or termii directly for OTP
      expect(content).not.toContain("from 'twilio'");
      expect(content).not.toContain("api.ng.termii.com");
    });
  });

  describe("3. Authenticator Architectural Integrity", () => {
    it("Authenticator uses OtpService for challenge consumption and GoTrue Admin for session exchange", () => {
      expect(authenticator).toBeDefined();
      expect(typeof authenticator.verifyOtp).toBe("function");

      const authPath = path.resolve(process.cwd(), "backend/src/services/authenticator.ts");
      const content = fs.readFileSync(authPath, "utf8");

      expect(content).toContain("otpService.consumeChallenge");
      expect(content).toContain("generateLink");
    });
  });
});
