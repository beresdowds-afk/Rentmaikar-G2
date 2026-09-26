import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ControlEvidencePlane } from "@/components/admin/control-plane/ControlEvidencePlane";
import {
  computeTabPermissionDrift,
  getDefaultTabForPortal,
  PORTAL_TABS,
} from "@/lib/admin-tab-registry";
import { controlPlaneTabs } from "@/components/admin/PortalNavigation";

// Mock supabase client to avoid external network calls during unit tests
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
        in: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "test-admin" } } }),
    },
  },
}));

describe("Control & Evidence Plane Architecture & Registry Tests", () => {
  it("has zero tab permission drift between PortalNavigation and TAB_PERMISSION_MAP", () => {
    const drift = computeTabPermissionDrift();
    expect(drift.unclassified).toEqual([]);
    expect(drift.orphanedMappings).toEqual([]);
  });

  it("registers all 8 required tabs in controlPlaneTabs", () => {
    const tabValues = controlPlaneTabs.map((t) => t.value);
    expect(tabValues).toEqual([
      "event-ledger",
      "decision-log",
      "audit-log",
      "evidence-store",
      "disputes",
      "appeals",
      "compliance",
      "reporting",
    ]);
  });

  it("sets event-ledger as the default tab for control-plane portal", () => {
    expect(getDefaultTabForPortal("control-plane")).toBe("event-ledger");
  });

  it("registers control-plane in PORTAL_TABS", () => {
    expect(PORTAL_TABS["control-plane"]).toBeDefined();
    expect(PORTAL_TABS["control-plane"].length).toBe(8);
  });

  const allTabs = [
    "event-ledger",
    "decision-log",
    "audit-log",
    "evidence-store",
    "disputes",
    "appeals",
    "compliance",
    "reporting",
  ];

  allTabs.forEach((tab) => {
    it(`renders ControlEvidencePlane with activeTab='${tab}' without crashing`, () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
        },
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/admin?portal=control-plane&tab=${tab}`]}>
            <ControlEvidencePlane activeTab={tab} scope="admin" />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(container).toBeDefined();
      expect(screen.getByText(/CONTROL & EVIDENCE PLANE/i)).toBeInTheDocument();
    });
  });
});
