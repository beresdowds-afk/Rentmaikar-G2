import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/payment-config";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";

type Payment = {
  id: string;
  rental_id: string;
  driver_id: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  payment_frequency: string | null;
  transaction_id: string | null;
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
};

export default function PaymentReceipt() {
  const { rentalId, paymentId } = useParams<{ rentalId: string; paymentId: string }>();
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [providerTx, setProviderTx] = useState<Record<string, any> | null>(null);
  const [providerLabel, setProviderLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!paymentId || !rentalId) return;
      setLoading(true);
      const { data: pay, error: err } = await supabase
        .from("payments")
        .select("id, rental_id, driver_id, amount, currency, status, payment_method, payment_frequency, transaction_id, failure_reason, created_at, processed_at")
        .eq("id", paymentId)
        .eq("rental_id", rentalId)
        .maybeSingle();

      if (cancelled) return;
      if (err || !pay) {
        setError(err?.message ?? "Payment not found");
        setLoading(false);
        return;
      }
      const isAdmin = userRole === "admin";
      const isDriver = user?.id && pay.driver_id === user.id;
      if (!isAdmin && !isDriver) {
        setError("You don't have access to this receipt.");
        setLoading(false);
        return;
      }
      setPayment(pay as Payment);

      const [{ data: pp }, { data: ps }, { data: op }] = await Promise.all([
        supabase.from("paypal_transactions").select("order_id, status, gross_amount, currency, payer_email, captured_at, raw_payload")
          .eq("payment_id", pay.id).maybeSingle(),
        supabase.from("paystack_transactions").select("reference, status, channel, gateway_response, currency, amount, raw_payload")
          .eq("payment_id", pay.id).maybeSingle(),
        supabase.from("opay_transactions").select("reference, status, amount, currency, raw_payload")
          .eq("payment_id", pay.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (pp) { setProviderTx(pp); setProviderLabel("PayPal"); }
      else if (ps) { setProviderTx(ps); setProviderLabel("Paystack"); }
      else if (op) { setProviderTx(op); setProviderLabel("Opay"); }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [paymentId, rentalId, user?.id, userRole]);

  const currency = (payment?.currency as "USD" | "NGN" | (string & {})) || "USD";
  const providerRows = useMemo(() => {
    if (!providerTx) return [] as Array<[string, string]>;
    const rows: Array<[string, string]> = [];
    const skip = new Set(["raw_payload"]);
    for (const [k, v] of Object.entries(providerTx)) {
      if (skip.has(k) || v == null) continue;
      rows.push([k.replace(/_/g, " "), String(v)]);
    }
    return rows;
  }, [providerTx]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      </div>
    );
  }
  if (!payment) return null;

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto space-y-4 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="h-4 w-4 mr-2" />Save PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Payment receipt</CardTitle>
              <CardDescription>Rental {rentalId?.slice(0, 8)} · Payment {payment.id.slice(0, 8)}</CardDescription>
            </div>
            <Badge variant={payment.status === "completed" ? "default" : payment.status === "failed" ? "destructive" : "secondary"}>
              {payment.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Amount</p>
              <p className="text-lg font-semibold">{formatCurrency(Number(payment.amount), currency)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Method</p>
              <p className="font-medium capitalize">{payment.payment_method ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Frequency</p>
              <p className="font-medium capitalize">{payment.payment_frequency ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Reference</p>
              <p className="font-mono text-xs break-all">{payment.transaction_id ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Created</p>
              <p>{new Date(payment.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Processed</p>
              <p>{payment.processed_at ? new Date(payment.processed_at).toLocaleString() : "—"}</p>
            </div>
          </div>

          {payment.failure_reason && (
            <Alert variant="destructive">
              <AlertDescription>{payment.failure_reason}</AlertDescription>
            </Alert>
          )}

          {providerTx && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-semibold">{providerLabel} transaction</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {providerRows.map(([k, v]) => (
                    <div key={k}>
                      <p className="text-muted-foreground capitalize">{k}</p>
                      <p className="font-mono break-all">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
