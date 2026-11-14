import { ReactNode } from 'react';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TwoFactorChallenge } from '@/components/auth/TwoFactorChallenge';
import { AuthenticatorAppSetup } from '@/components/auth/AuthenticatorAppSetup';

export function usePaymentMfaStatus() {
  const { user, isLoading, twoFactorStatus, twoFactorVerified, check2FAStatus } = useAuth();

  const hasPaymentMfa =
    Boolean(user) &&
    !isLoading &&
    twoFactorVerified &&
    !twoFactorStatus?.check_failed &&
    twoFactorStatus?.current_level === 'aal2';

  return {
    user,
    isLoading,
    twoFactorStatus,
    twoFactorVerified,
    hasPaymentMfa,
    check2FAStatus,
  };
}

interface PaymentMfaGateProps {
  children?: ReactNode;
}

/**
 * Enforces compulsory AAL2 multi-factor authentication for all payment,
 * subscription checkout, proxy payment, payout, and withdrawal flows — even
 * if a user collapsed the temporary MFA-check card during sign-in or does not
 * have mandatory login MFA enabled.
 */
export function PaymentMfaGate({ children }: PaymentMfaGateProps) {
  const { user, isLoading, twoFactorStatus, hasPaymentMfa, check2FAStatus } = usePaymentMfaStatus();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking two-factor verification status…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Alert variant="destructive" data-testid="payment-mfa-signin-required">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          You must sign in and complete multi-factor authentication before making payments.
        </AlertDescription>
      </Alert>
    );
  }

  if (hasPaymentMfa) {
    return children ? <>{children}</> : null;
  }

  if (!twoFactorStatus) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Verifying multi-factor authentication status…</span>
      </div>
    );
  }

  if (twoFactorStatus.check_failed) {
    return (
      <Alert variant="destructive" data-testid="payment-mfa-required-alert">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Multi-factor authentication required for payments</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            MFA verification is compulsory for all payments and withdrawals. Although you may
            continue your session without MFA, payments remain locked until two-factor verification
            succeeds.
          </p>
          {twoFactorStatus.check_error && (
            <p className="text-xs opacity-90">{twoFactorStatus.check_error}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void check2FAStatus(user.id)}
            data-testid="payment-mfa-retry-button"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry MFA verification
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (twoFactorStatus.requires_challenge || twoFactorStatus.factor_id) {
    const channel =
      twoFactorStatus.factor_type === 'totp'
        ? 'authenticator'
        : twoFactorStatus.preferred_channel === 'whatsapp'
          ? 'whatsapp'
          : twoFactorStatus.preferred_channel === 'sms'
            ? 'sms'
            : 'authenticator';

    return (
      <div className="space-y-4" data-testid="payment-mfa-challenge-gate">
        <Alert data-testid="payment-mfa-challenge-alert">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Two-factor verification required for payments</AlertTitle>
          <AlertDescription>
            MFA is compulsory for all payments and withdrawals. Verify your 6-digit security code
            below to unlock payment actions.
          </AlertDescription>
        </Alert>
        <TwoFactorChallenge
          embedded
          userId={user.id}
          phone={twoFactorStatus.phone}
          channel={channel}
          factorId={twoFactorStatus.factor_id}
          onVerified={() => void check2FAStatus(user.id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="payment-mfa-setup-gate">
      <Alert data-testid="payment-mfa-setup-alert">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Set up MFA to continue with payments</AlertTitle>
        <AlertDescription>
          Multi-factor authentication is compulsory for all payments and withdrawals. Set up your
          authenticator app below to unlock this payment.
        </AlertDescription>
      </Alert>
      <AuthenticatorAppSetup onFactorVerified={() => void check2FAStatus(user.id)} />
    </div>
  );
}

export default PaymentMfaGate;
