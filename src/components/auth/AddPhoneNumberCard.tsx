import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, CheckCircle2 } from 'lucide-react';
import PhoneOtpPanel from './PhoneOtpPanel';

/**
 * Lets a signed-in user attach a phone number to their EXISTING account and
 * verify it with an SMS OTP. No second profile or account is ever created.
 */
export function AddPhoneNumberCard() {
  const { user } = useAuth();
  const [phone, setPhone] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('phone, phone_verified')
      .eq('user_id', user.id)
      .maybeSingle();
    setPhone((data as any)?.phone ?? null);
    setVerified(Boolean((data as any)?.phone_verified));
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5" />
          Phone number
        </CardTitle>
        <CardDescription>
          Add a mobile number to your account and verify it with a one-time code.
          You can then sign in with your phone instead of your email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loading && phone && (
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 p-3">
            <span className="font-medium">{phone}</span>
            {verified ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" /> Verified
              </Badge>
            ) : (
              <Badge variant="outline">Not verified</Badge>
            )}
          </div>
        )}

        {open ? (
          <PhoneOtpPanel
            mode="link"
            initialPhone={phone ?? ''}
            onDone={() => { setOpen(false); void load(); }}
          />
        ) : (
          <Button variant="outline" onClick={() => setOpen(true)}>
            {phone && verified ? 'Change phone number' : phone ? 'Verify phone number' : 'Add phone number'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default AddPhoneNumberCard;
