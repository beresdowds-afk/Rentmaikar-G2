import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Smartphone, Info, ExternalLink, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  fetchSmsConsentState,
  recordSmsConsent,
  smsConsentRecordsToCsv,
  downloadTextFile,
  type SmsConsentRecord,
} from '@/lib/sms-consent';


/**
 * SMS Consent & Preferences.
 *
 * Every change writes a new audit row (phone number, consent type, disclosure
 * text + version, source page, timestamp, user agent) so the opt-in/opt-out
 * path is verifiable for A2P 10DLC campaign review.
 */
export function SmsConsentPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'service' | 'marketing' | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [service, setService] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [history, setHistory] = useState<SmsConsentRecord[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data: profile }, state] = await Promise.all([
      supabase.from('profiles').select('phone_number').eq('user_id', user.id).maybeSingle(),
      fetchSmsConsentState(user.id),
    ]);
    setPhone((profile as { phone_number?: string | null } | null)?.phone_number ?? null);
    setService(!!state.service?.granted);
    setMarketing(!!state.marketing?.granted);
    setHistory(state.history);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (consentType: 'service' | 'marketing', granted: boolean) => {
    if (!user?.id) return;
    setSaving(consentType);
    const ok = await recordSmsConsent({
      userId: user.id,
      phoneNumber: phone,
      consentType,
      granted,
      source: 'profile-settings',
    });
    setSaving(null);
    if (!ok) {
      toast({ title: 'Could not save your SMS preference', description: 'Please try again.', variant: 'destructive' });
      return;
    }
    if (consentType === 'service') setService(granted);
    else setMarketing(granted);
    toast({
      title: granted ? 'SMS consent recorded' : 'SMS consent withdrawn',
      description: granted
        ? 'You will receive the text messages you opted in to. Reply STOP any time to opt out.'
        : 'You will no longer receive text messages for this category.',
    });
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          SMS consent &amp; preferences
        </CardTitle>
        <CardDescription>
          Text message consent is optional and never required to use Rentmaikar. Reply
          STOP to opt out or HELP for help at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your consent record…
          </div>
        ) : (
          <>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Mobile number on file: <strong>{phone ?? 'not provided yet'}</strong>. Message
                frequency varies. Message and data rates may apply. See our{' '}
                <Link to="/terms" className="text-primary hover:underline">Terms</Link> and{' '}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              </AlertDescription>
            </Alert>

            <Link
              to="/sms-opt-in"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="sms-program-link"
              className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              Review SMS keywords &amp; message timing
              <ExternalLink className="w-4 h-4" />
            </Link>



            <div className="flex items-start gap-3">
              <Checkbox
                id="panelSmsService"
                checked={service}
                disabled={saving !== null}
                onCheckedChange={(c) => update('service', c as boolean)}
              />
              <label htmlFor="panelSmsService" className="text-sm leading-relaxed cursor-pointer">
                <span className="font-medium text-foreground">Service text messages</span>
                <br />
                I agree to receive text messages from Rentmaikar regarding my account, vehicle
                rentals, applications, reservations, payments, customer support and service
                updates. Message frequency varies. Message and data rates may apply. Reply STOP
                to opt out or HELP for help. Consent is not a condition of purchasing or using
                Rentmaikar services.
              </label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="panelSmsMarketing"
                checked={marketing}
                disabled={saving !== null}
                onCheckedChange={(c) => update('marketing', c as boolean)}
              />
              <label htmlFor="panelSmsMarketing" className="text-sm leading-relaxed cursor-pointer">
                <span className="font-medium text-foreground">Promotional text messages</span>
                <br />
                I would like to receive optional promotional text messages from Rentmaikar,
                including special offers, vehicle availability and rental opportunities.
              </label>
            </div>

            {history.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">Consent history</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadTextFile(
                        `my-sms-consent-history-${new Date().toISOString().slice(0, 10)}.csv`,
                        smsConsentRecordsToCsv(history),
                      )
                    }
                  >
                    <Download className="w-4 h-4 mr-2" /> Export CSV
                  </Button>
                </div>
                <ul className="space-y-1">

                  {history.slice(0, 8).map((h) => (
                    <li key={h.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{h.consent_type} · {h.source}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant={h.granted ? 'default' : 'secondary'}>
                          {h.granted ? 'Opted in' : 'Opted out'}
                        </Badge>
                        {new Date(h.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default SmsConsentPanel;
