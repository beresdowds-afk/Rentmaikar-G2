import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Context {
  referee_name: string;
  driver_name: string;
  already_submitted: boolean;
}

export default function RefereeAttestation() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const tokenLooksValid = /^[a-f0-9]{40,}$/i.test(token);
  const [loading, setLoading] = useState(tokenLooksValid);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [error, setError] = useState<string | null>(
    !token ? "This attestation link is missing its token." :
    !tokenLooksValid ? "This attestation link is invalid or has expired." : null
  );
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"positive" | "negative" | null>(null);

  useEffect(() => {
    if (!tokenLooksValid) return;
    (async () => {
      try {
        const base = import.meta.env.VITE_SUPABASE_URL as string;
        const res = await fetch(`${base}/functions/v1/referee-attestation?token=${encodeURIComponent(token)}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "This attestation link is invalid or has expired.");
        setCtx(body);
      } catch (e: any) {
        setError(e?.message ?? "Could not load attestation");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, tokenLooksValid]);

  async function submit(response: "positive" | "negative") {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("referee-attestation", {
        body: { token, response, comments },
      });
      if (error) throw error;
      setDone(response);
    } catch (e: any) {
      setError(e?.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Confidential Referee Attestation
          </CardTitle>
          <CardDescription>
            Your response is confidential. Attesting does <strong>not</strong> place you under any financial
            obligation, guarantee, or liability on the driver's behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {error && (
            <Alert variant="destructive"><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
          )}
          {!loading && ctx && !done && !ctx.already_submitted && (
            <>
              <p>Hello <strong>{ctx.referee_name}</strong>,</p>
              <p><strong>{ctx.driver_name}</strong> has listed you as a referee on their Rentmaikar driver application.
                Do you attest to their suitability as a rideshare driver?</p>
              <Textarea
                placeholder="Optional comments (only shared with Rentmaikar admins)"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
              />
              <div className="flex gap-3">
                <Button className="flex-1" disabled={submitting} onClick={() => submit("positive")}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Yes, I attest
                </Button>
                <Button className="flex-1" variant="destructive" disabled={submitting} onClick={() => submit("negative")}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                  No, I do not attest
                </Button>
              </div>
            </>
          )}
          {!loading && ctx?.already_submitted && !done && (
            <Alert><AlertTitle>Already submitted</AlertTitle><AlertDescription>Thank you — your response has already been recorded.</AlertDescription></Alert>
          )}
          {done === "positive" && (
            <Alert><AlertTitle>Thank you</AlertTitle><AlertDescription>Your positive attestation has been recorded confidentially.</AlertDescription></Alert>
          )}
          {done === "negative" && (
            <Alert><AlertTitle>Response recorded</AlertTitle><AlertDescription>Thank you. Our administrators will review the application.</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
