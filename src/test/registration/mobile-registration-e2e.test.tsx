/**
 * Android / iOS (Capacitor shell) registration e2e tests.
 *
 * The native apps render the SAME React registration screens inside a Capacitor
 * WebView, so a database constraint error must produce byte-identical user
 * messaging on Android, iOS and the web. These tests drive the real
 * DriverRegistration screen under each simulated platform, force the database
 * to reject the insert with the exact messages raised by
 * `enforce_driver_address_required` / `enforce_profile_address_rules`, and
 * assert the rendered alert matches the web baseline from
 * `classifyRegistrationError`.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

if (!(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ---------------------------------------------------------------- mocks ----
const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

// Simulated Capacitor shell. `platform` is flipped per test case.
let platform: "android" | "ios" | "web" = "android";
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => platform,
    isNativePlatform: () => platform !== "web",
    isPluginAvailable: () => false,
  },
}));

const insert = vi.fn();
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => insert(...args),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
    rpc: (...args: unknown[]) => rpc(...args),
    channel: () => {
      const ch: any = { on: () => ch, subscribe: () => ch, unsubscribe: () => Promise.resolve("ok") };
      return ch;
    },
    removeChannel: () => Promise.resolve("ok"),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

const ensureAuthUserForApplicant = vi.fn();
vi.mock("@/lib/user-provisioning", () => ({
  ensureAuthUserForApplicant: (...args: unknown[]) =>
    ensureAuthUserForApplicant.apply(null, args as []),
}));

vi.mock("@/lib/registration-audit", () => ({ logRegistrationEvent: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

vi.mock("@/contexts/RegionContext", () => ({
  useRegion: () => ({
    region: "usa",
    currencySymbol: "$",
    currency: "USD",
    setRegion: vi.fn(),
    isLoading: false,
  }),
}));


vi.mock("@/components/layout/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/layout/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/home/PricingHintBanner", () => ({ default: () => null }));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/components/ui/phone-number-input", () => ({
  PhoneNumberInput: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value?: string;
    onChange: (v: string) => void;
  }) => (
    <input id={id} data-testid={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/ui/select", () => {
  const Ctx = React.createContext<{ onValueChange?: (v: string) => void }>({});

  const collect = (node: React.ReactNode, out: { value: string; label: string }[]) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      const props = child.props as { value?: string; children?: React.ReactNode };
      if (typeof props.value === "string") {
        out.push({ value: props.value, label: String(props.children) });
      } else {
        collect(props.children, out);
      }
    });
  };

  const Select = ({
    children,
    onValueChange,
    defaultValue,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    defaultValue?: string;
  }) => {
    const options: { value: string; label: string }[] = [];
    collect(children, options);
    return (
      <Ctx.Provider value={{ onValueChange }}>
        <select
          role="combobox"
          defaultValue={defaultValue ?? ""}
          onChange={(e) => onValueChange?.(e.target.value)}
        >
          <option value="" />
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Ctx.Provider>
    );
  };

  const Noop = () => null;
  return {
    Select,
    SelectTrigger: Noop,
    SelectValue: Noop,
    SelectContent: Noop,
    SelectItem: Noop,
    SelectGroup: Noop,
    SelectLabel: Noop,
    SelectSeparator: Noop,
  };
});

import DriverRegistration from "@/pages/DriverRegistration";
import { classifyRegistrationError } from "@/lib/registration-errors";

// ------------------------------------------------------------- helpers ----
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/register/driver"]}>
          <DriverRegistration />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
};

const type = async (user: ReturnType<typeof userEvent.setup>, id: string, value: string) => {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  expect(el, `#${id} should exist`).toBeTruthy();
  await user.clear(el);
  if (value) await user.type(el, value);
};

const pickOption = async (user: ReturnType<typeof userEvent.setup>, index: number, value: string) => {
  await user.selectOptions(screen.getAllByRole("combobox")[index], value);
};

const checkByLabelText = async (user: ReturnType<typeof userEvent.setup>, matcher: RegExp) => {
  const label = screen.getAllByText(matcher)[0];
  const row = label.closest("div");
  const box = row ? within(row).queryByRole("checkbox") : null;
  await user.click((box ?? label) as Element);
};

const fillDriverForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await type(user, "firstName", "John");
  await type(user, "lastName", "Doe");
  await type(user, "email", "john.mobile@example.com");
  await type(user, "password", "SuperSecret123");
  await user.type(screen.getByTestId("driver-phone"), "+12025550123");
  await pickOption(user, 1, "Washington DC");
  await type(user, "streetAddress", "24 Ademola Street, Ikeja");
  await type(user, "zipCode", "20001");

  await user.click(screen.getByLabelText("Uber"));
  await checkByLabelText(user, /valid driver'?s? license/i);


  for (const box of screen.getAllByRole("checkbox")) {
    if ((box as HTMLElement).getAttribute("aria-checked") === "true") continue;
    await user.click(box);
  }
  // Required dual-channel consent: pick SMS as the second messaging channel.
  await user.click(screen.getAllByRole("radio")[0]);
};

/** Exact messages raised by the database triggers/constraints. */
const DB_ERRORS = [
  { name: "missing driver address", message: "A home address is required for driver registrations", code: "23514" },
  { name: "address too short", message: "Home address must be at least 5 characters", code: "23514" },
  { name: "address too long", message: "Home address must be 200 characters or fewer", code: "23514" },
  {
    name: "placeholder address",
    message: "Enter your real residential address — placeholders are rejected.",
    code: "23514",
  },
  {
    name: "street_address not-null violation",
    message: 'null value in column "street_address" violates not-null constraint',
    code: "23502",
  },
] as const;

beforeEach(() => {
  navigate.mockReset();
  toastError.mockReset();
  insert.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  ensureAuthUserForApplicant.mockReset().mockResolvedValue("user-123");
});

// --------------------------------------------------------------- tests ----
describe.each(["android", "ios"] as const)("%s shell — DB constraint messaging", (nativePlatform) => {
  beforeEach(() => {
    platform = nativePlatform;
  });

  it.each(DB_ERRORS)("maps the $name error to the web message", async (dbError) => {
    // Web baseline: the single source of truth shared by all platforms.
    const baseline = classifyRegistrationError({ message: dbError.message, code: dbError.code });

    insert.mockResolvedValue({ error: { message: dbError.message, code: dbError.code } });

    const user = userEvent.setup();
    renderPage();
    await fillDriverForm(user);
    await user.click(screen.getByRole("button", { name: /submit (registration|vehicle for review)/i }));

    await waitFor(() => expect(insert).toHaveBeenCalled());
    // Identical title, description, fields and fix steps as the web flow.
    await waitFor(() => expect(screen.getAllByText(baseline.title).length).toBeGreaterThan(0));
    expect(screen.getAllByText(baseline.description).length).toBeGreaterThan(0);
    for (const field of baseline.fields) {
      expect(screen.getAllByText(field).length).toBeGreaterThan(0);
    }
    for (const step of baseline.fixSteps) {
      expect(screen.getAllByText(step).length).toBeGreaterThan(0);
    }
    expect(toastError).toHaveBeenCalledWith(baseline.title);
    // A failed insert must never navigate the native shell to the dashboard.
    expect(navigate).not.toHaveBeenCalledWith("/driver/dashboard");
  }, 30000);
});

describe("cross-platform parity", () => {
  it("produces the same classification on android, ios and web", () => {
    for (const dbError of DB_ERRORS) {
      const results = (["android", "ios", "web"] as const).map((p) => {
        platform = p;
        return classifyRegistrationError({ message: dbError.message, code: dbError.code });
      });
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
    }
  });
});
