import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Smartphone, Info, CheckCircle2, Loader2 } from "lucide-react";
import SmsConsentCheckboxes from "@/components/registration/SmsConsentCheckboxes";
import SmsProgramDetails from "@/components/registration/SmsProgramDetails";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { recordSmsConsentPair } from "@/lib/sms-consent";

/**
 * Public, optional SMS opt-in web form.
 *
 * This is the page referenced in the A2P 10DLC campaign registration as the
 * standalone web-form opt-in: it shows the exact program keywords, opt-in timing,
 * and two optional, unchecked-by-default consent checkboxes.
 */
const SmsOptIn = () => {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [service, setService] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone_number")
        .eq("user_id", user.id)
        .maybeSingle();
      const existing = (data as { phone_number?: string | null } | null)?.phone_number;
      if (existing) setPhone(existing);
    })();
  }, [user?.id]);

  const submit = async () => {
    if (!user?.id) {
      toast({
        title: "Sign in to save your SMS preference",
        description: "SMS consent is tied to your Rentmaikar account.",
      });
      return;
    }
    if (!phone.trim()) {
      toast({
        title: "Add your mobile number",
        description: "We need the number that should receive the messages.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    await recordSmsConsentPair({
      userId: user.id,
      phoneNumber: phone.trim(),
      serviceConsent: service,
      marketingConsent: marketing,
      source: "sms-opt-in-page",
    });
    setSaving(false);
    setSaved(true);
    toast({
      title: "SMS preferences saved",
      description:
        service || marketing
          ? "Your opt-in has been recorded. Reply STOP at any time to opt out."
          : "You are opted out of Rentmaikar text messages.",
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Seo
        title="SMS Opt-In & Text Message Program | Rentmaikar"
        description="Optionally opt in to Rentmaikar text messages. See our SMS program keywords (START, STOP, HELP), message frequency and when messages are sent. Consent is never required to use Rentmaikar."
        path="/sms-opt-in"
      />
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Smartphone className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">
            SMS opt-in &amp; text message program
          </h1>
        </div>

        <p className="text-muted-foreground mb-8">
          Rentmaikar text messages are entirely optional. You can use every part of
          Rentmaikar — creating an account, submitting an application, renting a vehicle
          and making payments — without ever opting in to SMS.
        </p>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Opt in to Rentmaikar text messages</CardTitle>
            <CardDescription>
              Both options below are optional and unchecked by default. Consent is not a
              condition of purchasing or using Rentmaikar services.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!user && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to
                  save your SMS preferences to your account. You can review the full program
                  details below without signing in.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="smsOptInPhone">Mobile number</Label>
              <Input
                id="smsOptInPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+1 555 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Include your country code. This is the number that will receive messages.
              </p>
            </div>

            <SmsConsentCheckboxes
              smsServiceConsent={service}
              smsMarketingConsent={marketing}
              onSmsServiceConsentChange={setService}
              onSmsMarketingConsentChange={setMarketing}
            />

            <div className="flex items-center gap-3">
              <Button onClick={submit} disabled={saving || !user}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save my SMS preferences"
                )}
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary" /> Preference recorded
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Program keywords &amp; message timing</CardTitle>
            <CardDescription>
              Rentmaikar — account, rental, application, payment, support and optional
              promotional messages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SmsProgramDetails bare />
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default SmsOptIn;
