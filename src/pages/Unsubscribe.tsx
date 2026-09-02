import { useCallback, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, MailX, ShieldAlert } from "lucide-react";
import Seo from "@/components/seo/Seo";

type PageState =
  | "loading"
  | "confirm"
  | "already_unsubscribed"
  | "invalid"
  | "submitting"
  | "success"
  | "error";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<PageState>("loading");

  useEffect(() => {
    let cancelled = false;
    const validate = async () => {
      if (!token) {
        setState("invalid");
        return;
      }
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.valid) setState("confirm");
        else if (data.reason === "already_unsubscribed") setState("already_unsubscribed");
        else setState("invalid");
      } catch {
        if (!cancelled) setState("error");
      }
    };
    validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirmUnsubscribe = useCallback(async () => {
    if (!token) return;
    setState("submitting");
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    if (error) {
      setState("error");
      return;
    }
    if (data?.success) setState("success");
    else if (data?.reason === "already_unsubscribed") setState("already_unsubscribed");
    else setState("error");
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Seo
        title="Unsubscribe | Rentmaikar"
        description="Manage your Rentmaikar email preferences."
        path="/unsubscribe"
        noindex
      />
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <MailX className="mb-2 h-10 w-10 text-primary" aria-hidden />
          <CardTitle className="text-xl">Email preferences</CardTitle>
          <CardDescription>
            {(state === "confirm" || state === "submitting") &&
              "Confirm that you want to stop receiving non-essential emails from Rentmaikar."}
            {state === "success" && "You have been unsubscribed."}
            {state === "already_unsubscribed" && "This address is already unsubscribed."}
            {state === "invalid" && "This unsubscribe link is invalid or has expired."}
            {state === "error" && "Something went wrong. Please try again."}
            {state === "loading" && "Validating your link…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {state === "loading" && (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
          )}

          {(state === "confirm" || state === "submitting") && (
            <Button onClick={confirmUnsubscribe} disabled={state === "submitting"} className="w-full">
              {state === "submitting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unsubscribing…
                </>
              ) : (
                "Confirm unsubscribe"
              )}
            </Button>
          )}

          {state === "success" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
              You will no longer receive these emails. Important account and safety
              notices may still be sent where required.
            </div>
          )}

          {state === "invalid" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden />
              If you believe this is a mistake, contact support from your dashboard.
            </div>
          )}

          {state === "error" && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          )}

          <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Back to Rentmaikar
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
