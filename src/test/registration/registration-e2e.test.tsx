/**
 * End-to-end regression tests for the registration flows.
 *
 * Covers the two behaviours we keep breaking:
 *  1. Driver registration submits and redirects to the driver dashboard, and
 *     refuses to submit when the (mandatory) home address is blank/too short.
 *  2. Owner registration submits successfully with a BLANK address and writes
 *     `street_address: null` to the database.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// jsdom lacks ResizeObserver, which Radix primitives use.
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
  ensureAuthUserForApplicant: (...args: unknown[]) => ensureAuthUserForApplicant(...args),
}));

vi.mock("@/lib/registration-audit", () => ({
  logRegistrationEvent: vi.fn(),
}));

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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// Plain input replacement for the IDD phone picker (Radix + react-phone-number-input
// is not what these tests are exercising).
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
    <input
      id={id}
      data-testid={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Native <select> stand-ins for Radix Select — keeps the form driveable in jsdom.
vi.mock("@/components/ui/select", () => {
  const Ctx = React.createContext<{
    onValueChange?: (v: string) => void;
    defaultValue?: string;
  }>({});

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
      <Ctx.Provider value={{ onValueChange, defaultValue }}>
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
import OwnerRegistration from "@/pages/OwnerRegistration";

// ------------------------------------------------------------- helpers ----
const renderPage = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/register"]}>{ui}</MemoryRouter>
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

const pickOption = async (
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  value: string,
) => {
  const selects = screen.getAllByRole("combobox");
  await user.selectOptions(selects[index], value);
};

const checkByLabelText = async (
  user: ReturnType<typeof userEvent.setup>,
  matcher: RegExp,
) => {
  const label = screen.getAllByText(matcher)[0];
  const row = label.closest("div");
  const box = row ? within(row).queryByRole("checkbox") : null;
  await user.click((box ?? label) as Element);
};

beforeEach(() => {
  navigate.mockReset();
  insert.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  ensureAuthUserForApplicant.mockReset().mockResolvedValue("user-123");
});

// -------------------------------------------------------------- driver ----
describe("driver registration (e2e)", () => {
  const fillDriverForm = async (
    user: ReturnType<typeof userEvent.setup>,
    { address }: { address: string },
  ) => {
    await type(user, "firstName", "John");
    await type(user, "lastName", "Doe");
    await type(user, "email", "john.driver@example.com");
    await type(user, "password", "SuperSecret123");
    await user.type(screen.getByTestId("driver-phone"), "+12025550123");
    // 0 = country, 1 = city
    await pickOption(user, 1, "Washington DC");
    if (address) await type(user, "streetAddress", address);
    await type(user, "zipCode", "20001");

    await user.click(screen.getByLabelText("Uber"));
    await checkByLabelText(user, /valid driver'?s? license/i);


    for (const box of screen.getAllByRole("checkbox")) {
      if ((box as HTMLElement).getAttribute("aria-checked") === "true") continue;
      await user.click(box);
    }
  };

  it("submits a complete application and redirects to the driver dashboard", async () => {
    const user = userEvent.setup();
    renderPage(<DriverRegistration />);

    await fillDriverForm(user, { address: "24 Ademola Street, Ikeja" });
    await user.click(screen.getAllByRole("radio")[0]); // SMS as the second messaging channel
    await user.click(screen.getByRole("button", { name: /submit (registration|vehicle for review)/i }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({
      application_type: "driver",
      user_id: "user-123",
      street_address: "24 Ademola Street, Ikeja",
      email: "john.driver@example.com",
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/driver/dashboard"));
  });

  it("blocks submission and shows an inline error when the home address is blank", async () => {
    const user = userEvent.setup();
    renderPage(<DriverRegistration />);

    await fillDriverForm(user, { address: "" });
    await user.click(screen.getByRole("button", { name: /submit (registration|vehicle for review)/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/home address is required/i).length).toBeGreaterThan(0),
    );
    expect(insert).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith("/driver/dashboard");
  });

  it("rejects an address shorter than five characters", async () => {
    const user = userEvent.setup();
    renderPage(<DriverRegistration />);

    await fillDriverForm(user, { address: "12" });
    await user.click(screen.getByRole("button", { name: /submit (registration|vehicle for review)/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/more characters?/i).length).toBeGreaterThan(0),
    );
    expect(insert).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------- owner ----
describe("owner registration (e2e)", () => {
  it("submits with a blank address and stores street_address as null", async () => {
    const user = userEvent.setup();
    renderPage(<OwnerRegistration />);

    await type(user, "firstName", "Ada");
    await type(user, "lastName", "Obi");
    await type(user, "email", "ada.owner@example.com");
    await type(user, "password", "SuperSecret123");
    await user.type(screen.getByTestId("owner-phone"), "+12025550124");
    await pickOption(user, 1, "Washington DC"); // city
    // Address intentionally left blank.
    await type(user, "zipCode", "20001");

    await pickOption(user, 2, "Toyota"); // make
    await type(user, "vehicleModel", "Camry");
    await pickOption(user, 3, String(new Date().getFullYear() - 1)); // year
    await type(user, "vehicleColor", "Silver");
    await type(user, "vehiclePlate", "1HGCM82633A004352");
    await type(user, "desiredPrice", "450");

    for (const box of screen.getAllByRole("checkbox")) {
      if ((box as HTMLElement).getAttribute("aria-checked") === "true") continue;
      await user.click(box);
    }
    await user.click(screen.getAllByRole("radio")[0]); // SMS as the second messaging channel

    await user.click(screen.getByRole("button", { name: /submit (registration|vehicle for review)/i }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({
      application_type: "owner",
      street_address: null,
      email: "ada.owner@example.com",
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/owner/dashboard"));
  });
});
