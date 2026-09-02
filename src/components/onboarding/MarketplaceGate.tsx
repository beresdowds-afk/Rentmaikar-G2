import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useOnboardingComplete } from '@/hooks/useOnboardingComplete';
import PageSkeleton from '@/components/PageSkeleton';

/**
 * Blocks marketplace-only surfaces (renting, listing, checkout) until the
 * shared `useOnboardingComplete()` predicate is satisfied. Anonymous visitors
 * are sent to /auth (previously they saw content whose queries then 401'd).
 */
export const MarketplaceGate = ({ children }: { children: ReactNode }) => {
  const state = useOnboardingComplete();
  const location = useLocation();

  const returnTo = encodeURIComponent(location.pathname + location.search);

  if (!state.authenticated) {
    return <Navigate to={`/auth?returnTo=${returnTo}`} replace state={{ from: location }} />;
  }

  if (state.isLoading) return <PageSkeleton />;

  if (state.blocker === 'profile_incomplete') {
    return <Navigate to={`/onboarding/complete-profile?returnTo=${returnTo}`} replace />;
  }

  if (state.blocker === 'identity_unverified' || state.blocker === 'awaiting_approval') {
    return <Navigate to={`/onboarding/verification-status?returnTo=${returnTo}`} replace />;
  }

  return <>{children}</>;
};

export default MarketplaceGate;
