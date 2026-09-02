import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Region hook is mocked per test so we can flip the country and verify
// each tour hook writes its completion under a region-scoped storage key.
const mockRegion = vi.fn(() => ({ country: "USA" as "USA" | "Nigeria" | (string & {}) }));
vi.mock("@/contexts/RegionContext", () => ({
  useRegion: () => mockRegion(),
}));

import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import { useAdminOnboardingTour } from "@/hooks/useAdminOnboardingTour";
import { useIoTSupportOnboarding } from "@/hooks/useIoTSupportOnboarding";
import { useLegalSupportOnboarding } from "@/hooks/useLegalSupportOnboarding";
import { useVehicleSupportOnboarding } from "@/hooks/useVehicleSupportOnboarding";

const hooks = [
  { name: "landing", hook: useOnboardingTour, base: "rentmaikar_onboarding_completed" },
  { name: "admin", hook: useAdminOnboardingTour, base: "rentmaikar_admin_onboarding_completed" },
  { name: "iot", hook: useIoTSupportOnboarding, base: "rentmaikar_iot_support_onboarding_completed" },
  { name: "legal", hook: useLegalSupportOnboarding, base: "rentmaikar_legal_support_onboarding_completed" },
  { name: "vehicle", hook: useVehicleSupportOnboarding, base: "rentmaikar_vehicle_support_onboarding_completed" },
] as const;

describe("Per-region onboarding completion persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    mockRegion.mockReturnValue({ country: "USA" });
  });

  for (const { name, hook, base } of hooks) {
    describe(name, () => {
      it("uses a region-scoped storage key", () => {
        const { result } = renderHook(() => hook());
        expect(result.current.storageKey).toBe(`${base}_USA`);
      });

      it("completing in one region does not mark other region complete", () => {
        const { result, rerender } = renderHook(() => hook());
        act(() => result.current.completeTour());
        expect(localStorage.getItem(`${base}_USA`)).toBe("true");
        expect(localStorage.getItem(`${base}_Nigeria`)).toBeNull();

        // Switch region and re-render: still needs to be taken.
        mockRegion.mockReturnValue({ country: "Nigeria" });
        rerender();
        expect(result.current.storageKey).toBe(`${base}_Nigeria`);
      });

      it("honors legacy (region-less) completion on first read", () => {
        localStorage.setItem(base, "true");
        const { result } = renderHook(() => hook());
        expect(result.current.hasCompleted).toBe(true);
        expect(result.current.isOpen).toBe(false);
      });
    });
  }
});
