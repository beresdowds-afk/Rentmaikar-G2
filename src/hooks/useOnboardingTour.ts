import { useRegionalOnboarding } from "./useRegionalOnboarding";

export const useOnboardingTour = (opts: { autoOpen?: boolean } = {}) =>
  useRegionalOnboarding("rentmaikar_onboarding_completed", {
    autoOpen: opts.autoOpen !== false,
  });

export default useOnboardingTour;
