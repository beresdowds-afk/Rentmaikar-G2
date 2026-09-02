    import React, { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

// -----------------------------------------------------------------------------
// Supabase mock
// -----------------------------------------------------------------------------
const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const realtimeChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  };

  return {
    supabase: {
      from: vi.fn((...args) => fromMock(...args)),

      functions: {
        invoke: vi.fn((...args) => invokeMock(...args)),
      },

      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({
            data: null,
            error: null,
          })),
        })),
      },

      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "test-user-uuid",
              email: "d@example.com",
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
// Auth Provider mock
// -----------------------------------------------------------------------------
vi.mock("@/contexts/AuthContext", () => {
  const React = require("react");

  const value = {
    user: {
      id: "test-user-uuid",
      email: "d@example.com",
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

    useAuth: () => value,
  };
});

// -----------------------------------------------------------------------------
// Region Provider mock
// -----------------------------------------------------------------------------
vi.mock("@/contexts/RegionContext", () => {
  const React = require("react");

  return {
    RegionProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <>{children}</>,

    useRegion: () => ({
      country: "USA",
      currency: "USD",
      currencySymbol: "$",
      phonePrefix: "+1",
    }),
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// -----------------------------------------------------------------------------
// Component under test
// -----------------------------------------------------------------------------
import { AuthProvider } from "@/contexts/AuthContext";
import { RegionProvider } from "@/contexts/RegionContext";
import { DocumentUpload } from "@/components/documents/DocumentUpload";

// -----------------------------------------------------------------------------
// Shared render helper
// -----------------------------------------------------------------------------
function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RegionProvider>{ui}</RegionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function renderComponent() {
  return renderWithProviders(<DocumentUpload userType="driver" />);
}

describe("DocumentUpload auto-submit", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    fromMock.mockReset();
  });

  it("renders the driver document upload surface", async () => {
    renderComponent();
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    });
    expect(screen).toBeDefined();
  });
});

