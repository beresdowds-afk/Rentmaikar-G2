import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Link2, Unlink, ShieldCheck, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

type Identity = {
  identity_id?: string;
  id?: string;
  provider: string;
  identity_data?: Record<string, any> | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

const PROVIDER_LABEL: Record<string, string> = {
  email: 'Email & Password',
  phone: 'Phone (SMS/OTP)',
  google: 'Google',
  apple: 'Apple',
};

/**
 * Connected accounts panel.
 *
 * Linking flow (prevents duplicate RentMaikar accounts):
 *  1. User is already signed in (password/phone/existing Google) so we know
 *     they own the RentMaikar account.
 *  2. Clicking "Link Google" calls supabase.auth.linkIdentity which opens
 *     Google's consent screen. Google itself verifies ownership of the
 *     Google account and returns a verified email.
 *  3. Supabase attaches the Google identity to the *current* auth.users row —
 *     no new user is created, and every rental/payment/message/review row
 *     that references user_id keeps working unchanged.
 */
export function ConnectedAccounts() {
  const { user } = useAuth();
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<Identity | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      setIdentities((data?.identities as Identity[]) ?? []);
    } catch (e) {
      setIdentities([]);
      setNotice((e as Error).message || 'Could not load connected accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const linked = new Set((identities ?? []).map((i) => i.provider));

  const linkGoogle = async () => {
    setBusyProvider('google');
    setNotice(null);
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/settings/profile`,
          scopes: 'openid email profile',
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
      // Browser is redirecting to Google's consent screen.
      if (data?.url) window.location.assign(data.url);
    } catch (e) {
      const msg = (e as Error).message || 'Could not start Google linking.';
      const friendly = /manual linking|not enabled/i.test(msg)
        ? 'Identity linking is not enabled on this environment. Please contact support.'
        : /identity is already linked/i.test(msg)
          ? 'This Google account is already linked to a different RentMaikar account. Sign in with that account or contact support.'
          : msg;
      toast({ title: 'Google linking failed', description: friendly, variant: 'destructive' });
      setBusyProvider(null);
    }
  };

  const confirmUnlink = async () => {
    if (!unlinkTarget) return;
    setBusyProvider(unlinkTarget.provider);
    try {
      // Never let the user strip their last sign-in method.
      if ((identities ?? []).length <= 1) {
        throw new Error('You must keep at least one sign-in method connected.');
      }
      const { error } = await supabase.auth.unlinkIdentity(unlinkTarget as any);
      if (error) throw error;
      toast({ title: 'Account unlinked', description: `${PROVIDER_LABEL[unlinkTarget.provider] || unlinkTarget.provider} is no longer connected.` });
      setUnlinkTarget(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not unlink', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Connected Accounts
          </CardTitle>
          <CardDescription>
            Link Google to sign in faster. Your rides, rentals, payments, reviews,
            saved vehicles, and messages stay on this single RentMaikar account —
            linking never creates a duplicate profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading connected accounts…
            </div>
          ) : (
            <div className="space-y-3">
              {/* Google row */}
              <ProviderRow
                icon={<GoogleIcon />}
                title="Google"
                subtitle={
                  linked.has('google')
                    ? (identities?.find((i) => i.provider === 'google')?.identity_data?.email ?? 'Linked')
                    : `Link to ${user?.email ?? 'this account'}`
                }
                linked={linked.has('google')}
                busy={busyProvider === 'google'}
                onLink={linkGoogle}
                onUnlink={() => {
                  const target = identities?.find((i) => i.provider === 'google');
                  if (target) setUnlinkTarget(target);
                }}
              />

              {/* Email row (informational) */}
              {linked.has('email') && (
                <ProviderRow
                  icon={<Mail className="h-5 w-5" />}
                  title="Email & Password"
                  subtitle={user?.email ?? ''}
                  linked
                  busy={false}
                  onLink={() => {}}
                  onUnlink={() => {
                    const target = identities?.find((i) => i.provider === 'email');
                    if (target) setUnlinkTarget(target);
                  }}
                />
              )}

              {/* Phone row (informational) */}
              {linked.has('phone') && (
                <ProviderRow
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="Phone (OTP)"
                  subtitle={identities?.find((i) => i.provider === 'phone')?.identity_data?.phone ?? 'Linked'}
                  linked
                  busy={false}
                  onLink={() => {}}
                  onUnlink={() => {
                    const target = identities?.find((i) => i.provider === 'phone');
                    if (target) setUnlinkTarget(target);
                  }}
                />
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Ownership is verified by the provider (Google confirms the email address it returns).
            Unlinking a provider removes only the sign-in method — your rides, rentals, payments,
            reviews, saved vehicles, and message history remain on this account.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unlink {unlinkTarget ? PROVIDER_LABEL[unlinkTarget.provider] ?? unlinkTarget.provider : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You'll no longer be able to sign in with this provider. Your account and all
              existing data (rides, rentals, payments, reviews, saved vehicles, messages)
              are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyProvider}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlink} disabled={!!busyProvider}>
              {busyProvider ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlink className="h-4 w-4 mr-2" />}
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProviderRow({
  icon, title, subtitle, linked, busy, onLink, onUnlink,
}: {
  icon: React.ReactNode; title: string; subtitle: string; linked: boolean; busy: boolean;
  onLink: () => void; onUnlink: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2">
            {title}
            {linked && <Badge variant="secondary" className="text-xs">Linked</Badge>}
          </div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
      </div>
      {linked ? (
        <Button variant="outline" size="sm" onClick={onUnlink} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlink className="h-4 w-4 mr-2" />}
          Unlink
        </Button>
      ) : (
        <Button size="sm" onClick={onLink} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
          Link
        </Button>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.5-1.72 4.4-5.5 4.4-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.48l2.63-2.53C16.79 3.6 14.61 2.6 12 2.6 6.94 2.6 2.85 6.69 2.85 12S6.94 21.4 12 21.4c6.92 0 9.15-4.85 9.15-7.35 0-.5-.05-.9-.11-1.29H12z"/>
    </svg>
  );
}

export default ConnectedAccounts;
