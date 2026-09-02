/**
 * IdempotentSubmitButton wraps the idempotent-submit helper and exposes a
 * clear "Already submitted" state when a duplicate submission is deduped,
 * rather than falling back to a generic loading or error state.
 *
 *   <IdempotentSubmitButton
 *     scope="training-checkout"
 *     portal="training"
 *     onSubmit={(key) => supabase.functions.invoke('subscribe-to-plan', { body: { ..., idempotency_key: key } })}
 *   >
 *     Enroll in training
 *   </IdempotentSubmitButton>
 */
import { ReactNode, useEffect, useState } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { Loader2, Check, ShieldCheck } from 'lucide-react';
import {
  getIdempotencyKey,
  runIdempotent,
  releaseIdempotencyKey,
} from '@/lib/idempotent-submit';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';
import { toast } from '@/hooks/use-toast';

type SubmitState = 'idle' | 'submitting' | 'success' | 'deduped' | 'error';

interface Props extends Omit<ButtonProps, 'onSubmit' | 'onClick' | 'children'> {
  scope: string;
  portal: string;
  role?: string | null;
  onSubmit: (idempotencyKey: string) => Promise<unknown>;
  children: ReactNode;
  successLabel?: string;
  /** When true (default), releases the idempotency key after success so a
   *  new legitimate submission is possible after a reset. */
  releaseOnSuccess?: boolean;
}

export function IdempotentSubmitButton({
  scope,
  portal,
  role,
  onSubmit,
  children,
  successLabel = 'Submitted',
  releaseOnSuccess = false,
  disabled,
  ...rest
}: Props) {
  const [state, setState] = useState<SubmitState>('idle');
  const [reason, setReason] = useState<'inflight' | 'cached_success' | null>(null);

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.event !== 'portal_cta_dedup_hit') return;
      if (detail?.idempotencyKey && detail?.portal === portal) {
        setState('deduped');
        setReason(detail.extra?.reason ?? null);
      }
    };
    window.addEventListener('rentmaikar:onboarding-analytics', listener);
    return () =>
      window.removeEventListener('rentmaikar:onboarding-analytics', listener);
  }, [portal]);

  const handle = async () => {
    const key = getIdempotencyKey(scope);
    setState('submitting');
    setReason(null);
    trackOnboardingEvent('portal_cta_submitted', {
      role: (role ?? null) as 'driver' | 'owner' | null,
      portal,
      idempotencyKey: key,
    });
    try {
      await runIdempotent(key, () => onSubmit(key), { portal });
      // If a dedup event fired synchronously inside runIdempotent, `state`
      // will already be 'deduped'; otherwise show real success.
      setState((prev) => (prev === 'deduped' ? 'deduped' : 'success'));
      if (releaseOnSuccess) releaseIdempotencyKey(scope);
    } catch (err: any) {
      setState('error');
      toast({
        title: 'Submission failed',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const isBusy = state === 'submitting';
  const isDone = state === 'success' || state === 'deduped';

  return (
    <div className="inline-flex flex-col gap-1" data-testid="idempotent-submit">
      <Button
        onClick={handle}
        disabled={disabled || isDone}
        data-state={state}
        {...rest}
      >
        {isBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {state === 'success' && <Check className="h-4 w-4 mr-2" />}
        {state === 'deduped' && <ShieldCheck className="h-4 w-4 mr-2" />}
        {state === 'deduped'
          ? 'Already submitted'
          : state === 'success'
          ? successLabel
          : children}
      </Button>
      {state === 'deduped' && (
        <span
          className="text-xs text-muted-foreground"
          data-testid="idempotent-dedup-note"
          role="status"
        >
          {reason === 'inflight'
            ? 'A previous request is still processing — no duplicate was sent.'
            : 'We already received this request. You’re all set.'}
        </span>
      )}
    </div>
  );
}

export default IdempotentSubmitButton;
