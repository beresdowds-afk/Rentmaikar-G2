import { useEffect, useRef } from "react";
import { trackTourEvent } from "@/lib/tour-analytics";
import type { Country } from "@/contexts/RegionContext";

// Emits `tour_start`, `tour_step_view`, and `tour_complete` events with the
// current region attached. Callers pass in observable state (isOpen +
// current step) and this hook diffs it against the previous render to
// determine which event to fire — no changes needed inside the tour
// component's own navigation handlers.
export function useTourAnalytics(
  tourName: string,
  country: Country | string,
  isOpen: boolean,
  currentStep: number,
  stepId: string | undefined,
  totalSteps: number,
) {
  const prevOpen = useRef(false);
  const prevStep = useRef<number>(-1);

  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      trackTourEvent("tour_start", {
        tour: tourName,
        country,
        stepId,
        stepIndex: currentStep,
        totalSteps,
      });
      prevStep.current = -1; // force step_view emit below
    }

    if (isOpen && currentStep !== prevStep.current) {
      trackTourEvent("tour_step_view", {
        tour: tourName,
        country,
        stepId,
        stepIndex: currentStep,
        totalSteps,
      });
      prevStep.current = currentStep;
    }

    if (!isOpen && prevOpen.current) {
      trackTourEvent("tour_complete", {
        tour: tourName,
        country,
        stepId,
        stepIndex: currentStep,
        totalSteps,
      });
      prevStep.current = -1;
    }

    prevOpen.current = isOpen;
  }, [isOpen, currentStep, tourName, country, stepId, totalSteps]);
}
