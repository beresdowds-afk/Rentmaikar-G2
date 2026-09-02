import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';

type Provider = 'supabase' | 'custom';

export function PhoneOtpProviderSettings() {
  const [provider, setProvider] = useState<Provider>('supabase');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('platform_kv_settings')
        .select('value')
        .eq('key', 'phone_otp_provider')
        .maybeSingle();
      const v = (data?.value as { provider?: Provider } | null)?.provider;
      if (v === 'custom' || v === 'supabase') setProvider(v);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_kv_settings')
        .upsert(
          { key: 'phone_otp_provider', value: { provider } },
          { onConflict: 'key' },
        );
      if (error) throw error;
      toast.success('Phone OTP provider updated');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Phone OTP delivery
        </CardTitle>
        <CardDescription>
          Choose which channel delivers the SMS verification codes used for phone sign-in and 2FA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <RadioGroup value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <div className="flex items-start gap-3 p-3 rounded-md border">
                <RadioGroupItem value="supabase" id="prov-supabase" className="mt-1" />
                <div>
                  <Label htmlFor="prov-supabase" className="font-medium">Managed (Lovable Cloud)</Label>
                  <p className="text-sm text-muted-foreground">
                    Codes are delivered by the built-in phone auth provider. Simplest setup.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-md border">
                <RadioGroupItem value="custom" id="prov-custom" className="mt-1" />
                <div>
                  <Label htmlFor="prov-custom" className="font-medium">Rentmaikar-managed (Twilio)</Label>
                  <p className="text-sm text-muted-foreground">
                    Uses the connected Twilio account with your own sender number and rate limits.
                    Requires the Twilio connector to be linked and <code>TWILIO_PHONE_NUMBER</code> to be set.
                  </p>
                </div>
              </div>
            </RadioGroup>

            <Alert>
              <AlertDescription>
                Changes take effect immediately for new sign-in attempts.
              </AlertDescription>
            </Alert>

            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save changes
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PhoneOtpProviderSettings;
