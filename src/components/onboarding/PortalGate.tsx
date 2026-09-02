import { ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Lock, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';
import {
  useRegistrationProgress,
  type RegistrationStage,
  type RegistrationProgress,
} from '@/hooks/useRegistrationProgress';
import { useOnboardingMachine } from '@/hooks/useOnboardingMachine';
import { useOnboardingComplete } from '@/hooks/useOnboardingComplete';
import { useAuth } from '@/contexts/AuthContext';
import { onboardingForRole, type AppRole } from '@/lib/role-home';

export type Requirement =
  | 'authenticated'
  | 'email_verified'
  | 'documents'
  | 'verification'
  | 'approved';

const STAGE_ORDER: Record<RegistrationStage, number> = {
  auth: 0,
  account_opened: 1,
  documents_submitted: 2,
  verification_pending: 3,
  approved: 4,
};

interface Props {
  require?: Requirement;
  portal: string;
  hint?: string;
  children: ReactNode;
}

const REQUIREMENT_COPY: Record<Requirement, { title: string; hint: string }> = {
  authenticated: { title: 'Sign in required', hint: 'sign in to continue.' },
  email_verified: {
    title: 'Verify your email first',
    hint: 'confirm your email address to unlock this portal.',
  },
  documents: {
    title: 'Upload required documents',
    hint: 'submit your identification and required documents.',
  },
  verification: {
    title: 'Complete identity verification',
    hint: 'finish identity verification to unlock this portal.',
  },
  approved: {
    title: 'Complete your onboarding',
    hint: 'finish verification and wait for admin approval.',
  },
};

interface Step {
  key: Requirement;
  label: string;
  done: boolean;
}

function buildSteps(p: RegistrationProgress | undefined): Step[] {
  const authed = !!p?.authenticated;
  const emailVerified = !!p?.email_verified;
  const docsSubmitted = !!p && STAGE_ORDER[p.stage] >= STAGE_ORDER.documents_submitted;
  const verified = !!p && STAGE_ORDER[p.stage] >= STAGE_ORDER.verification_pending;
  const approved = !!p && (p.access_level === 'full' || p.stage === 'approved');
  return [
    { key: 'authenticated', label: 'Create your account', done: authed },
    { key: 'email_verified', label: 'Verify your email', done: emailVerified },
    { key: 'documents', label: 'Submit required documents', done: docsSubmitted },
    { key: 'verification', label: 'Complete identity verification', done: verified },
    { key: 'approved', label: 'Await admin approval', done: approved },
  ];
}

function nextStepPath(
  p: RegistrationProgress | undefined,
  fallbackRole?: AppRole | null,
): string {
  if (!p?.authenticated) return '/auth';
  if (!p.email_verified) return '/verify-email';
  const role = (p.role as AppRole | null) ?? fallbackRole ?? null;
  const base = onboardingForRole(role);
  const stageIdx = STAGE_ORDER[p.stage];
  if (stageIdx < STAGE_ORDER.documents_submitted) return `${base}?step=documents`;
  if (stageIdx < STAGE_ORDER.verification_pending) return `${base}?step=verification`;
  return base;
}

export function PortalGate({
  require = 'approved',
  portal,
  hint,
  children,
}: Props) {
  const { data: progress, isLoading } = useRegistrationProgress();
  const { data: machine } = useOnboardingMachine();
  const { userRole } = useAuth();
  const onboarding = useOnboardingComplete();

  const steps = useMemo(() => buildSteps(progress), [progress]);
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  if (isLoading) {
    return (
      <Card data-testid="portal-gate-loading">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    );
  }

  const meets = (() => {
    if (!progress?.authenticated) return false;
    if (require === 'authenticated') return true;
    if (require === 'email_verified') return !!progress.email_verified;
    if (require === 'documents')
      return STAGE_ORDER[progress.stage] >= STAGE_ORDER.documents_submitted;
    if (require === 'verification')
      return STAGE_ORDER[progress.stage] >= STAGE_ORDER.verification_pending;
    // Shared definition of "fully onboarded" (identity verification included).
    return onboarding.isComplete;
  })();

  if (meets) return <>{children}</>;

  const req = REQUIREMENT_COPY[require];
  // Prefer the server-sourced next step; fall back to the local computation.
  const nextPath =
    onboarding.blocker === 'identity_unverified'
      ? '/onboarding/verification-status'
      : onboarding.blocker === 'profile_incomplete'
        ? '/onboarding/complete-profile'
        : machine?.next_href ?? nextStepPath(progress, userRole as AppRole | null);
  const remaining = steps.filter((s) => !s.done);
  const nextStepLabel =
    (machine && machine.labels[machine.next_step]) ?? remaining[0]?.label ?? 'Continue onboarding';

  return (
    <Card className="border-dashed" data-testid="portal-gate-blocker">
      <CardContent className="p-6 space-y-4">
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>{req.title}</AlertTitle>
          <AlertDescription>
            <span className="font-medium">{portal}</span> is locked until you{' '}
            {hint ?? req.hint}
          </AlertDescription>
        </Alert>

        <div className="space-y-2" aria-label="Onboarding progress">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Onboarding progress</span>
            <span className="font-medium">
              {doneCount}/{steps.length} complete
            </span>
          </div>
          <Progress value={pct} aria-valuenow={pct} />
          <ul className="space-y-1 pt-2">
            {steps.map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-2 text-sm"
                data-testid={`onboarding-step-${s.key}`}
                data-done={s.done ? 'true' : 'false'}
              >
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span
                  className={
                    s.done ? 'line-through text-muted-foreground' : 'text-foreground'
                  }
                >
                  {s.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            size="sm"
            data-testid="portal-gate-continue"
            onClick={() =>
              trackOnboardingEvent('deep_link_opened', {
                role: progress?.role ?? null,
                stage: progress?.stage ?? null,
                portal,
                requirement: require,
                origin: 'web',
                extra: { source: 'portal_gate_continue', nextPath },
              })
            }
          >
            <Link to={nextPath}>
              Continue onboarding: {nextStepLabel}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/faq">Learn more</Link>
          </Button>
        </div>
        {progress && (
          <p className="text-xs text-muted-foreground">
            Current stage: <span className="font-mono">{progress.stage}</span>
            {progress.application_status && (
              <>
                {' · Application: '}
                <span className="font-mono">{progress.application_status}</span>
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
