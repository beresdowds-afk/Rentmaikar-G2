import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, PenLine, CreditCard, CheckCircle2, AlertTriangle } from "lucide-react";
import SignaturePad from "@/components/legal/SignaturePad";
import PersonaVerification from "@/components/verification/PersonaVerification";
import { toast } from "sonner";
import { ProxyNotificationPrefs } from "@/components/proxy/ProxyNotificationPrefs";

type Step = "loading" | "invalid" | "identity" | "sign" | "card" | "done";

export default function ProxyConsentPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [ctx, setCtx] = useState<any>(null);
  const [step, setStep] = useState<Step>("loading");
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const uaRef = useRef<string>(navigator.userAgent);

  const load = async () => {
    if (!token) { setStep("invalid"); return; }
    const { data, error } = await supabase.rpc("get_proxy_consent_context" as any, { _token: token });
    if (error || !data || (Array.isArray(data) && !data.length)) { setStep("invalid"); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setCtx(row);
    if (row.consent_status === "signed") setStep("card");
    else if (row.identity_status !== "verified") setStep("identity");
    else setStep("sign");
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const submitConsent = async () => {
    if (!signature) return toast.error("Please sign to consent");
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_proxy_consent" as any, {
      _token: token, _signature: signature, _ip: null, _user_agent: uaRef.current,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message ?? "Could not submit consent");
    toast.success("Consent recorded");
    setStep("card");
    load();
  };

  const tokenizeMock = async () => {
    // Real integration would call Paystack/PayPal SDKs and pass back the token.
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("proxy-consent-manager", {
      body: {
        action: "tokenize_card", token,
        provider: "paystack", card_token: `tok_${crypto.randomUUID()}`,
        card_last4: "4242", card_brand: "Visa", card_exp_month: 12, card_exp_year: 2028,
      },
    });
    setSubmitting(false);
    if (error || !data?.ok) return toast.error("Could not save card");
    toast.success("Card linked. You may close this window.");
    setStep("done");
  };

  if (step === "loading") return <FullPage><Loader2 className="h-6 w-6 animate-spin" /></FullPage>;
  if (step === "invalid") return (
    <FullPage>
      <Alert variant="destructive"><AlertTriangle className="h-4 w-4" />
        <AlertTitle>Invalid or expired link</AlertTitle>
        <AlertDescription>Please ask the driver to send you a fresh consent link.</AlertDescription>
      </Alert>
    </FullPage>
  );

  return (
    <FullPage>
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle>Proxy billing consent</CardTitle>
          <CardDescription>
            {ctx?.driver_name} has listed you as their proxy card holder on Rentmaikar. Complete the three steps below
            to authorize your card to be charged for their rental payments. You can request revocation at any time by
            contacting admin support.
          </CardDescription>
          <div className="flex gap-2 pt-2">
            <Badge variant={ctx?.identity_status === "verified" ? "default" : "outline"}>1. Identity</Badge>
            <Badge variant={ctx?.consent_status === "signed" ? "default" : "outline"}>2. Sign consent</Badge>
            <Badge variant={step === "done" ? "default" : "outline"}>3. Add card</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === "identity" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" /> Verify your identity with Persona</div>
              <PersonaVerification
                subject={"proxy" as any}
                subjectRole={"proxy" as any}
                subjectRef={ctx?.proxy_account_id}
                fields={{ name: ctx?.proxy_full_name ?? "" }}
                onComplete={() => setTimeout(load, 1500)}
                buttonLabel="Start identity verification"
              />
              <p className="text-xs text-muted-foreground">Once verification returns "completed" the sign step will unlock. Refresh if needed.</p>
            </div>
          )}

          {step === "sign" && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-2">
                <p className="font-medium flex items-center gap-2"><PenLine className="h-4 w-4" /> Consent statement</p>
                <p>
                  I, <strong>{ctx?.proxy_full_name}</strong>, authorize Rentmaikar to charge my card for rental
                  payments owed by <strong>{ctx?.driver_name}</strong>. I confirm I am the legal owner of the card
                  being provided, and I understand this authorization remains in effect until admin-mediated revocation.
                </p>
              </div>
              <SignaturePad onSignatureChange={setSignature} />
              <Button onClick={submitConsent} disabled={submitting || !signature}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Submit signed consent
              </Button>
            </div>
          )}

          {step === "card" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm"><CreditCard className="h-4 w-4" /> Add your card</div>
              <p className="text-sm text-muted-foreground">
                Your card is tokenized by our payment provider. Rentmaikar never sees or stores your full card number.
              </p>
              <Button onClick={tokenizeMock} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                Continue to secure card entry
              </Button>
            </div>
          )}

          {step === "done" && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Consent complete</AlertTitle>
              <AlertDescription>You may close this window. The driver has been notified.</AlertDescription>
            </Alert>
          )}

          {ctx?.proxy_account_id && (step === "card" || step === "done") && (
            <ProxyNotificationPrefs
              proxyId={ctx.proxy_account_id}
              consentToken={token}
              initial={ctx.notification_prefs ?? null}
              phoneAvailable={!!ctx.proxy_phone}
              title="Your alert preferences"
              description="Pick how Rentmaikar reaches you about this proxy authorization. You can change this any time from the link in future emails."
            />
          )}
        </CardContent>
      </Card>
    </FullPage>
  );
}

function FullPage({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">{children}</div>;
}
