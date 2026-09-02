import type { RegistrationStage } from '@/hooks/useRegistrationProgress';

// Copy shown in a congratulatory toast when a user completes a stage.
// The `next` string is actionable advice for the next step.
export const STAGE_COMPLETION_COPY: Record<
  RegistrationStage,
  { title: string; description: string; next: string; nextPath: string | null }
> = {
  auth: {
    title: '',
    description: '',
    next: '',
    nextPath: null,
  },
  account_opened: {
    title: '🎉 Account created!',
    description: 'Your account is live. Verify your email next to unlock more features.',
    next: 'Verify your email',
    nextPath: '/verify-email',
  },
  documents_submitted: {
    title: '✅ Documents received',
    description: "Great job — we've received your paperwork. Verification is next.",
    next: 'Complete identity verification',
    nextPath: null, // role-dependent, filled in at call site
  },
  verification_pending: {
    title: '🕵️ Verification in progress',
    description: "Your identity check is under review. We'll notify you the moment it's approved.",
    next: 'Sit tight — usually under 24 hours',
    nextPath: null,
  },
  approved: {
    title: '🚀 You are fully onboarded!',
    description: 'All portals are unlocked. Start using every feature of Rentmaikar.',
    next: 'Explore your dashboard',
    nextPath: null,
  },
};

// Failure advice keyed by common failure reasons surfaced from the backend.
export interface StageFailureAdvice {
  title: string;
  description: string;
  remedy: string;
}

export function adviseOnStageFailure(reason: string | null | undefined): StageFailureAdvice {
  const r = (reason ?? '').toLowerCase();
  if (r.includes('document') && (r.includes('blur') || r.includes('quality') || r.includes('unread'))) {
    return {
      title: 'Document quality issue',
      description: 'One of your uploads was too blurry or dark to verify.',
      remedy: 'Re-upload a clear, well-lit photo of the full document with all corners visible.',
    };
  }
  if (r.includes('expired')) {
    return {
      title: 'Document expired',
      description: 'One of the submitted documents has already expired.',
      remedy: 'Upload a valid, in-date replacement and resubmit.',
    };
  }
  if (r.includes('mismatch') || r.includes('name')) {
    return {
      title: 'Name / details mismatch',
      description: 'The details on your documents do not match your profile.',
      remedy: 'Update your profile to match your ID exactly, or upload documents in your registered name.',
    };
  }
  if (r.includes('referee')) {
    return {
      title: 'Referee verification incomplete',
      description: 'One or more of your referees has not confirmed yet.',
      remedy: 'Remind your referee to open the email or SMS link and complete attestation.',
    };
  }
  if (r.includes('payment') || r.includes('deposit')) {
    return {
      title: 'Security deposit issue',
      description: "We couldn't confirm your security deposit payment.",
      remedy: 'Retry the payment or choose a different payment method.',
    };
  }
  if (r.includes('permission') || r.includes('rls')) {
    return {
      title: 'Backend permission issue',
      description: 'Our security rules blocked this step.',
      remedy: 'Retry now. If it persists, contact support with the code shown in the error alert.',
    };
  }
  return {
    title: 'Onboarding step could not complete',
    description: reason || 'An unknown error occurred.',
    remedy: 'Retry the step. If it keeps failing, contact support.',
  };
}
