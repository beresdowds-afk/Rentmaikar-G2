import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type State = "verifying" | "success" | "error";

const SubscriptionSuccessPage = () => {
  const [params] = useSearchParams();
  const { user, isLoading } = useAuth();
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState<string>("");
  const ran = useRef(false);

  useEffect(() => {
    if (isLoading || !user || ran.current) return;
    ran.current = true;

    (async () => {
      // Paystack returns ?reference=..., PayPal returns ?token=<order_id>
      const paystackRef = params.get("reference") || params.get("trxref");
      const paypalOrder = params.get("token");
      const planId = params.get("plan_id");

      let reference: string | null = null;
      let provider: "paystack" | "paypal" | null = null;
      if (paystackRef) {
        reference = paystackRef;
        provider = "paystack";
      } else if (paypalOrder) {
        reference = paypalOrder;
        provider = "paypal";
      }

      if (!reference || !provider) {
        setState("error");
        setMessage("Missing payment reference in URL.");
        return;
      }

      let plan_id = planId;
      if (!plan_id) {
        const pendingRaw = sessionStorage.getItem(`sub_pending_${reference}`);
        if (pendingRaw) {
          try {
            plan_id = (JSON.parse(pendingRaw) as { plan_id?: string }).plan_id ?? null;
          } catch { /* ignore */ }
        }
      }
      if (!plan_id) {
        setState("error");
        setMessage("Could not determine which plan was purchased.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("activate-subscription", {
        body: { plan_id, reference, provider },
      });
      if (error) {
        setState("error");
        setMessage(error.message || "Activation failed");
        return;
      }
      const status = (data as { status?: string })?.status;
      if (status === "active") {
        sessionStorage.removeItem(`sub_pending_${reference}`);
        setState("success");
        setMessage("Your subscription is now active.");
      } else {
        setState("error");
        setMessage("Payment was not confirmed. Please contact support if you were charged.");
      }
    })();
  }, [params, user, isLoading]);

  return (
    <div className="container max-w-md mx-auto py-16 px-4">
      <Card className="p-8 text-center space-y-4">
        {state === "verifying" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <h1 className="text-xl font-semibold">Verifying your payment…</h1>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
            <h1 className="text-xl font-semibold">Subscription active</h1>
            <p className="text-muted-foreground text-sm">{message}</p>
            <div className="flex gap-2 justify-center">
              <Button asChild variant="outline"><Link to="/subscriptions">View plans</Link></Button>
              <Button asChild><Link to="/driver/dashboard">Go to dashboard</Link></Button>
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-red-600" />
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">{message}</p>
            <Button asChild><Link to="/subscriptions">Back to plans</Link></Button>
          </>
        )}
      </Card>
    </div>
  );
};

export default SubscriptionSuccessPage;
