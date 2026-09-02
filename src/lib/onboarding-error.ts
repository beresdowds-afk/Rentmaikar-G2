import type { RegistrationStage } from '@/hooks/useRegistrationProgress';

export type OnboardingErrorKind =
  | 'auth'
  | 'network'
  | 'schema'
  | 'permission'
  | 'unknown';

export interface ClassifiedOnboardingError {
  kind: OnboardingErrorKind;
  title: string;
  description: string;
  actionable: string;
  code?: string;
  raw: string;
}

export function classifyOnboardingError(err: unknown): ClassifiedOnboardingError {
  const anyErr = err as { message?: string; code?: string } | undefined;
  const raw = anyErr?.message || 'Unknown error';
  const code = anyErr?.code;
  const lower = raw.toLowerCase();

  if (lower.includes('jwt') || lower.includes('not authenticated') || code === 'PGRST301') {
    return {
      kind: 'auth',
      title: 'Your session expired',
      description: 'Please sign in again to finish setting up your account.',
      actionable: 'Sign in and pick up where you left off — your uploaded documents are saved.',
      code,
      raw,
    };
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')) {
    return {
      kind: 'network',
      title: 'Connection problem',
      description: 'We couldn’t reach the server. Check your internet connection and retry.',
      actionable: 'Retry once you have a stable connection.',
      code,
      raw,
    };
  }
  if (code === '42703' || code === '42883' || lower.includes('does not exist') || lower.includes('schema cache')) {
    return {
      kind: 'schema',
      title: 'Onboarding service is temporarily out of sync',
      description: 'Our team has been notified. This usually clears itself in a few minutes.',
      actionable: 'Try again shortly — your progress is preserved.',
      code,
      raw,
    };
  }
  if (code === '42501' || lower.includes('permission denied') || lower.includes('only admins')) {
    return {
      kind: 'permission',
      title: 'You don’t have permission for this step',
      description: 'Your account role can’t complete this action. An admin may need to review.',
      actionable: 'Contact support if you believe this is a mistake.',
      code,
      raw,
    };
  }
  return {
    kind: 'unknown',
    title: 'We couldn’t complete your onboarding',
    description: 'Something went wrong on our side. Retry, or contact support if it keeps failing.',
    actionable: 'Retry the step below.',
    code,
    raw,
  };
}

/** Which page a user should land on given their current registration stage. */
export function routeForStage(
  role: 'driver' | 'owner' | null,
  stage: RegistrationStage | null,
): string {
  if (!role) return '/auth';
  const registration = role === 'driver' ? '/driver/register' : '/owner/register';
  const dashboard = role === 'driver' ? '/driver/dashboard' : '/owner/dashboard';
  switch (stage) {
    case 'auth':
    case 'account_opened':
      return registration;
    case 'documents_submitted':
    case 'verification_pending':
    case 'approved':
      return dashboard;
    default:
      return registration;
  }
}
