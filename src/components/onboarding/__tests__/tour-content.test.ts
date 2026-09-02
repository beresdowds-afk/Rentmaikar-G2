import { describe, it, expect } from "vitest";
import { buildTourSteps as buildLandingSteps } from "@/components/onboarding/OnboardingTour";
import { buildTourSteps as buildAdminSteps } from "@/components/onboarding/AdminOnboardingTour";
import { buildTourSteps as buildIotSteps } from "@/components/onboarding/IoTSupportOnboardingTour";
import { buildTourSteps as buildLegalSteps } from "@/components/onboarding/LegalSupportOnboardingTour";
import { buildTourSteps as buildVehicleSteps } from "@/components/onboarding/VehicleSupportOnboardingTour";

const tours = [
  { name: "landing", build: buildLandingSteps, usaKeyword: "USA", ngKeyword: "Nigeria" },
  { name: "admin", build: buildAdminSteps, usaKeyword: "Twilio", ngKeyword: "Termii" },
  { name: "iot", build: buildIotSteps, usaKeyword: "AT&T", ngKeyword: "MTN" },
  { name: "legal", build: buildLegalSteps, usaKeyword: "US state", ngKeyword: "Nigerian" },
  { name: "vehicle", build: buildVehicleSteps, usaKeyword: "USA", ngKeyword: "Nigeria" },
] as const;

describe("Region-aware tour content", () => {
  for (const { name, build, usaKeyword, ngKeyword } of tours) {
    describe(name, () => {
      it("renders USA copy for USA", () => {
        const steps = build("USA");
        expect(steps.length).toBeGreaterThan(0);
        const blob = steps.map((s) => `${s.title} ${s.description}`).join(" | ");
        expect(blob).toContain(usaKeyword);
      });

      it("renders Nigeria copy for Nigeria", () => {
        const steps = build("Nigeria");
        expect(steps.length).toBeGreaterThan(0);
        const blob = steps.map((s) => `${s.title} ${s.description}`).join(" | ");
        expect(blob).toContain(ngKeyword);
      });

      it("differs between USA and Nigeria", () => {
        const usa = build("USA").map((s) => s.description).join("|");
        const ng = build("Nigeria").map((s) => s.description).join("|");
        expect(usa).not.toEqual(ng);
      });

      it("falls back to USA content for unknown region", () => {
        const fallback = build("Atlantis");
        const usa = build("USA");
        expect(fallback.length).toEqual(usa.length);
        expect(fallback.map((s) => s.title)).toEqual(usa.map((s) => s.title));
      });

      it("has stable step ids across regions", () => {
        const usaIds = build("USA").map((s) => s.id);
        const ngIds = build("Nigeria").map((s) => s.id);
        expect(usaIds).toEqual(ngIds);
      });
    });
  }
});
