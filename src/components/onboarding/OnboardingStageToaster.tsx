import { useOnboardingStageToasts } from "@/hooks/useOnboardingStageToasts";

/**
 * Global onboarding stage notification bridge.
 *
 * Mount once beneath AuthProvider.
 * Displays onboarding progress notifications.
 * Notification failures must never interrupt application startup.
 */
export function OnboardingStageToaster() {
  useOnboardingStageToasts();
  return null;
}

export default OnboardingStageToaster;
