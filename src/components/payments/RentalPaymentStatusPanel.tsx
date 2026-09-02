import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/payment-config";
import { CheckCircle2, Clock, XCircle, AlertTriangle, Loader2, RotateCcw, Receipt } from "lucide-react";

interface RentalPaymentStatusPanelProps {
  rentalId: string;
  /** Bump to force an immediate refetch (e.g. after a checkout attempt completes). */
  refreshKey?: number | string;
  /** Called when the user clicks "Retry" on a failed payment. */
  onRetry?: (payment: { id: string; payment_method: string | null; amount: number }) => void;
}

type PaymentRow = {
  id: string;
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

type PayPalTxRow = {
  order_id: string;
  status: string;
  failure_reason: string | null;
  payment_id: string | null;
};

const statusMeta: Record<string, { label: string; icon: JSX.Element; className: string }> = {
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="h-4 w-4" />,
    className: "bg-green-500/15 text-green-700 border-green-500/30",
  },
  processing: {
    label: "Processing",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    className: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  },
  pending: {
    label: "Pending",
    icon: <Clock className="h-4 w-4" />,
    className: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  },
  failed: {
    label: "Failed",
    icon: <XCircle className="h-4 w-4" />,
    className: "bg-red-500/15 text-red-700 border-red-500/30",
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] ?? {
    label: status,
    icon: <AlertTriangle className="h-4 w-4" />,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

export function RentalPaymentStatusPanel({ rentalId, refreshKey, onRetry }: RentalPaymentStatusPanelProps) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rental-payment-status", rentalId],
    queryFn: async () => {
      const [
        { data: payments, error: payErr },
        { data: pptxs, error: ppErr },
        { data: pstxs, error: psErr },
        { data: optxs, error: opErr },
      ] = await Promise.all([
        supabase
          .from("payments")
          .select("id, amount, currency, status, payment_method, payment_frequency, transaction_id, failure_reason, created_at, processed_at")
          .eq("rental_id", rentalId)
          .order("created_at", { ascending: false })
          .limit(25),
        supabase.from("paypal_transactions")
          .select("order_id, status, failure_reason, payment_id").eq("rental_id", rentalId),
        supabase.from("paystack_transactions")
          .select("reference, status, failure_reason, payment_id, channel").eq("rental_id", rentalId),
        supabase.from("opay_transactions")
          .select("reference, status, failure_reason, payment_id").eq("rental_id", rentalId),
      ]);
      if (payErr) throw payErr;
      if (ppErr) throw ppErr;
      if (psErr) throw psErr;
      if (opErr) throw opErr;
      return {
        payments: (payments ?? []) as PaymentRow[],
        txs: (pptxs ?? []) as PayPalTxRow[],
        paystack: (pstxs ?? []) as Array<{ reference: string; status: string; failure_reason: string | null; payment_id: string | null; channel: string | null }>,
        opay: (optxs ?? []) as Array<{ reference: string; status: string; failure_reason: string | null; payment_id: string | null }>,
      };
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Immediate refetch when parent signals a checkout attempt just completed.
  useEffect(() => {
    if (refreshKey === undefined) return;
    refetch();
  }, [refreshKey, refetch]);

  // Realtime: refetch as soon as payments/paypal rows for this rental change.
  useEffect(() => {
    const channel = supabase
      .channel(`rental-payments-${rentalId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `rental_id=eq.${rentalId}` },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paypal_transactions", filter: `rental_id=eq.${rentalId}` },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paystack_transactions", filter: `rental_id=eq.${rentalId}` },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opay_transactions", filter: `rental_id=eq.${rentalId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rentalId, refetch]);

  const payments = data?.payments ?? [];
  const txByPayment = new Map<string, PayPalTxRow>();
  (data?.txs ?? []).forEach((t) => {
    if (t.payment_id) txByPayment.set(t.payment_id, t);
  });

  const totals = payments.reduce(
    (acc, p) => {
      const amt = Number(p.amount);
      if (p.status === "completed") acc.completed += amt;
      else if (p.status === "failed") acc.failed += amt;
      else acc.pending += amt;
      return acc;
    },
    { completed: 0, pending: 0, failed: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Status</CardTitle>
        <CardDescription>
          Real-time status of your payments for this rental. Auto-refreshes every 15s.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-lg font-bold text-green-700">
              {formatCurrency(totals.completed, (payments[0]?.currency as "USD" | "NGN" | (string & {})) || "USD")}
            </p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-700">
              {formatCurrency(totals.pending, (payments[0]?.currency as "USD" | "NGN" | (string & {})) || "USD")}
            </p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-lg font-bold text-red-700">
              {formatCurrency(totals.failed, (payments[0]?.currency as "USD" | "NGN" | (string & {})) || "USD")}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading payments…
          </div>
        ) : payments.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            No payments recorded for this rental yet.
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => {
              const tx = txByPayment.get(p.id);
              const failure = p.failure_reason ?? tx?.failure_reason ?? null;
              return (
                <div key={p.id} className="flex flex-col gap-2 p-3 border rounded-lg sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <StatusBadge status={p.status} />
                      <span className="font-medium">
                        {formatCurrency(Number(p.amount), (p.currency as "USD" | "NGN" | (string & {})) || "USD")}
                      </span>
                      {p.payment_method && (
                        <Badge variant="secondary" className="capitalize">{p.payment_method}</Badge>
                      )}
                      {p.payment_frequency && (
                        <span className="text-xs text-muted-foreground capitalize">{p.payment_frequency}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(p.created_at).toLocaleString()}
                      {p.processed_at && ` · Processed ${new Date(p.processed_at).toLocaleString()}`}
                    </p>
                    {p.transaction_id && (
                      <p className="text-xs text-muted-foreground font-mono">Ref: {p.transaction_id}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    {failure && (
                      <Alert variant="destructive" className="sm:max-w-xs py-2" data-testid={`payment-failure-${p.id}`}>
                        <AlertDescription className="text-xs">{failure}</AlertDescription>
                      </Alert>
                    )}
                    <div className="flex gap-2">
                      {p.status === "completed" && (
                        <Button asChild size="sm" variant="outline" data-testid={`view-receipt-${p.id}`}>
                          <Link to={`/rentals/${rentalId}/payments/${p.id}`}>
                            <Receipt className="h-3 w-3 mr-1" />Receipt
                          </Link>
                        </Button>
                      )}
                      {p.status === "failed" && onRetry && (
                        <Button
                          size="sm"
                          variant="default"
                          data-testid={`retry-payment-${p.id}`}
                          onClick={() => onRetry({ id: p.id, payment_method: p.payment_method, amount: Number(p.amount) })}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={() => refetch()}
          className="text-xs text-primary underline underline-offset-2"
        >
          Refresh now
        </button>
      </CardContent>
    </Card>
  );
}
