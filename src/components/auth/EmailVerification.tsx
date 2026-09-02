import { useState, useEffect } from 'react';
import { idempotencyHeaders, resetEmailIdempotencyKey } from '@/lib/email-idempotency';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ResendButton } from '@/components/auth/ResendButton';

interface EmailVerificationProps {
  /** Override the email to verify. Defaults to the signed-in user's email. */
  email?: string;
  onVerified?: () => void;
  showAsCard?: boolean;
  /** Redirect target for the verification link. Defaults to origin. */
  redirectTo?: string;
  /** When true, silently auto-confirm if the current session is already verified. */
  autoSkipIfVerified?: boolean;
}

/**
 * Shared email-verification UI. Auto-skips when the current user's email is
 * already confirmed (either via Supabase session or profile flag) unless the
 * caller opts out. Cooldown is delegated to `ResendButton`.
 */
export const EmailVerification = ({
  email: emailOverride,
  onVerified,
  showAsCard = true,
  redirectTo,
  autoSkipIfVerified = true,
}: EmailVerificationProps) => {
  const { user } = useAuth();
  const email = emailOverride ?? user?.email ?? '';
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);

  useEffect(() => {
    if (emailOverride) return;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      const verified = !!data.user?.email_confirmed_at;
      if (cancelled) return;
      setIsEmailVerified(verified);
      if (verified) {
        // Keep the profile flag (used by portal gates) in step with auth.
        await supabase.functions.invoke('sync-auth-identity', { body: {} });
      }
      if (verified && autoSkipIfVerified) onVerified?.();
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [user, emailOverride, autoSkipIfVerified, onVerified]);

  const handleResend = async () => {
    if (!email) return;
    const target = redirectTo ?? `${window.location.origin}/auth`;

    // Preferred path: branded verification email delivered through Resend.
    if (!emailOverride) {
      const { data, error } = await supabase.functions.invoke('send-verification-email', {
        body: { redirect_to: target },
        headers: idempotencyHeaders('email_verification', email),
      });
      if (!error) {
        const res = data as { already_verified?: boolean } | null;
        if (res?.already_verified) {
          setIsEmailVerified(true);
          onVerified?.();
          toast.success('Your email is already verified.');
          return;
        }
        setLastSentAt(new Date());
        resetEmailIdempotencyKey('email_verification', email);
        toast.success('Verification email sent via Resend. Check your inbox.');
        return;
      }
      console.warn('Resend verification failed, falling back to default email', error);
    }

    const { error: fallbackError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: target },
    });
    if (fallbackError) throw fallbackError;
    setLastSentAt(new Date());
    toast.success('Verification email sent! Check your inbox.');
  };

  const handleCheckStatus = async () => {
    setIsLoading(true);
    try {
      const { data: { user: currentUser }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (currentUser?.email_confirmed_at) {
        setIsEmailVerified(true);
        // profiles.email_verified is guarded against self-updates, so the flag
        // is synced from the auth layer server-side instead of written here.
        await supabase.functions.invoke('sync-auth-identity', { body: {} });
        toast.success('Email verified successfully!');
        onVerified?.();
      } else {
        toast.info('Email not yet verified. Please check your inbox.');
      }
    } catch {
      toast.error('Failed to check status');
    } finally {
      setIsLoading(false);
    }
  };


  const content = (
    <div className="space-y-4">
      {isEmailVerified ? (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Your email <strong>{email}</strong> is verified.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              We sent a verification link to <strong>{email}</strong>. Please check your
              inbox and spam folder.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <ResendButton
              channel="email"
              identifier={email}
              onResend={handleResend}
              label="Resend email"
              className="flex-1"
            />

            <Button onClick={handleCheckStatus} disabled={isLoading} size="sm" className="flex-1">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              I've Verified
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            {lastSentAt
              ? `Last sent ${lastSentAt.toLocaleTimeString()} — delivered by Resend. Check spam if it hasn't arrived.`
              : 'Didn\'t receive the email? Check your spam folder or click "Resend email".'}
          </p>
        </div>
      )}
    </div>
  );

  if (!showAsCard) return content;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Verification
            </CardTitle>
            <CardDescription>Verify your email to receive important notifications</CardDescription>
          </div>
          {isEmailVerified && (
            <Badge className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};

export default EmailVerification;
