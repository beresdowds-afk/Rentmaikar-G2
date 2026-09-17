import { useState, useEffect } from 'react';
import { platformAuth } from '@/lib/auth/oauth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Smartphone, ExternalLink } from 'lucide-react';
import PhoneOtpPanel from './PhoneOtpPanel';
import { toast } from 'sonner';
import VerificationFailureCard from '@/components/verification/VerificationFailureCard';
import type { ClassifiedFailure } from '@/lib/verification-failures';
import { getCorrelationId, logVerificationEvent, reportVerificationFailure } from '@/lib/verification-logger';
import { runPreflight } from '@/lib/verification-preflight';

type Role = 'driver' | 'owner';

export function AlternativeAuthOptions({
  defaultRole = 'driver' as Role,
  showPhone = true,
}: { defaultRole?: Role; showPhone?: boolean }) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [googleFailure, setGoogleFailure] = useState<ClassifiedFailure | null>(null);
  const [blockedAuthUrl, setBlockedAuthUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'OAUTH_AUTH_SUCCESS' ||
        event.data?.type === 'GOOGLE_OAUTH_SUCCESS'
      ) {
        setGoogleLoading(false);
        setBlockedAuthUrl(null);
      }
    };
    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, []);

  const failGoogle = async (err: unknown, step: string) => {
    const failure = await reportVerificationFailure(err, { stage: 'oauth', step, provider: 'google' });
    setGoogleFailure(failure);
    toast.error(failure.title, { description: failure.nextStep });
    setGoogleLoading(false);
  };

  const handleGoogle = async () => {
    setGoogleFailure(null);
    setBlockedAuthUrl(null);
    setGoogleLoading(true);
    const correlationId = getCorrelationId();
    try {
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('rentmaikar_oauth_role', defaultRole);
          localStorage.setItem('rentmaikar_oauth_role', defaultRole);
        } catch {
          // ignore storage quota/security errors
        }
      }

      // Catch the common browser-side blockers (cookies, storage, offline,
      // outdated engine) BEFORE bouncing the user to Google.
      const preflight = await runPreflight({ requireOAuth: true, skipClockCheck: true });
      if (!preflight.ok) {
        const blocker = preflight.blocking[0];
        setGoogleFailure({ ...blocker, raw: blocker.detail ?? blocker.code, correlationId });
        await logVerificationEvent({
          stage: 'oauth', step: 'preflight', outcome: 'failed', provider: 'google',
          failure: { ...blocker, raw: blocker.detail ?? blocker.code, correlationId }, correlationId,
        });
        toast.error(blocker.title, { description: blocker.nextStep });
        setGoogleLoading(false);
        return;
      }

      await logVerificationEvent({ stage: 'oauth', step: 'google_sign_in', outcome: 'started', provider: 'google', correlationId });

      const redirectTarget = `${window.location.origin}/auth/callback`;
      const result = await platformAuth.signInWithOAuth('google', {
        redirect_uri: redirectTarget,
        extraParams: {
          // Minimum scopes per Google OAuth policy:
          // - openid       → Google Subject ID (sub) + verified email status (email_verified)
          // - email        → email address
          // - profile      → full name + profile photo (picture)
          // No additional Google API scopes are requested.
          scope: 'openid email profile',
          // Ensure Google shows the consent screen so users know what
          // RentMaikar is receiving (name, email, photo, verified status, sub).
          prompt: 'consent select_account',
          include_granted_scopes: 'true',
        },
      });

      if (result.error) {
        if (result.error.message === 'POPUP_BLOCKED' && result.authUrl) {
          setBlockedAuthUrl(result.authUrl);
          toast.warning('Pop-up window was blocked by your browser', {
            description: 'Click the "Open Google Sign-In" link below to continue.',
          });
          setGoogleLoading(false);
          return;
        }
        await failGoogle(result.error, 'google_sign_in');
        return;
      }

      await logVerificationEvent({
        stage: 'oauth', step: 'google_sign_in', outcome: 'succeeded', provider: 'google',
        correlationId, context: { redirected: result.redirected ?? false, isPopup: result.isPopup ?? false },
      });

      if (result.isPopup && result.popup) {
        const checkInterval = setInterval(async () => {
          if (result.popup?.closed) {
            clearInterval(checkInterval);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              setGoogleLoading(false);
            }
          }
        }, 700);
      }
    } catch (e) {
      await failGoogle(e, 'google_sign_in');
    }
  };



  return (
    <div className="space-y-3">
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted-foreground uppercase">Or continue with</span>
        </div>
      </div>
      <div className={showPhone ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogle}
          disabled={googleLoading}
          data-testid="google-sso-button"
        >
          {googleLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1a6.2 6.2 0 010-12.4c1.94 0 3.24.83 3.98 1.54l2.72-2.62A9.8 9.8 0 0012 2C6.48 2 2 6.48 2 12s4.48 10 10 10c5.77 0 9.6-4.06 9.6-9.78 0-.66-.07-1.16-.16-1.65H12z" />
            </svg>
          )}
          Google
        </Button>
        {showPhone && (
          <Button type="button" variant="outline" onClick={() => setPhoneOpen(true)}>
            <Smartphone className="h-4 w-4 mr-2" />
            Phone
          </Button>
        )}
      </div>


      {blockedAuthUrl && (
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs space-y-2">
          <p className="font-medium">Pop-up window was blocked by your browser.</p>
          <a
            href={blockedAuthUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
          >
            <span>Open Google Sign-In</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {googleFailure && (
        <div data-testid="google-sso-error" role="alert">
          <VerificationFailureCard
            failure={googleFailure}
            busy={googleLoading}
            onAction={
              googleFailure.action === 'use_password_login' || googleFailure.action === 'contact_support'
                ? undefined
                : handleGoogle
            }
          />
        </div>
      )}


      <PhoneOtpDialog open={phoneOpen} onOpenChange={setPhoneOpen} defaultRole={defaultRole} />
    </div>
  );
}

function PhoneOtpDialog({
  open, onOpenChange, defaultRole,
}: { open: boolean; onOpenChange: (v: boolean) => void; defaultRole: Role }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in with phone</DialogTitle>
          <DialogDescription>
            We'll text you a one-time code. New numbers create an account; existing
            ones sign you straight in.
          </DialogDescription>
        </DialogHeader>
        <PhoneOtpPanel
          mode="signin"
          defaultRole={defaultRole}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default AlternativeAuthOptions;
