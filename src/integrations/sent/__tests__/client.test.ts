import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { SentClient } from "@/integrations/sent/client";

describe("SentClient message dispatch", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("uses the central sender without selecting a provider", async () => {
    invoke.mockResolvedValue({
      data: { success: true, messageId: "message-1", provider: "sent" },
      error: null,
    });

    const response = await new SentClient().sendMessage({
      to: ["+15551234567"],
      channel: "sms",
      text: "Test message",
    });

    expect(invoke).toHaveBeenCalledWith(
      "send-sms-notification",
      expect.objectContaining({
        body: expect.not.objectContaining({ providerOverride: expect.anything() }),
      }),
    );
    expect(response).toMatchObject({ id: "message-1", status: "sent", sandbox: false });
  });

  it("propagates provider failures instead of returning simulated success", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("provider failure") });

    await expect(
      new SentClient().sendMessage({
        to: ["+15551234567"],
        channel: "sms",
        text: "Test message",
      }),
    ).rejects.toThrow("SENT.dm message dispatch failed");
  });

  it("rejects sandbox responses as external deliveries", async () => {
    invoke.mockResolvedValue({
      data: { success: true, messageId: "sandbox-1", sandbox: true },
      error: null,
    });

    await expect(
      new SentClient().sendMessage({
        to: ["+15551234567"],
        channel: "sms",
        text: "Test message",
      }),
    ).rejects.toThrow("Sandbox dispatch did not send an external message");
  });
});
