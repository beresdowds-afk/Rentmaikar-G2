import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Status = { paystack: { configured: boolean }; opay: { configured: boolean; environment: string } };

// SUPABASE_URL is available at build time via Vite env
const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const CHECKLIST = [
  {
    provider: "Paystack (Nigeria + future GH / ZA / KE / TG / EG)",
    secrets: ["PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY", "PAYSTACK_WEBHOOK_SECRET"],
    webhook: { name: "Paystack webhook URL", url: `${FN_BASE}/paystack-webhook`, events: "charge.success, charge.failed, transfer.success, transfer.failed" },
    dashboardUrl: "https://dashboard.paystack.com/#/settings/developers",
  },
  {
    provider: "Opay (Nigeria)",
    secrets: ["OPAY_MERCHANT_ID", "OPAY_PUBLIC_KEY", "OPAY_SECRET_KEY", "OPAY_ENVIRONMENT"],
    webhook: { name: "Opay callback URL", url: `${FN_BASE}/opay-webhook`, events: "cashier notification (SUCCESS / FAIL / CLOSE)" },
    dashboardUrl: "https://merchant.opaycheckout.com/",
  },
  {
    provider: "PayPal (USA)",
    secrets: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_MODE"],
    webhook: { name: "Not required — capture happens synchronously via Orders API", url: "", events: "" },
    dashboardUrl: "https://developer.paypal.com/dashboard/",
  },
];

export function PSPConfigChecklist() {
  const [status, setStatus] = useState<Status | null>(null);
  const [paypalOk, setPaypalOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const [psp, paypal] = await Promise.all([
      supabase.functions.invoke("get-psp-config"),
      supabase.functions.invoke("get-paypal-config").catch(() => ({ data: null })),
    ]);
    setStatus((psp.data as Status) ?? null);
    setPaypalOk(Boolean((paypal.data as any)?.configured));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("Copied to clipboard");
  };

  const providerStatus = (name: string): boolean => {
    if (name.startsWith("Paystack")) return status?.paystack.configured ?? false;
    if (name.startsWith("Opay")) return status?.opay.configured ?? false;
    if (name.startsWith("PayPal")) return paypalOk ?? false;
    return false;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Payment Provider Configuration</CardTitle>
          <CardDescription>
            Live status of each PSP. Add the listed secrets in Secrets Management, then paste the webhook URL into the provider dashboard.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {CHECKLIST.map((p) => {
          const ok = providerStatus(p.provider);
          return (
            <div key={p.provider} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{p.provider}</div>
                {ok ? (
                  <Badge className="bg-green-500/15 text-green-700 border-green-500/30 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Configured
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1">
                    <AlertTriangle className="h-3 w-3" /> Missing credentials
                  </Badge>
                )}
              </div>

              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Required secrets</div>
                <div className="flex flex-wrap gap-1.5">
                  {p.secrets.map((s) => (
                    <code key={s} className="text-xs bg-muted px-2 py-0.5 rounded">{s}</code>
                  ))}
                </div>
              </div>

              {p.webhook.url && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">{p.webhook.name}</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{p.webhook.url}</code>
                    <Button variant="ghost" size="sm" onClick={() => copy(p.webhook.url)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Subscribe to: {p.webhook.events}</p>
                </div>
              )}

              <a href={p.dashboardUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                Open provider dashboard →
              </a>
            </div>
          );
        })}

        {!loading && status && !status.paystack.configured && !status.opay.configured && !paypalOk && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No payment providers configured</AlertTitle>
            <AlertDescription>
              Drivers cannot check out until at least one PSP has its credentials set. Buttons will render in a disabled "not configured" state.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
