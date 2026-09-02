import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  useRegistrationProgress,
  type RegistrationStage,
} from '@/hooks/useRegistrationProgress';
import { STAGE_COMPLETION_COPY, adviseOnStageFailure } from '@/lib/onboarding-stages';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';

const STAGE_ORDER: Record<RegistrationStage, number> = {
  auth: 0,
  account_opened: 1,
  documents_submitted: 2,
  verification_pending: 3,
  approved: 4,
};

const LS_KEY = 'rentmaikar_last_seen_stage';

/**
 * Watches the current user's registration stage and fires:
 *  - a congratulatory toast when it advances forward
 *  - a failure toast with actionable advice when application_status flips to `rejected`
 * The last-seen stage is persisted so we don't re-notify across reloads.
 */
export function useOnboardingStageToasts() {
  const { data } = useRegistrationProgress();
  const lastStageRef = useRef<RegistrationStage | null>(null);
  const lastAppStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;

    // Hydrate persistence once.
    if (lastStageRef.current === null) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw && raw in STAGE_ORDER) {
          lastStageRef.current = raw as RegistrationStage;
        } else {
          lastStageRef.current = data.stage;
        }
      } catch {
        lastStageRef.current = data.stage;
      }
    }

    const prev = lastStageRef.current;
    const now = data.stage;

    if (prev && STAGE_ORDER[now] > STAGE_ORDER[prev]) {
      const copy = STAGE_COMPLETION_COPY[now];
      if (copy?.title) {
        const nextPath =
          copy.nextPath ??
          (data.role === 'owner' ? '/owner/onboarding' : '/driver/onboarding');
        toast.success(copy.title, {
          description: `${copy.description}\nNext: ${copy.next}`,
          action: copy.next
            ? { label: copy.next, onClick: () => (window.location.href = nextPath) }
            : undefined,
        });
      }
      trackOnboardingEvent('onboarding_stage_completed', {
        role: data.role,
        stage: now,
        extra: { previousStage: prev },
      });
      try {
        localStorage.setItem(LS_KEY, now);
      } catch {
        /* ignore */
      }
      lastStageRef.current = now;
    }

    // Failure toast on application rejection.
    const status = data.application_status;
    if (
      status &&
      status !== lastAppStatusRef.current &&
      status.toLowerCase() === 'rejected'
    ) {
      const advice = adviseOnStageFailure(data.identity_verification_status);
      toast.error(advice.title, {
        description: `${advice.description}\nHow to fix: ${advice.remedy}`,
      });
    }
    lastAppStatusRef.current = status;
  }, [data]);
}
