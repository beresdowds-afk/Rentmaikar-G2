import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRegistrationProgress } from '@/hooks/useRegistrationProgress';
import { useOnboardingMachine } from '@/hooks/useOnboardingMachine';
import PageSkeleton from '@/components/PageSkeleton';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';
import { recordDeepLinkExpectedStage } from '@/hooks/useOnboardingProgressReconciliation';

/**
 * Entry point for onboarding deep links. Delegates the "where to next?"
 * decision to the server-sourced onboarding state machine so gating logic
 * lives in one place. Honors `?force=1` to re-visit a step deliberately.
 */
export default function OnboardingRedirect() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: progress } = useRegistrationProgress();
  const { data: machine, isLoading } = useOnboardingMachine();

  useEffect(() => {
    if (isLoading || !machine) return;

    const step = params.get('step');
    const force = params.get('force') === '1';
    const originParam = params.get('origin');
    const origin =
      originParam === 'native' || originParam === 'push' || originParam === 'email'
        ? originParam
        : 'web';

    recordDeepLinkExpectedStage(step ?? progress?.stage ?? machine.next_step);
    trackOnboardingEvent('deep_link_opened', {
      role: machine.role,
      stage: progress?.stage ?? null,
      origin,
      extra: { step, next_step: machine.next_step },
    });

    // If a specific step is requested (and forced) honor it; otherwise let
    // the state machine skip past anything already completed.
    if (step && force) {
      const role = machine.role ?? 'driver';
      const base = role === 'owner' ? '/owner/onboarding' : '/driver/onboarding';
      navigate(`${base}?step=${step}`, { replace: true });
      return;
    }

    navigate(machine.next_href || '/', { replace: true });
  }, [machine, isLoading, navigate, params, progress?.stage]);

  return <PageSkeleton />;
}

