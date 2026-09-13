import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegionProvider } from "@/contexts/RegionContext";
import { BackendBridgeProvider } from "@/contexts/BackendBridgeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminAssistantDashboard from "@/pages/AdminAssistantDashboard";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1", email: "admin@rentmaikar.com" } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: vi.fn().mockImplementation((fn) => Promise.resolve(fn({ data: [], error: null }))),
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      }),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "admin-1", email: "admin@rentmaikar.com" },
    profile: { role: "admin" },
    isAdmin: true,
    isAssistant: false,
    session: {},
    isLoading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe("AdminDashboard Docs Portal integration test", () => {
  const tabs = [
    "service-disruption-docs",
    "platform-features",
    "glossary",
    "messaging-docs",
    "email-docs",
    "voip-docs",
  ];

  for (const tab of tabs) {
    it(`renders AdminDashboard with portal=docs&tab=${tab} without crashing`, () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <RegionProvider>
            <BackendBridgeProvider>
              <TooltipProvider>
                <MemoryRouter initialEntries={[`/admin?portal=docs&tab=${tab}`]}>
                  <AdminDashboard />
                </MemoryRouter>
              </TooltipProvider>
            </BackendBridgeProvider>
          </RegionProvider>
        </QueryClientProvider>
      );
      
      const errorBoundaryText = container.textContent;
      expect(errorBoundaryText).not.toContain("DOCS Section Temporarily Unavailable");
      consoleErrorSpy.mockRestore();
    });

    it(`renders AdminAssistantDashboard with portal=docs&tab=${tab} without crashing`, () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <RegionProvider>
            <BackendBridgeProvider>
              <TooltipProvider>
                <MemoryRouter initialEntries={[`/admin-assistant?portal=docs&tab=${tab}`]}>
                  <AdminAssistantDashboard />
                </MemoryRouter>
              </TooltipProvider>
            </BackendBridgeProvider>
          </RegionProvider>
        </QueryClientProvider>
      );
      
      const errorBoundaryText = container.textContent;
      expect(errorBoundaryText).not.toContain("DOCS Section Temporarily Unavailable");
      consoleErrorSpy.mockRestore();
    });
  }
});
