import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmailVerification } from "@/components/auth/EmailVerification";
import { EmailProviderHealthCard } from "@/components/admin/EmailProviderHealthCard";

const { invokeMock, getUserMock, resendAuthMock, bridgeInvokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getUserMock: vi.fn(),
  resendAuthMock: vi.fn(),
  bridgeInvokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
      resend: resendAuthMock,
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "driver@rentmaikar.com" },
  }),
}));

vi.mock("@/lib/backend-bridge", () => ({
  backendBridge: {
    invokeEdgeFunction: bridgeInvokeMock,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Email Architecture Frontend Remediation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
    resendAuthMock.mockResolvedValue({ error: null });
  });

  it("EmailVerification routes exclusively through send-verification-email and never falls back to supabase.auth.resend", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: false, error: "Resend gateway failure" },
      error: null,
    });

    render(<EmailVerification email="driver@rentmaikar.com" showAsCard={false} />);

    const btn = screen.getByRole("button", { name: /resend email/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "send-verification-email",
        expect.objectContaining({
          body: expect.objectContaining({ email: "driver@rentmaikar.com" }),
        }),
      );
    });

    expect(resendAuthMock).not.toHaveBeenCalled();
  });

  it("EmailProviderHealthCard invokes backendBridge email-health and renders Resend without SMTP labels", async () => {
    bridgeInvokeMock.mockResolvedValue({
      data: {
        ok: true,
        provider: "resend",
        status: "ok",
        message: "Resend API connected",
        detail: "Domain notify.rentmaikar.com verified",
        latency_ms: 42,
        domain: "notify.rentmaikar.com",
        domainVerified: true,
        apiKeyConfigured: true,
        webhookConfigured: true,
        recentLogsCount: 12,
        lastSentAt: new Date().toISOString(),
        lastError: null,
        checkedAt: new Date().toISOString(),
      },
      error: null,
    });

    render(<EmailProviderHealthCard />);

    await waitFor(() => {
      expect(bridgeInvokeMock).toHaveBeenCalledWith("email-health", undefined, expect.anything());
    });

    await waitFor(() => {
      expect(screen.getByText(/Email Delivery Provider \(Resend\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Connected & Verified/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/SMTP/i)).not.toBeInTheDocument();
  });
});
