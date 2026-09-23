// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VehicleComparisonModal, type CompareVehicle } from "../VehicleComparisonModal";
import { VehicleCompareFloatingDock } from "../VehicleCompareFloatingDock";

const mockVehicleA: CompareVehicle = {
  id: "veh-toyota-1",
  make: "Toyota",
  model: "Camry",
  year: 2021,
  color: "Silver",
  status: "available",
  location: "Washington, DC",
  image: "https://example.com/camry.jpg",
  price: 250,
  distance: 3.5,
  isNearby: true,
  nearestCity: "Washington",
  category: "standard",
};

const mockVehicleB: CompareVehicle = {
  id: "veh-hyundai-2",
  make: "Hyundai",
  model: "Elantra",
  year: 2019,
  color: "Black",
  status: "available",
  location: "Arlington, VA",
  image: "https://example.com/elantra.jpg",
  price: 220,
  distance: 5.2,
  isNearby: true,
  nearestCity: "Arlington",
  category: "standard",
};

describe("VehicleComparisonModal", () => {
  it("renders side-by-side vehicle features when open", () => {
    render(
      <MemoryRouter>
        <VehicleComparisonModal
          open={true}
          onOpenChange={vi.fn()}
          vehicleA={mockVehicleA}
          vehicleB={mockVehicleB}
          allVehicles={[mockVehicleA, mockVehicleB]}
          currencySymbol="$"
          country="USA"
          onSelectVehicleA={vi.fn()}
          onSelectVehicleB={vi.fn()}
          onRequestBook={vi.fn()}
          onClear={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Vehicle Comparison")).toBeDefined();
    // Headers and vehicle titles
    expect(screen.getAllByText(/Toyota Camry/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hyundai Elantra/).length).toBeGreaterThan(0);

    // Rental rates
    expect(screen.getAllByText("250").length).toBeGreaterThan(0);
    expect(screen.getAllByText("220").length).toBeGreaterThan(0);

    // Feature specs
    expect(screen.getByText("Detailed Feature Specifications")).toBeDefined();
    expect(screen.getAllByText("100-Point Certified").length).toBe(2);
    expect(screen.getAllByText("Active GPS & Security").length).toBe(2);
    expect(screen.getByText("Save $30/wk")).toBeDefined();
  });

  it("calls onRequestBook when 'Book This Car' button is clicked", () => {
    const handleBook = vi.fn();
    render(
      <MemoryRouter>
        <VehicleComparisonModal
          open={true}
          onOpenChange={vi.fn()}
          vehicleA={mockVehicleA}
          vehicleB={mockVehicleB}
          allVehicles={[mockVehicleA, mockVehicleB]}
          currencySymbol="$"
          country="USA"
          onSelectVehicleA={vi.fn()}
          onSelectVehicleB={vi.fn()}
          onRequestBook={handleBook}
          onClear={vi.fn()}
        />
      </MemoryRouter>
    );

    const bookButtons = screen.getAllByRole("button", { name: /Book This Car/i });
    expect(bookButtons.length).toBe(2);
    fireEvent.click(bookButtons[0]);
    expect(handleBook).toHaveBeenCalledWith(mockVehicleA);
  });

  it("calls onSelectVehicleA and onSelectVehicleB when Swap is clicked", () => {
    const handleSelectA = vi.fn();
    const handleSelectB = vi.fn();

    render(
      <MemoryRouter>
        <VehicleComparisonModal
          open={true}
          onOpenChange={vi.fn()}
          vehicleA={mockVehicleA}
          vehicleB={mockVehicleB}
          allVehicles={[mockVehicleA, mockVehicleB]}
          currencySymbol="$"
          country="USA"
          onSelectVehicleA={handleSelectA}
          onSelectVehicleB={handleSelectB}
          onRequestBook={vi.fn()}
          onClear={vi.fn()}
        />
      </MemoryRouter>
    );

    const swapButton = screen.getByRole("button", { name: /Swap/i });
    fireEvent.click(swapButton);

    expect(handleSelectA).toHaveBeenCalledWith(mockVehicleB);
    expect(handleSelectB).toHaveBeenCalledWith(mockVehicleA);
  });
});

describe("VehicleCompareFloatingDock", () => {
  it("renders chips for selected vehicles and handles open modal", () => {
    const handleOpen = vi.fn();
    const handleRemoveA = vi.fn();

    render(
      <VehicleCompareFloatingDock
        vehicleA={mockVehicleA}
        vehicleB={mockVehicleB}
        currencySymbol="$"
        onRemoveA={handleRemoveA}
        onRemoveB={vi.fn()}
        onOpenModal={handleOpen}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText("Compare (2/2)")).toBeDefined();
    expect(screen.getByText("Toyota Camry")).toBeDefined();
    expect(screen.getByText("Hyundai Elantra")).toBeDefined();

    const compareButton = screen.getByRole("button", { name: /Compare Side-by-Side/i });
    fireEvent.click(compareButton);
    expect(handleOpen).toHaveBeenCalled();

    const removeButtonA = screen.getByRole("button", { name: /Remove vehicle 1 from comparison/i });
    fireEvent.click(removeButtonA);
    expect(handleRemoveA).toHaveBeenCalled();
  });

  it("does not render when no vehicles are selected", () => {
    const { container } = render(
      <VehicleCompareFloatingDock
        vehicleA={null}
        vehicleB={null}
        currencySymbol="$"
        onRemoveA={vi.fn()}
        onRemoveB={vi.fn()}
        onOpenModal={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
