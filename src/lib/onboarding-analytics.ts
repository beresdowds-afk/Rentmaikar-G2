// Lightweight analytics for onboarding stage completion, portal CTA
// submissions, and deep-link origins. Never throws. Sinks:
//   1. console.info (visible, scrapable)
//   2. window CustomEvent `rentmaikar:onboarding-analytics` (tests + listeners)
//   3. Meta Pixel (best-effort)
import { trackEvent } from '@/lib/meta-pixel';

export type OnboardingAnalyticsEvent =
  | 'onboarding_stage_completed'
  | 'portal_cta_submitted'
  | 'portal_cta_dedup_hit'
  | 'deep_link_opened'
  | 'progress_reconciled'
  | 'progress_reconciliation_mismatch'
  | 'progress_manual_resync'
  | 'profile_updated'
  | 'profile_reverification_triggered'
  | 'passport_uploaded'
  | 'passport_replaced'
  | 'passport_removed';

export interface OnboardingAnalyticsPayload {
  role?: 'driver' | 'owner' | null;
  stage?: string | null;
  portal?: string;
  origin?: 'web' | 'native' | 'push' | 'email' | 'unknown';
  requirement?: string;
  idempotencyKey?: string;
  fields?: string[];
  extra?: Record<string, unknown>;
}

const PIXEL_NAMES: Record<OnboardingAnalyticsEvent, string> = {
  onboarding_stage_completed: 'OnboardingStageCompleted',
  portal_cta_submitted: 'PortalCtaSubmitted',
  portal_cta_dedup_hit: 'PortalCtaDedupHit',
  deep_link_opened: 'OnboardingDeepLinkOpened',
  progress_reconciled: 'OnboardingProgressReconciled',
  progress_reconciliation_mismatch: 'OnboardingProgressMismatch',
  progress_manual_resync: 'OnboardingProgressManualResync',
  profile_updated: 'ProfileUpdated',
  profile_reverification_triggered: 'ProfileReverificationTriggered',
  passport_uploaded: 'PassportUploaded',
  passport_replaced: 'PassportReplaced',
  passport_removed: 'PassportRemoved',
};


export function trackOnboardingEvent(
  event: OnboardingAnalyticsEvent,
  payload: OnboardingAnalyticsPayload = {},
): void {
  const full = { event, ...payload, ts: Date.now() };
  try {
    // eslint-disable-next-line no-console
    console.info('[onboarding-analytics]', full);
  } catch {
    /* ignore */
  }
  try {
    trackEvent(PIXEL_NAMES[event], {
      role: payload.role,
      stage: payload.stage,
      portal: payload.portal,
      origin: payload.origin,
      requirement: payload.requirement,
      fields: payload.fields,
      ...(payload.extra ?? {}),
    });

  } catch {
    /* analytics must never throw */
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('rentmaikar:onboarding-analytics', { detail: full }),
      );
    }
  } catch {
    /* ignore */
  }
}
