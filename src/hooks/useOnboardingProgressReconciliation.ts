import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRegistrationProgress, type RegistrationStage } from '@/hooks/useRegistrationProgress';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';

const STAGE_ORDER: Record<RegistrationStage, number> = {
  auth: 0,
  account_opened: 1,
  documents_submitted: 2,
  verification_pending: 3,
  approved: 4,
};

const LS_KEY = 'rentmaikar_last_seen_stage';
const DEEP_LINK_STATE_KEY = 'rentmaikar_deeplink_stage';

/** Persist the stage the deep link expected. Called from the deep-link
 *  handler so we can compare it to server truth on resume. */
export function recordDeepLinkExpectedStage(stage: RegistrationStage | string) {
  try { sessionStorage.setItem(DEEP_LINK_STATE_KEY, String(stage)); }
  catch { /* ignore */ }
}

export interface ReconciliationResult {
  status: 'ok' | 'mismatch' | 'idle';
  expected: RegistrationStage | null;
  actual: RegistrationStage | null;
  /** Dismiss the mismatch banner. */
  acknowledge: () => void;
  /** Force a refetch of the server progress. */
  refetch: () => void;
}

/**
 * Reconciles registration progress on app resume (tab visibility change,
 * page focus, or Capacitor `App.resume`) with the last known deep-link
 * expected stage. When the server says the user has moved forward or
 * backward vs the deep-link state, flags a mismatch so the UI can render
 * a fallback banner instead of showing a locked/unlocked portal by mistake.
 */
export function useOnboardingProgressReconciliation(): ReconciliationResult {
  const qc = useQueryClient();
  const { data, refetch } = useRegistrationProgress();
  const [status, setStatus] = useState<ReconciliationResult['status']>('idle');
  const [expected, setExpected] = useState<RegistrationStage | null>(null);
  const [actual, setActual] = useState<RegistrationStage | null>(null);

  useEffect(() => {
    // Debounce revalidation so tab switches / focus events don't trigger a
    // flood of network calls. React Query already handles refetchOnWindowFocus,
    // so we only need to force-invalidate on the coarser mobile-resume event
    // and on explicit visibility changes at most every 30 seconds.
    let lastTrigger = 0;
    const MIN_INTERVAL_MS = 30_000;
    const trigger = () => {
      const now = Date.now();
      if (now - lastTrigger < MIN_INTERVAL_MS) return;
      lastTrigger = now;
      qc.invalidateQueries({ queryKey: ['registration-progress'] });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let capCleanup: (() => void) | null = null;
    (async () => {
      try {
        // @ts-expect-error – Capacitor global is only present in native.
        if (!window.Capacitor?.isNativePlatform?.()) return;
        const mod = await (Function('m', 'return import(m)') as (m: string) => Promise<unknown>)(
          '@capacitor/app',
        );
        const App = (mod as { App?: { addListener?: Function } }).App;
        if (!App?.addListener) return;
        const handle = await App.addListener('resume', trigger);
        capCleanup = () => handle?.remove?.();
      } catch { /* ignore */ }
    })();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      capCleanup?.();
    };
  }, [qc]);

  useEffect(() => {
    if (!data) return;
    let expectedStage: RegistrationStage | null = null;
    try {
      const raw = sessionStorage.getItem(DEEP_LINK_STATE_KEY) ??
        localStorage.getItem(LS_KEY);
      if (raw && raw in STAGE_ORDER) expectedStage = raw as RegistrationStage;
    } catch { /* ignore */ }

    setExpected(expectedStage);
    setActual(data.stage);

    if (!expectedStage) { setStatus('ok'); return; }
    if (STAGE_ORDER[data.stage] !== STAGE_ORDER[expectedStage]) {
      setStatus('mismatch');
      trackOnboardingEvent('progress_reconciliation_mismatch', {
        role: data.role,
        stage: data.stage,
        extra: { expected: expectedStage, actual: data.stage },
      });
    } else {
      setStatus('ok');
      trackOnboardingEvent('progress_reconciled', {
        role: data.role,
        stage: data.stage,
      });
    }
  }, [data]);

  return {
    status,
    expected,
    actual,
    acknowledge: () => {
      try { sessionStorage.removeItem(DEEP_LINK_STATE_KEY); } catch { /* ignore */ }
      setStatus('ok');
    },
    refetch: () => { void refetch(); },
  };
}
