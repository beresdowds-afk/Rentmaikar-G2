// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DynamicMetaTagManager, { getRouteMetadata, SITE_URL } from "../DynamicMetaTagManager";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "veh-123",
              make: "Toyota",
              model: "Camry",
              year: 2022,
              color: "Midnight Black",
              status: "available",
              pickup_city: "Dallas, TX",
              photo_urls: ["https://example.com/camry.jpg"],
              created_at: new Date().toISOString(),
            },
            error: null,
          }),
        }),
      }),
    }),
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

// Mock Region Context
vi.mock("@/contexts/RegionContext", () => ({
  useRegion: () => ({
    country: "USA",
    currency: "USD",
    currencySymbol: "$",
  }),
}));

describe("DynamicMetaTagManager", () => {
  beforeEach(() => {
    document.title = "";
    // Clear meta tags
    document.querySelectorAll("meta, link[rel='canonical']").forEach((el) => el.remove());
  });

  it("generates correct metadata for vehicle details route", () => {
    const mockVehicle = {
      id: "veh-123",
      make: "Toyota",
      model: "Camry",
      year: 2022,
      color: "Midnight Black",
      status: "available",
      pickup_city: "Dallas, TX",
      photo_urls: ["https://example.com/camry.jpg"],
      created_at: new Date().toISOString(),
    };

    const meta = getRouteMetadata("/vehicle/veh-123", mockVehicle, "USA");
    expect(meta.title).toContain("2022 Toyota Camry Rental");
    expect(meta.description).toContain("Midnight Black");
    expect(meta.description).toContain("Dallas, TX");
    expect(meta.canonicalPath).toBe("/vehicle/veh-123");
    expect(meta.ogImage).toBe("https://example.com/camry.jpg");
    expect(meta.ogType).toBe("product");
    expect(meta.twitterCard).toBe("summary_large_image");
    expect(meta.noindex).toBe(false);
  });

  it("generates correct metadata for catalogue category route", () => {
    const meta = getRouteMetadata("/catalogue/budget", null, "USA");
    expect(meta.title).toContain("Budget Friendly Rideshare Vehicles");
    expect(meta.description).toContain("$200 - $250/week");
    expect(meta.canonicalPath).toBe("/catalogue/budget");
    expect(meta.noindex).toBe(false);
  });

  it("applies noindex to private member and admin dashboard routes", () => {
    const adminMeta = getRouteMetadata("/admin/dashboard", null, "USA");
    expect(adminMeta.noindex).toBe(true);

    const driverMeta = getRouteMetadata("/driver/dashboard", null, "USA");
    expect(driverMeta.noindex).toBe(true);

    const ownerMeta = getRouteMetadata("/owner/dashboard", null, "USA");
    expect(ownerMeta.noindex).toBe(true);
  });

  it("renders Helmet tags and synchronizes head elements into DOM", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <MemoryRouter initialEntries={["/faq"]}>
            <DynamicMetaTagManager />
          </MemoryRouter>
        </HelmetProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(document.title).toContain("Frequently Asked Questions");
      const descMeta = document.querySelector('meta[name="description"]');
      expect(descMeta?.getAttribute("content")).toContain("rideshare vehicle rentals");
      const ogTitle = document.querySelector('meta[property="og:title"]');
      expect(ogTitle?.getAttribute("content")).toContain("Frequently Asked Questions");
      const twitterCard = document.querySelector('meta[name="twitter:card"]');
      expect(twitterCard?.getAttribute("content")).toBe("summary_large_image");
      const canonical = document.querySelector('link[rel="canonical"]');
      expect(canonical?.getAttribute("href")).toBe(`${SITE_URL}/faq`);
    });
  });
});
