import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface AuthenticatorChallengeProps {
  factorId: string;
  onVerified: () => void;
  onCancel: () => void | Promise<void>;
}

/** Sign-in step for users enrolled in Google Authenticator / TOTP. */
export const AuthenticatorChallenge = ({ factorId, onVerified, onCancel }: AuthenticatorChallengeProps) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (error) throw error;
      onVerified();
    } catch (error) {
      toast.error('Invalid code', {
        description: error instanceof Error ? error.message : 'Try the latest code from your app.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Authenticator code
          </CardTitle>
          <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Code</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoFocus
              className="font-mono tracking-widest"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          <Button className="w-full" onClick={() => void verify()} disabled={busy || code.length !== 6}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Verify
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void onCancel()} disabled={busy}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthenticatorChallenge;
