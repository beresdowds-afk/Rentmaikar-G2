import "@testing-library/jest-dom/vitest";

import React from "react";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

import {
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
  RegionProvider,
  useRegion,
  type Country,
} from "@/contexts/RegionContext";

import * as geo from "@/lib/ip-geolocation";

//
// -----------------------------------------------------------------------------
// Mock Supabase
// -----------------------------------------------------------------------------
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};

  const response = {
    data: null,
    error: null,
  };

  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);

  chain.single = vi.fn(async () => response);
  chain.maybeSingle = vi.fn(async () => response);

  chain.then = (onFulfilled: any, onRejected?: any) =>
    Promise.resolve(response).then(onFulfilled, onRejected);

  const realtimeChannel = {
    on: vi.fn(() => realtimeChannel),
    subscribe: vi.fn(() => realtimeChannel),
    unsubscribe: vi.fn(),
  };

  return {
    supabase: {
      from: vi.fn(() => chain),

      channel: vi.fn(() => realtimeChannel),

      removeChannel: vi.fn(),

      removeAllChannels: vi.fn(),

      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: null,
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
    },
  };
});

//
// -----------------------------------------------------------------------------
// Mock geolocation
// -----------------------------------------------------------------------------
vi.mock("@/lib/ip-geolocation", () => ({
  detectCountryFromIP: vi.fn(async () => ({
    country: "USA" as Country,
    countryCode: "US",
    detected: true,
  })),

  detectCountryFromTimezone: vi.fn(
    () => "USA" as Country
  ),
}));

//
// -----------------------------------------------------------------------------
// Test component
// -----------------------------------------------------------------------------
function Probe() {
  const region = useRegion();

  return (
    <div>
      <span data-testid="country">{region.country}</span>
      <span data-testid="currency">{region.currency}</span>
      <span data-testid="symbol">{region.currencySymbol}</span>
      <span data-testid="phone">{region.phonePrefix}</span>

      <button onClick={() => region.setRegionMode("manual")}>
        manual
      </button>

      <button onClick={() => region.setCountry("Nigeria")}>
        ng
      </button>

      <button onClick={() => region.setCountry("USA")}>
        us
      </button>
    </div>
  );
}

function renderApp() {
  return render(
    <RegionProvider>
      <Probe />
    </RegionProvider>
  );
}

//
// -----------------------------------------------------------------------------
// Test setup
// -----------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear();

  if (document.cookie.length > 0) {
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0].trim();

      document.cookie = `${name}=; Max-Age=0; Path=/`;
    });
  }

  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

//
// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------
describe("RegionContext", () => {
  it("renders US region tokens on default detection", async () => {
    vi.mocked(geo.detectCountryFromIP).mockResolvedValueOnce({
      country: "USA",
      countryCode: "US",
      detected: true,
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId("country")).toHaveTextContent("USA");
      expect(screen.getByTestId("currency")).toHaveTextContent("USD");
      expect(screen.getByTestId("symbol")).toHaveTextContent("$");
      expect(screen.getByTestId("phone")).toHaveTextContent("+1");
    });
  });

  it("auto-detects Nigeria and renders NGN tokens consistently", async () => {
    vi.mocked(geo.detectCountryFromIP).mockResolvedValueOnce({
      country: "Nigeria",
      countryCode: "NG",
      detected: true,
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId("country")).toHaveTextContent("Nigeria");
      expect(screen.getByTestId("currency")).toHaveTextContent("NGN");
      expect(screen.getByTestId("symbol")).toHaveTextContent("₦");
      expect(screen.getByTestId("phone")).toHaveTextContent("+234");
    });
  });

  it("persists manual country selection across mounts", async () => {
    const user = userEvent.setup();

    vi.mocked(geo.detectCountryFromIP).mockResolvedValueOnce({
      country: "USA",
      countryCode: "US",
      detected: true,
    });

    const { unmount } = renderApp();

    await waitFor(() =>
      expect(screen.getByTestId("country")).toHaveTextContent("USA")
    );

    await user.click(screen.getByRole("button", { name: "manual" }));
    await user.click(screen.getByRole("button", { name: "ng" }));

    expect(localStorage.getItem("preferred-country")).toBe("Nigeria");
    expect(localStorage.getItem("region-mode")).toBe("manual");

    expect(document.cookie).toContain("preferred-country=Nigeria");

    unmount();

    vi.mocked(geo.detectCountryFromIP).mockResolvedValueOnce({
      country: "USA",
      countryCode: "US",
      detected: true,
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId("country")).toHaveTextContent("Nigeria");
    });
  });

  it("falls back safely when IP detection fails", async () => {
    vi.mocked(geo.detectCountryFromIP).mockRejectedValueOnce(
      new Error("offline")
    );

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId("country")).toHaveTextContent("USA");
    });
  });
});
