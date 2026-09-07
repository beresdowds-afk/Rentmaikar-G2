import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, QrCode, ShieldCheck, Trash2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface EnrollState {
  factorId: string;
  qrCode: string;
  secret: string;
}

/**
 * Google Authenticator / Authy (TOTP) enrolment backed by the platform's
 * native multi-factor auth. Complements the existing SMS/WhatsApp 2FA.
 */
export const AuthenticatorAppSetup = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [code, setCode] = useState('');

  const loadFactors = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const totp = (data?.totp ?? []).find((f) => f.status === 'verified');
      setVerifiedFactorId(totp?.id ?? null);
    } catch (error) {
      console.error('Error loading authenticator factors:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  const startEnrollment = async () => {
    setBusy(true);
    try {
      // Clean up any half-finished enrolments so re-running always works.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      await Promise.all(
        (existing?.totp ?? [])
          .filter((f) => f.status !== 'verified')
          .map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })),
      );

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Authenticator app ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;
      setEnroll({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (error) {
      toast.error('Could not start setup', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async () => {
    if (!enroll || code.length !== 6) return;
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (challengeError) throw challengeError;

      const { error } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.id,
        code,
      });
      if (error) throw error;

      toast.success('Authenticator app enabled');
      setEnroll(null);
      setCode('');
      await loadFactors();
    } catch (error) {
      toast.error('Invalid code', {
        description: error instanceof Error ? error.message : 'Check the 6-digit code and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async () => {
    if (!verifiedFactorId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactorId });
      if (error) throw error;
      toast.success('Authenticator app removed');
      await loadFactors();
    } catch (error) {
      toast.error('Could not remove authenticator', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Authenticator app (Google Authenticator)
            </CardTitle>
            <CardDescription>
              Use time-based codes from Google Authenticator, Authy or 1Password instead of waiting for an SMS.
            </CardDescription>
          </div>
          {verifiedFactorId && (
            <Badge className="bg-green-600">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              Enabled
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : verifiedFactorId ? (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>
                Your authenticator app is active. You'll be asked for a 6-digit code when signing in.
              </AlertDescription>
            </Alert>
            <Button variant="outline" onClick={() => void removeFactor()} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove authenticator app
            </Button>
          </div>
        ) : enroll ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <img src={enroll.qrCode} alt="Authenticator app QR code" className="h-44 w-44 rounded-md border bg-background p-2" />
              <p className="text-xs text-muted-foreground">
                Scan with your authenticator app, or enter this setup key manually:
              </p>
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs tracking-widest">{enroll.secret}</code>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp-code">Enter the 6-digit code</Label>
              <div className="flex gap-2">
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  className="font-mono tracking-widest"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <Button onClick={() => void confirmEnrollment()} disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                </Button>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setEnroll(null); setCode(''); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button onClick={() => void startEnrollment()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
            Set up authenticator app
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default AuthenticatorAppSetup;
