/**
 * Regression tests for duplicate sign-up -> sign-in routing.
 *
 * Covers:
 *  1. Server-side precheck (`email_signup_status` RPC) reporting a registered
 *     email: sign-up must abort BEFORE calling supabase.auth.signUp.
 *  2. Explicit "already registered" error returned by Supabase.
 *  3. The HIDDEN duplicate case: Supabase returns a user object with an EMPTY
 *     `identities` array when email confirmation is on.
 *  4. Fresh emails still sign up normally.
 *  5. Precheck failures are non-fatal (fall through to Supabase handling).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------- mocks ----
const rpc = vi.fn();
const authSignUp = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signUp: (...args: unknown[]) => authSignUp(...args),
    },
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

const assignRole = vi.fn(async () => {});
vi.mock("@/lib/user-provisioning", () => ({
  assignRole: (...args: unknown[]) => assignRole.apply(null, args as []),

}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// A tiny harness that calls signUp and renders the outcome.
const Harness = ({ email }: { email: string }) => {
  const { signUp } = useAuth();
  const [result, setResult] = React.useState<string>("");

  return (
    <div>
      <button
        onClick={async () => {
          const r = await signUp(email, "S3cur3-pass!", "Test User", "driver");
          setResult(
            JSON.stringify({ exists: Boolean(r.emailExists), message: r.error?.message ?? null })
          );
        }}
      >
        submit
      </button>
      <output data-testid="result">{result}</output>
    </div>
  );
};

const renderAndSubmit = async (email = "taken@example.com") => {
  render(
    <AuthProvider>
      <Harness email={email} />
    </AuthProvider>
  );
  await userEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() => expect(screen.getByTestId("result").textContent).not.toBe(""));
  return JSON.parse(screen.getByTestId("result").textContent as string) as {
    exists: boolean;
    message: string | null;
  };
};

const mockRpc = (statusResponse: unknown) => {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "email_signup_status") return { data: statusResponse, error: null };
    return { data: null, error: null }; // log_auth_event and friends
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------- tests ----
describe("duplicate sign-up routing", () => {
  it("aborts before calling auth.signUp when the server says the email is registered", async () => {
    mockRpc({ registered: true, rate_limited: false });

    const result = await renderAndSubmit();

    expect(result.exists).toBe(true);
    expect(result.message).toMatch(/already registered/i);
    expect(authSignUp).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("email_signup_status", { _email: "taken@example.com" });
  });

  it("normalizes the email before the server check", async () => {
    mockRpc({ registered: true, rate_limited: false });

    await renderAndSubmit("  Mixed.Case@Example.COM ");

    expect(rpc).toHaveBeenCalledWith("email_signup_status", { _email: "mixed.case@example.com" });
  });

  it("routes to sign-in when Supabase returns an explicit duplicate error", async () => {
    mockRpc({ registered: false, rate_limited: false });
    authSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });

    const result = await renderAndSubmit();

    expect(authSignUp).toHaveBeenCalled();
    expect(result.exists).toBe(true);
    expect(result.message).toMatch(/already registered/i);
  });

  it("detects the HIDDEN duplicate: user returned with an empty identities array", async () => {
    mockRpc({ registered: false, rate_limited: false });
    authSignUp.mockResolvedValue({
      data: { user: { id: "user-1", email: "taken@example.com", identities: [] }, session: null },
      error: null,
    });

    const result = await renderAndSubmit();

    expect(result.exists).toBe(true);
    expect(result.message).toMatch(/already registered/i);
    // Must NOT provision a role for an account we did not create.
    expect(assignRole).not.toHaveBeenCalled();
  });

  it("completes a normal sign-up for a fresh email", async () => {
    mockRpc({ registered: false, rate_limited: false });
    authSignUp.mockResolvedValue({
      data: {
        user: { id: "user-2", email: "fresh@example.com", identities: [{ id: "i-1" }] },
        session: null,
      },
      error: null,
    });

    const result = await renderAndSubmit("fresh@example.com");

    expect(result.exists).toBe(false);
    expect(result.message).toBeNull();
    expect(assignRole).toHaveBeenCalledWith("user-2", "driver", "fresh@example.com");
  });

  it("falls through to Supabase handling when the precheck is unavailable", async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "email_signup_status") throw new Error("network down");
      return { data: null, error: null };
    });
    authSignUp.mockResolvedValue({
      data: { user: { id: "user-3", email: "taken@example.com", identities: [] }, session: null },
      error: null,
    });

    const result = await renderAndSubmit();

    expect(authSignUp).toHaveBeenCalled();
    expect(result.exists).toBe(true);
  });

  it("does not block sign-up when the precheck is rate limited", async () => {
    mockRpc({ registered: false, rate_limited: true });
    authSignUp.mockResolvedValue({
      data: {
        user: { id: "user-4", email: "fresh2@example.com", identities: [{ id: "i-2" }] },
        session: null,
      },
      error: null,
    });

    const result = await renderAndSubmit("fresh2@example.com");

    expect(authSignUp).toHaveBeenCalled();
    expect(result.exists).toBe(false);
  });
});
