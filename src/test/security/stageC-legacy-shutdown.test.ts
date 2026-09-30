/**
 * Stage C: Legacy Edge Function Decommissioning & Shutdown Test Suite
 *
 * Validates:
 * 1. Legacy edge function phone-otp-custom is decommissioned with HTTP 410 redirect response
 * 2. Legacy edge function verify-phone is decommissioned with HTTP 410 redirect response
 * 3. Legacy edge function send-2fa-code is decommissioned with HTTP 410 redirect response
 * 4. Zero un-keyed SHA-256 or hardcoded gateway URLs in legacy edge functions
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Stage C: Legacy Shutdown", () => {
  describe("1. Decommissioning of phone-otp-custom", () => {
    it("marks phone-otp-custom as DECOMMISSIONED and returns status 410", () => {
      const filePath = path.resolve(process.cwd(), "supabase/functions/phone-otp-custom/index.ts");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("STATUS: DECOMMISSIONED");
      expect(content).toContain("status: 410");
      expect(content).toContain("migratedTo: \"/api/functions/phone-otp-custom\"");
      // No legacy gateway URL or unkeyed SHA-256
      expect(content).not.toContain("connector-gateway.lovable.dev");
      expect(content).not.toContain("async function sha256");
    });
  });

  describe("2. Decommissioning of verify-phone", () => {
    it("marks verify-phone as DECOMMISSIONED and returns status 410", () => {
      const filePath = path.resolve(process.cwd(), "supabase/functions/verify-phone/index.ts");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("STATUS: DECOMMISSIONED");
      expect(content).toContain("status: 410");
      expect(content).toContain("migratedTo: \"/api/functions/verify-phone\"");
      // Twilio direct voice call logic removed
      expect(content).not.toContain("placeVoiceCall");
    });
  });

  describe("3. Decommissioning of send-2fa-code", () => {
    it("marks send-2fa-code as DECOMMISSIONED and returns status 410", () => {
      const filePath = path.resolve(process.cwd(), "supabase/functions/send-2fa-code/index.ts");
      const content = fs.readFileSync(filePath, "utf8");

      expect(content).toContain("STATUS: DECOMMISSIONED");
      expect(content).toContain("status: 410");
      expect(content).toContain("migratedTo: \"/api/functions/send-2fa-code\"");
    });
  });
});
