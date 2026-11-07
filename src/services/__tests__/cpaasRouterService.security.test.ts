import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { CPaaSRouterService } from "@/services/cpaasRouterService";

describe("CPaaS SMS dispatch security", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it.each(["twilio", "termii"] as const)(
    "ignores a client-selected %s provider and leaves fallback routing to the server",
    async (providerOverride) => {
      invoke.mockResolvedValue({
        data: {
          success: true,
          provider: "twilio",
          messageId: "provider-message-1",
        },
        error: null,
      });

      const result = await new CPaaSRouterService().sendMessage({
        to: "+15551234567",
        message: "Account notification",
        providerOverride,
      });

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith(
        "send-sms-notification",
        expect.objectContaining({
          body: expect.not.objectContaining({ providerOverride }),
        }),
      );
      expect(result).toMatchObject({
        success: true,
        provider: "twilio",
        messageId: "provider-message-1",
        status: "accepted",
      });
    },
  );

  it("does not report sandbox dispatch as an external message", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        provider: "sent",
        messageId: "sandbox-message-1",
        sandbox: true,
      },
      error: null,
    });

    const result = await new CPaaSRouterService().sendMessage({
      to: "+15551234567",
      message: "Test notification",
    });

    expect(result).toMatchObject({
      success: false,
      status: "sandbox",
      error: "Sandbox dispatch did not send an external message",
    });
  });

  it("does not retry a failed canonical dispatch from the client", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("provider failure") });

    const result = await new CPaaSRouterService().sendMessage({
      to: "+15551234567",
      message: "Account notification",
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: false, status: "failed" });
    expect(result.error).toBe("Message dispatch failed");
  });
});
