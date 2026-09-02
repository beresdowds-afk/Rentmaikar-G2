import { AlertTriangle, RefreshCw, ShieldAlert, Camera, Upload, UserCog, Clock, LifeBuoy, LogIn, Cookie, ExternalLink, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DOMAIN_LABELS, type ClassifiedFailure, type RecoveryAction } from '@/lib/verification-failures';

const ACTION_ICON: Record<RecoveryAction, typeof RefreshCw> = {
  retry: RefreshCw,
  retry_later: Clock,
  restart_verification: ShieldAlert,
  reupload_document: Upload,
  retake_selfie: Camera,
  fix_profile_details: UserCog,
  grant_camera_permission: Camera,
  switch_device: ExternalLink,
  enable_cookies: Cookie,
  allow_popups: ExternalLink,
  disable_vpn: ShieldAlert,
  sign_in_again: LogIn,
  link_account: UserCog,
  use_password_login: LogIn,
  complete_onboarding_step: UserCog,
  contact_support: LifeBuoy,
  wait_for_review: Clock,
  none: AlertTriangle,
};

const ACTION_LABEL: Partial<Record<RecoveryAction, string>> = {
  retry: 'Try again',
  retry_later: 'Try again',
  restart_verification: 'Start verification',
  reupload_document: 'Upload again',
  retake_selfie: 'Retake selfie',
  fix_profile_details: 'Update my details',
  grant_camera_permission: 'Retry with camera',
  enable_cookies: 'I’ve enabled cookies — retry',
  allow_popups: 'I’ve allowed pop-ups — retry',
  disable_vpn: 'I’ve turned off my VPN — retry',
  sign_in_again: 'Sign in again',
  link_account: 'Link my account',
  use_password_login: 'Use email sign-in',
  complete_onboarding_step: 'Continue onboarding',
  switch_device: 'How to fix',
};

interface Props {
  failure: ClassifiedFailure;
  /** Primary recovery handler. Omit to hide the action button. */
  onAction?: () => void;
  onSecondaryAction?: () => void;
  secondaryLabel?: string;
  busy?: boolean;
  className?: string;
}

/**
 * Renders an actionable verification/authentication failure — always a plain
 * language cause plus the exact next step, never "verification failed".
 */
export default function VerificationFailureCard({
  failure,
  onAction,
  onSecondaryAction,
  secondaryLabel,
  busy,
  className,
}: Props) {
  const Icon = ACTION_ICON[failure.action] ?? AlertTriangle;
  const showAction = !!onAction && failure.action !== 'none' && failure.action !== 'wait_for_review';
  const variant = failure.retryable ? 'default' : 'destructive';

  return (
    <Alert variant={variant} className={className}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {failure.title}
        <Badge variant="outline" className="text-[10px] font-normal">
          {DOMAIN_LABELS[failure.domain]}
        </Badge>
        {failure.blocksActivation && (
          <Badge variant="secondary" className="text-[10px] font-normal">Blocks activation</Badge>
        )}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{failure.message}</p>
        <p className="font-medium">{failure.nextStep}</p>

        {(showAction || onSecondaryAction) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {showAction && (
              <Button size="sm" onClick={onAction} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Icon className="mr-2 h-3.5 w-3.5" />}
                {ACTION_LABEL[failure.action] ?? 'Try again'}
              </Button>
            )}
            {onSecondaryAction && (
              <Button size="sm" variant="outline" onClick={onSecondaryAction} disabled={busy}>
                {secondaryLabel ?? 'Contact support'}
              </Button>
            )}
          </div>
        )}

        {failure.correlationId && (
          <p className="text-[11px] opacity-70">
            Support reference: <code>{failure.correlationId}</code>
            {failure.code ? ` · ${failure.code}` : ''}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
