// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ---- Mocks --------------------------------------------------------------

const authState: {
  user: any;
  session: any;
  twoFactorStatus: any;
  isLoading: boolean;
  userRole: any;
  isRoleLoading: boolean;
  twoFactorVerified: boolean;
} = {
  user: null,
  session: null,
  twoFactorStatus: null,
  isLoading: false,
  userRole: null,
  isRoleLoading: false,
  twoFactorVerified: false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain, eq: () => chain, in: () => chain, order: () => chain,
    limit: () => chain, maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    returns: () => chain,
    then: (r: any) => r({ data: [], error: null }),
  };
  return {
    supabase: {
      from: () => chain,
      auth: {
        getUser: async () => ({ data: { user: null } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

vi.mock("@/contexts/RegionContext", () => ({
  useRegion: () => ({ country: "USA", currency: "USD", region: "USA", setCountry: () => {}, setRegionMode: () => {}, regionMode: "manual" }),
  RegionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/contexts/UserTypeContext", () => ({
  useUserType: () => ({ userType: "driver", setUserType: () => {} }),
}));

vi.mock("@/components/layout/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/layout/Footer", () => ({ default: () => <footer data-testid="footer" /> }));

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { TestProviders } from "@/test/providers";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";

// ---- Helpers ------------------------------------------------------------

const setAuth = (patch: Partial<typeof authState>) => Object.assign(authState, patch);
const resetAuth = () =>
  setAuth({
    user: null,
    session: null,
    twoFactorStatus: null,
    isLoading: false,
    userRole: null,
    isRoleLoading: false,
    twoFactorVerified: false,
  });

const renderAt = (initial: string, ui: React.ReactNode) =>
  render(
    <TestProviders>
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/auth" element={<div>SIGN IN PAGE</div>} />
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/driver/dashboard" element={<div>DRIVER HOME</div>} />
        <Route path="/owner/dashboard" element={<div>OWNER HOME</div>} />
        {ui}
      </Routes>
    </MemoryRouter>
    </TestProviders>
  );

beforeEach(() => {
  cleanup();
  resetAuth();
});

// ---- Public route visibility -------------------------------------------

describe("public routes render without authentication", () => {
  it("/terms renders for signed-out users", () => {
    renderAt("/terms", <Route path="/terms" element={<Terms />} />);
    // Terms page has 'Acceptance of Terms' section heading in both USA/NG tabs.
    expect(screen.getByText(/Acceptance of Terms/i)).toBeTruthy();
  });

  it("/privacy renders for signed-out users", () => {
    renderAt("/privacy", <Route path="/privacy" element={<Privacy />} />);
    // Privacy pages contain the word 'Privacy' prominently.
    expect(screen.getAllByText(/Privacy/i).length).toBeGreaterThan(0);
  });
});

// ---- Protected route gating --------------------------------------------

describe("ProtectedRoute redirects unauthenticated users to /auth", () => {
  const protectedTargets = [
    "/admin",
    "/admin/audit-log",
    "/admin/payments",
    "/admin/reconciliation",
    "/admin/export-audit",
    "/admin/document-failures",
  ];

  for (const path of protectedTargets) {
    it(`redirects ${path} to /auth when signed out`, () => {
      renderAt(
        path,
        <Route
          path={path}
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <div>SHOULD NOT SEE</div>
            </ProtectedRoute>
          }
        />
      );
      expect(screen.getByText("SIGN IN PAGE")).toBeTruthy();
      expect(screen.queryByText("SHOULD NOT SEE")).toBeNull();
    });
  }
});

describe("ProtectedRoute allows the correct role and redirects wrong roles", () => {
  it("admin sees /admin/audit-log", () => {
    setAuth({
      user: { id: "u1" },
      session: { access_token: "t" },
      userRole: "admin",
      twoFactorVerified: true,
    });
    renderAt(
      "/admin/audit-log",
      <Route
        path="/admin/audit-log"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <div>AUDIT PAGE</div>
          </ProtectedRoute>
        }
      />
    );
    expect(screen.getByText("AUDIT PAGE")).toBeTruthy();
  });

  it("driver hitting admin route is redirected to their own dashboard, not stuck on /auth", () => {
    setAuth({
      user: { id: "u1" },
      session: { access_token: "t" },
      userRole: "driver",
      twoFactorVerified: true,
    });
    renderAt(
      "/admin/audit-log",
      <Route
        path="/admin/audit-log"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <div>SHOULD NOT SEE</div>
          </ProtectedRoute>
        }
      />
    );
    expect(screen.getByText("DRIVER HOME")).toBeTruthy();
    expect(screen.queryByText("SHOULD NOT SEE")).toBeNull();
  });

  it("session without 2FA verification is bounced to /auth", () => {
    setAuth({
      user: { id: "u1" },
      session: { access_token: "t" },
      twoFactorStatus: { requires_2fa: true },
      userRole: "admin",
      twoFactorVerified: false,
    });
    renderAt(
      "/admin",
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <div>SHOULD NOT SEE</div>
          </ProtectedRoute>
        }
      />
    );
    expect(screen.getByText("SIGN IN PAGE")).toBeTruthy();
  });
});
