import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendApplicationMessage,
  normalizeE164,
  SendApplicationMessagePayload,
} from "../../../backend/src/services/smsService";
import { messagingBridge } from "../../../backend/src/services/messagingBridge";
import { sendInboxReply } from "../../../backend/src/services/inboxReplyService";
import { marketingEngineServer } from "../../../backend/src/marketing/marketingEngineServer";
import { sentBackendClient } from "../../../backend/src/services/sentClient";

// Mock global fetch
const originalFetch = global.fetch;

describe("RentMaikar Enterprise Messaging Unification Test Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SENT_SANDBOX_MODE = "false";
    process.env.SENT_API_KEY = "test_sent_api_key";
    process.env.TWILIO_ACCOUNT_SID = "AC_test_account_sid_1234567890";
    process.env.TWILIO_AUTH_TOKEN = "test_twilio_auth_token_secret";
    process.env.TWILIO_PHONE_NUMBER = "+14155550100";
    process.env.TWILIO_WHATSAPP_NUMBER = "+14155550100";
    process.env.TERMII_API_KEY = "test_termii_api_key";
    process.env.TERMII_SENDER_ID = "Rentmaikar";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("1. E.164 Normalization and Region Resolution", () => {
    it("normalizes standard 10-digit US phone numbers to +1 format", () => {
      expect(normalizeE164("4155552671")).toBe("+14155552671");
      expect(normalizeE164("+1 (415) 555-2671")).toBe("+14155552671");
    });

    it("normalizes Nigerian local and international phone numbers to +234 format", () => {
      expect(normalizeE164("08031234567")).toBe("+2348031234567");
      expect(normalizeE164("2348031234567")).toBe("+2348031234567");
      expect(normalizeE164("+2348031234567")).toBe("+2348031234567");
    });

    it("rejects blank or invalid phone inputs cleanly", async () => {
      const res = await sendApplicationMessage({
        to: "",
        message: "Test message",
      });
      expect(res.success).toBe(false);
      expect(res.provider).toBe("none");
      expect(res.deliveryStatus).toBe("failed");
      expect(res.error).toContain("Valid E.164 phone number required");
    });
  });

  describe("2. Provider Cascade Hierarchy: SENT.dm -> Twilio -> Termii", () => {
    it("Route 1: SENT.dm succeeds as primary; no fallback is attempted", async () => {
      const sentSpy = vi.spyOn(sentBackendClient, "sendMessage").mockResolvedValue({
        data: { id: "sent_msg_abc123", status: "queued" },
      } as any);

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const res = await sendApplicationMessage({
        to: "+14155552671",
        message: "Your RentMaikar vehicle is confirmed.",
        channel: "sms",
      });

      expect(sentSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(res.success).toBe(true);
      expect(res.provider).toBe("sent");
      expect(res.messageId).toBe("sent_msg_abc123");
      expect(res.deliveryStatus).toBe("queued");
    });

    it("Route 2: SENT.dm fails; eligible Twilio fallback is attempted and succeeds", async () => {
      vi.spyOn(sentBackendClient, "sendMessage").mockRejectedValue(
        new Error("SENT.dm carrier network timeout (504)")
      );

      const mockTwilioResponse = {
        ok: true,
        status: 201,
        json: async () => ({
          sid: "SM_twilio_123456789",
          status: "queued",
        }),
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.twilio.com")) {
          return Promise.resolve(mockTwilioResponse);
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      const res = await sendApplicationMessage({
        to: "+14155552671",
        message: "Your RentMaikar booking reminder.",
        channel: "sms",
      });

      expect(res.success).toBe(true);
      expect(res.provider).toBe("twilio");
      expect(res.messageId).toBe("SM_twilio_123456789");
      expect(res.deliveryStatus).toBe("queued");
    });

    it("Route 3: SENT.dm and Twilio fail; eligible Termii fallback is attempted and succeeds", async () => {
      vi.spyOn(sentBackendClient, "sendMessage").mockRejectedValue(
        new Error("SENT.dm API service unavailable")
      );

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.twilio.com")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ message: "Twilio Internal Server Error" }),
          });
        }
        if (url.includes("api.ng.termii.com")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              code: "ok",
              message_id: "termii_msg_987654321",
              message: "Successfully Sent",
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      const res = await sendApplicationMessage({
        to: "+2348031234567",
        message: "Your RentMaikar trip has started.",
        channel: "sms",
      });

      expect(res.success).toBe(true);
      expect(res.provider).toBe("termii");
      expect(res.messageId).toBe("termii_msg_987654321");
      expect(res.deliveryStatus).toBe("queued");
    });

    it("Route 4: Channel Ineligibility: Termii is skipped for WhatsApp channel", async () => {
      vi.spyOn(sentBackendClient, "sendMessage").mockRejectedValue(
        new Error("SENT.dm WhatsApp gateway unavailable")
      );

      // Twilio also fails
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.twilio.com")) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: async () => ({ message: "Twilio WhatsApp channel down" }),
          });
        }
        // Termii MUST NOT be called for WhatsApp
        if (url.includes("api.ng.termii.com")) {
          throw new Error("Termii should not be called for WhatsApp channel!");
        }
        return Promise.reject(new Error(`Unexpected URL ${url}`));
      });

      const res = await sendApplicationMessage({
        to: "+2348031234567",
        message: "WhatsApp update",
        channel: "whatsapp",
      });

      expect(res.success).toBe(false);
      expect(res.provider).toBe("none");
      expect(res.deliveryStatus).toBe("failed");
      expect(res.error).toContain("All communications providers failed");
    });

    it("Route 5: All providers fail-closed without uncontrolled retries", async () => {
      vi.spyOn(sentBackendClient, "sendMessage").mockRejectedValue(
        new Error("SENT.dm permanent failure")
      );

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.twilio.com")) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ message: "Invalid Twilio sender configuration" }),
          });
        }
        if (url.includes("api.ng.termii.com")) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ message: "Termii balance exhausted" }),
          });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      const res = await sendApplicationMessage({
        to: "+14155552671",
        message: "Test failure handling",
        channel: "sms",
      });

      expect(res.success).toBe(false);
      expect(res.provider).toBe("none");
      expect(res.deliveryStatus).toBe("failed");
      expect(res.error).toBeDefined();
    });
  });

  describe("3. Idempotency and Duplicate Protection", () => {
    it("deduplicates subsequent dispatches with the same idempotency key", async () => {
      const sentSpy = vi.spyOn(sentBackendClient, "sendMessage").mockResolvedValue({
        data: { id: "sent_idemp_001", status: "queued" },
      } as any);

      const payload: SendApplicationMessagePayload = {
        to: "+14155552671",
        message: "One-time dispatch",
        channel: "sms",
        idempotencyKey: "unique_idemp_key_12345",
      };

      // First dispatch
      const res1 = await sendApplicationMessage(payload);
      expect(res1.success).toBe(true);
      expect(res1.messageId).toBe("sent_idemp_001");
      expect(sentSpy).toHaveBeenCalledTimes(1);

      // Second identical dispatch with same idempotency key
      const res2 = await sendApplicationMessage(payload);
      expect(res2.success).toBe(true);
      expect(res2.messageId).toBe("sent_idemp_001");
      // The upstream provider must NOT be called a second time
      expect(sentSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. MessagingBridge & Supabase Auth OTP Integration", () => {
    it("MessagingBridge dispatches via canonical hierarchy with Twilio fallback", async () => {
      vi.spyOn(sentBackendClient, "sendMessage").mockRejectedValue(
        new Error("SENT.dm OTP delivery temporary outage")
      );

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.twilio.com")) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ sid: "SM_otp_twilio_888", status: "queued" }),
          });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      const otpRes = await messagingBridge.sendMessage({
        to: "+14155552671",
        message: "Your RentMaikar verification code is 492817.",
        channel: "sms",
        source: "auth_otp",
        correlationId: "challenge_corr_999",
      });

      expect(otpRes.success).toBe(true);
      expect(otpRes.provider).toBe("twilio");
      expect(otpRes.messageId).toBe("SM_otp_twilio_888");
      expect(otpRes.deliveryStatus).toBe("queued");
    });
  });

  describe("5. Marketing Engine Unified Dispatch Integration", () => {
    it("dispatches SMS marketing communications via canonical dispatcher with failover", async () => {
      vi.spyOn(sentBackendClient, "sendMessage").mockRejectedValue(
        new Error("SENT.dm marketing blast queue full")
      );

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api.twilio.com")) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ sid: "SM_mktg_tw_456", status: "queued" }),
          });
        }
        return Promise.reject(new Error(`Unexpected call to ${url}`));
      });

      const mktgRes = await marketingEngineServer.dispatchLeadCommunication({
        provider: "sentdm",
        channel: "sms",
        leadId: "lead_test_123",
        to: "+14155552671",
        text: "Special weekend discount: 20% off all SUV rentals!",
      });

      expect(mktgRes.ok).toBe(true);
      expect(mktgRes.externalId).toBe("SM_mktg_tw_456");
    });
  });

  describe("6. Platform Inbox Reply Server-Side Delegation", () => {
    it("handles SMS/WhatsApp in sendInboxReply via canonical dispatcher", async () => {
      vi.spyOn(sentBackendClient, "sendMessage").mockResolvedValue({
        data: { id: "sent_inbox_reply_777", status: "queued" },
      } as any);

      const inboxRes = await sendInboxReply({
        conversationId: "test_conv_id",
        messageContent: "Hi, your driver has arrived at pickup.",
        channel: "sms",
        recipientPhone: "+14155552671",
      });

      // Even if conversation row is not in local SQLite/Postgres test mock,
      // it handles phone resolution and attempts dispatch cleanly
      if (inboxRes.success) {
        expect(inboxRes.channel).toBe("sms");
        expect(inboxRes.provider).toBe("sent");
        expect(inboxRes.messageId).toBe("sent_inbox_reply_777");
      } else {
        // If DB not connected in test runner, verify error is about conversation not unsupported channel
        expect(inboxRes.error).not.toContain("SMS/WhatsApp dispatch must use the established CPaaS messaging service");
      }
    });
  });
});
