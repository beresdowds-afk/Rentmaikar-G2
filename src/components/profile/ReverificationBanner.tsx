import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';

type Status =
  | 'approved'
  | 'pending_reverification'
  | 'pending'
  | 'in_review'
  | 'failed'
  | 'rejected'
  | null;

interface Props {
  status: Status;
  /** True when a phone/email change in the current form has not yet been saved */
  pendingLocalChange?: boolean;
}

interface StepConfig {
  label: string;
  state: 'done' | 'current' | 'todo';
}

/**
 * Shows the user where they are in the identity re-verification journey and
 * which actions are locked while it's pending. Rendered on Profile Settings
 * and safe to embed anywhere else re-verification state matters.
 */
export function ReverificationBanner({ status, pendingLocalChange }: Props) {
  const inReview =
    status === 'pending_reverification' ||
    status === 'pending' ||
    status === 'in_review';
  const failed = status === 'failed' || status === 'rejected';
  const approved = status === 'approved';

  if (!inReview && !failed && !pendingLocalChange && !approved) return null;

  const steps: StepConfig[] = [
    {
      label: 'Contact details updated',
      state:
        inReview || failed || pendingLocalChange
          ? 'done'
          : approved
            ? 'done'
            : 'todo',
    },
    {
      label: 'Identity re-verification submitted',
      state: inReview ? 'current' : failed ? 'done' : approved ? 'done' : 'todo',
    },
    {
      label: 'Verification approved',
      state: approved ? 'done' : failed ? 'todo' : 'todo',
    },
  ];

  const variant = failed
    ? 'destructive'
    : approved && !inReview && !pendingLocalChange
      ? 'default'
      : 'default';

  const Icon = failed
    ? ShieldAlert
    : approved && !inReview && !pendingLocalChange
      ? ShieldCheck
      : Clock;

  const title = failed
    ? 'Re-verification failed'
    : inReview
      ? 'Identity re-verification in progress'
      : pendingLocalChange
        ? 'Unsaved changes will trigger re-verification'
        : 'Identity verified';

  const description = failed
    ? 'Your last re-verification attempt did not pass. Please retry with a clearer photo or a valid government ID.'
    : inReview
      ? 'We are re-checking your identity because your contact details changed. Some actions below are temporarily locked.'
      : pendingLocalChange
        ? 'Saving your changes will start a new re-verification. Some actions will be locked until it completes.'
        : 'Your identity is verified. Changing your phone number or email will start a new re-verification.';

  return (
    <Alert
      variant={variant as any}
      className={
        failed
          ? 'mb-4 border-destructive/50'
          : inReview
            ? 'mb-4 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20'
            : approved
              ? 'mb-4 border-green-300 bg-green-50 dark:bg-green-950/20'
              : 'mb-4'
      }
      data-testid="reverification-banner"
    >
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {title}
        {inReview && (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            In review
          </Badge>
        )}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">{description}</p>

        <ol className="space-y-1.5" aria-label="Re-verification progress">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {s.state === 'done' ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
              ) : s.state === 'current' ? (
                <Clock className="h-4 w-4 mt-0.5 text-yellow-700 shrink-0 animate-pulse" />
              ) : (
                <span
                  className="h-4 w-4 mt-0.5 rounded-full border border-muted-foreground/40 shrink-0"
                  aria-hidden
                />
              )}
              <span
                className={
                  s.state === 'done'
                    ? 'text-foreground'
                    : s.state === 'current'
                      ? 'font-medium'
                      : 'text-muted-foreground'
                }
              >
                {i + 1}. {s.label}
              </span>
            </li>
          ))}
        </ol>

        {(inReview || pendingLocalChange) && (
          <div className="rounded-md border border-dashed p-3 text-xs space-y-1 bg-background/60">
            <p className="font-semibold flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" /> Locked while re-verification is pending
            </p>
            <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
              <li>Starting new rentals or vehicle listings</li>
              <li>Withdrawing owner earnings</li>
              <li>Signing new legal agreements</li>
              <li>Changing your name (permanently locked once approved)</li>
            </ul>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default ReverificationBanner;
