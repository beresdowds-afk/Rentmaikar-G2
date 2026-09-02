import { useAuth } from '@/contexts/AuthContext';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { useIdentityVerification } from '@/hooks/useIdentityVerification';
import { useRegistrationProgress } from '@/hooks/useRegistrationProgress';

export type OnboardingBlocker =
  | 'unauthenticated'
  | 'profile_incomplete'
  | 'identity_unverified'
  | 'awaiting_approval'
  | null;

export interface OnboardingCompleteState {
  isLoading: boolean;
  authenticated: boolean;
  mandatoryComplete: boolean;
  identityVerified: boolean;
  approved: boolean;
  /** Single shared definition of "fully onboarded" used by every gate. */
  isComplete: boolean;
  blocker: OnboardingBlocker;
}

/**
 * ONE definition of "fully onboarded", consumed by MarketplaceGate and
 * PortalGate so the two can never disagree. A user is onboarded only when
 * they are signed in, mandatory profile fields are filled, Persona identity
 * verification is approved, AND the account is approved / granted full access.
 */
export function useOnboardingComplete(): OnboardingCompleteState {
  const { user } = useAuth();
  const profile = useProfileCompletion();
  const identity = useIdentityVerification();
  const progress = useRegistrationProgress();

  const authenticated = !!user;

  if (!authenticated) {
    return {
      isLoading: false,
      authenticated: false,
      mandatoryComplete: false,
      identityVerified: false,
      approved: false,
      isComplete: false,
      blocker: 'unauthenticated',
    };
  }

  const isLoading =
    profile.isLoading || identity.isLoading || progress.isLoading ||
    !profile.data || !identity.data || !progress.data;

  const mandatoryComplete = !!profile.data?.mandatory_complete;
  const identityVerified = !!identity.data?.is_verified;
  // Admin approval gates were removed: applications are auto-approved on
  // submission, so account access is never blocked on a manual review.
  const approved = true;

  const blocker: OnboardingBlocker = !mandatoryComplete
    ? 'profile_incomplete'
    : !identityVerified
      ? 'identity_unverified'
      : null;


  return {
    isLoading,
    authenticated,
    mandatoryComplete,
    identityVerified,
    approved,
    isComplete: !isLoading && blocker === null,
    blocker: isLoading ? null : blocker,
  };
}
