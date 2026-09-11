import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ownerPortalLinkService, OwnerPortalTokenRecord } from '@/services/ownerPortalLinkService';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, ShieldAlert, Clock, ArrowRight, Loader2, KeyRound, Phone, Car } from 'lucide-react';
import { ImpersonationProvider } from '@/contexts/ImpersonationContext';
import OwnerDashboard from '@/pages/OwnerDashboard';

export default function OwnerPortalAccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'verifying' | 'valid' | 'already_used' | 'expired' | 'invalid'>('verifying');
  const [record, setRecord] = useState<OwnerPortalTokenRecord | null>(null);
  const [ownerInfo, setOwnerInfo] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let active = true;

    async function verify() {
      if (!token) {
        if (active) setStatus('invalid');
        return;
      }

      try {
        const res = await ownerPortalLinkService.verifyAndConsumeToken(token);
        if (!active) return;

        if (res.valid && res.ownerId) {
          setStatus('valid');
          setOwnerInfo({ id: res.ownerId, name: res.ownerName || 'Valued Owner' });
          if (res.record) setRecord(res.record);
        } else if (res.reason === 'already_used') {
          setStatus('already_used');
          if (res.record) setRecord(res.record);
        } else if (res.reason === 'expired') {
          setStatus('expired');
          if (res.record) setRecord(res.record);
        } else {
          setStatus('invalid');
        }
      } catch (err) {
        console.error('Portal token verification error:', err);
        if (active) setStatus('invalid');
      }
    }

    verify();

    return () => {
      active = false;
    };
  }, [token]);

  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
        <Header />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center p-6 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-foreground">Verifying One-Time Portal Link</h2>
              <p className="text-sm text-muted-foreground">
                Connecting securely to your Rentmaikar Owner Portal...
              </p>
            </div>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  // If valid, mount OwnerDashboard with ImpersonationProvider for this owner!
  if (status === 'valid' && ownerInfo) {
    return (
      <ImpersonationProvider
        value={{
          viewAsUserId: ownerInfo.id,
          role: 'owner',
          displayName: ownerInfo.name,
        }}
      >
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Authenticated One-Time Access:</strong> Welcome, {ownerInfo.name}. You are logged in via your secure, personalized link to complete vehicle details and phone verification.
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
            Single-Use Token Redeemed
          </span>
        </div>
        <OwnerDashboard />
      </ImpersonationProvider>
    );
  }

  // Error States: already used, expired, or invalid
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="flex-1 container max-w-lg mx-auto py-12 px-4 flex items-center justify-center">
        <Card className="w-full shadow-md border-border/80">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
              {status === 'expired' ? (
                <Clock className="h-6 w-6 text-destructive" />
              ) : (
                <ShieldAlert className="h-6 w-6 text-destructive" />
              )}
            </div>
            <CardTitle className="text-2xl font-bold">
              {status === 'already_used'
                ? 'Portal Link Already Redeemed'
                : status === 'expired'
                ? 'Portal Link Expired'
                : 'Invalid Portal Link'}
            </CardTitle>
            <CardDescription className="text-sm mt-1.5">
              {status === 'already_used'
                ? 'For your security, this personalized owner portal link can only be used once and has already been accessed.'
                : status === 'expired'
                ? 'This personalized owner portal link has passed its validity period and can no longer be used.'
                : 'We could not find a valid owner portal session matching this security link.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {record && (
              <div className="rounded-lg bg-muted/60 p-3.5 text-xs space-y-1.5 border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account:</span>
                  <span className="font-medium text-foreground">{record.owner_name}</span>
                </div>
                {record.used_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">First Accessed:</span>
                    <span className="font-medium text-foreground">
                      {new Date(record.used_at).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Security Policy:</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Single-Use Enforced (Anti-Sharing)
                  </span>
                </div>
              </div>
            )}

            <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200">
              <KeyRound className="h-4 w-4" />
              <AlertTitle className="text-xs font-semibold">How to access your Owner Portal</AlertTitle>
              <AlertDescription className="text-xs mt-1 space-y-1">
                <p>
                  You can sign in directly to your Rentmaikar owner account at any time using your registered email or phone number.
                </p>
                <p>
                  If you did not complete your vehicle details or phone verification, our support team can generate a fresh one-time link for you.
                </p>
              </AlertDescription>
            </Alert>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <Button
                className="flex-1 gap-2"
                onClick={() => navigate('/owner/sign-in')}
              >
                Sign In to Owner Portal
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => navigate('/support')}
              >
                <Phone className="h-4 w-4" />
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
