import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import type { RegistrationProgress } from "@/hooks/useRegistrationProgress";

// -----------------------------------------------------------------------------
// Supabase mock
// -----------------------------------------------------------------------------
vi.mock("@/integrations/supabase/client", () => {
  const realtimeChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "user-1",
              email: "test@example.com",
            },
          },
          error: null,
        })),

        getSession: vi.fn(async () => ({
          data: {
            session: null,
          },
          error: null,
        })),

        onAuthStateChange: vi.fn(() => ({
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        })),
      },

      channel: vi.fn(() => realtimeChannel),
      removeChannel: vi.fn(),
      removeAllChannels: vi.fn(),
    },
  };
});

// -----------------------------------------------------------------------------
// Auth mock
// -----------------------------------------------------------------------------
vi.mock("@/contexts/AuthContext", () => {
  const React = require("react");

  const value = {
    user: {
      id: "user-1",
      email: "test@example.com",
    },
    session: null,
    profile: null,
    isLoading: false,
    isRoleLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  };

  return {
    AuthProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <>{children}</>,

    useAuth: () => value,
  };
});

// -----------------------------------------------------------------------------
// Registration Progress
// -----------------------------------------------------------------------------
const progressMock = vi.fn();

vi.mock("@/hooks/useRegistrationProgress", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useRegistrationProgress")
  >("@/hooks/useRegistrationProgress");

  return {
    ...actual,
    useRegistrationProgress: () => progressMock(),
  };
});

// -----------------------------------------------------------------------------
// Layout
// -----------------------------------------------------------------------------
vi.mock("@/components/layout/Header", () => ({
  default: () => <div />,
}));

vi.mock("@/components/layout/Footer", () => ({
  default: () => <div />,
}));

import { PortalRouteGuard } from "./PortalRouteGuard";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------
const progress = (
  over: Partial<RegistrationProgress> = {}
): RegistrationProgress => ({
  authenticated: true,
  stage: "auth",
  access_level: "view_only",
  role: "driver",
  email_verified: false,
  identity_verification_status: null,
  identity_verified_at: null,
  documents_uploaded: 0,
  referees_verified: 0,
  application_status: null,
  ...over,
});

function renderRoute(
  url: string,
  role: "driver" | "owner"
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path={`/${role}/portal/:portalKey`}
            element={<PortalRouteGuard role={role} />}
          />

          <Route
            path={`/${role}/dashboard`}
            element={<div>DASH</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------
describe("PortalRouteGuard", () => {
  beforeEach(() => {
    progressMock.mockReset();
  });

  it("shows the PortalGate blocker for a locked portal on direct URL load", () => {
    progressMock.mockReturnValue({
      data: progress({
        stage: "account_opened",
        email_verified: true,
      }),
      isLoading: false,
    });

    renderRoute(
      "/driver/portal/payments",
      "driver"
    );

    expect(
      screen.getByTestId("portal-gate-blocker")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("DASH")
    ).not.toBeInTheDocument();
  });

  it("redirects to the dashboard when the gate passes", () => {
    progressMock.mockReturnValue({
      data: progress({
        stage: "approved",
        access_level: "full",
        email_verified: true,
      }),
      isLoading: false,
    });

    renderRoute(
      "/owner/portal/vehicles",
      "owner"
    );

    expect(
      screen.getByText("DASH")
    ).toBeInTheDocument();
  });

  it("redirects unknown portal keys to the dashboard", () => {
    progressMock.mockReturnValue({
      data: progress(),
      isLoading: false,
    });

    renderRoute(
      "/driver/portal/does-not-exist",
      "driver"
    );

    expect(
      screen.getByText("DASH")
    ).toBeInTheDocument();
  });
});
