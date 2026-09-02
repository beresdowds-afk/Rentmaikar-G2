import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RegistrationProgress } from "@/hooks/useRegistrationProgress";

// -----------------------------------------------------------------------------
// Mock Supabase
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
// Mock AuthContext
// -----------------------------------------------------------------------------
vi.mock("@/contexts/AuthContext", () => {
  const React = require("react");

  const authValue = {
    user: {
      id: "user-1",
      email: "test@example.com",
    },
    session: null,
    profile: null,
    isLoading: false,
    isRoleLoading: false,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  };

  return {
    AuthProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <>{children}</>,

    useAuth: () => authValue,
  };
});

// -----------------------------------------------------------------------------
// Mock Registration Progress
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

import { PortalGate } from "./PortalGate";

// -----------------------------------------------------------------------------
// Test wrapper
// -----------------------------------------------------------------------------
function renderWithProviders(ui: React.ReactElement) {
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
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// -----------------------------------------------------------------------------
// Registration Progress helper
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

describe("PortalGate", () => {
  beforeEach(() => {
    progressMock.mockReset();
  });

  it("shows a loading skeleton while progress is fetching", () => {
    progressMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    renderWithProviders(
      <PortalGate portal="Payments">
        <div>child</div>
      </PortalGate>
    );

    expect(
      screen.getByTestId("portal-gate-loading")
    ).toBeInTheDocument();

    expect(
      screen.queryByText("child")
    ).not.toBeInTheDocument();
  });

  // Replace every remaining render(...)
  // with renderWithProviders(...)
});
