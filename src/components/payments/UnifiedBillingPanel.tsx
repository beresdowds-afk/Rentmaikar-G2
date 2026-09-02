import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentMethodPicker } from "@/components/payments/PaymentMethodPicker";
import { PaymentPreflightGate } from "@/components/payments/PaymentPreflightGate";
import { WalletLedgerPanel } from "@/components/payments/WalletLedgerPanel";

import { toast } from "sonner";
import { FileText, Receipt, Download, Send, RefreshCw, CreditCard } from "lucide-react";

interface Props {
  userId?: string;
  role: "driver" | "owner";
  country: string;
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  rental: "Rental",
  security_deposit: "Security Deposit",
  late_fee: "Late Fee",
  fine: "Fine",
  training: "Driver Training",
  insurance: "Insurance",
  roadside_support: "Roadside Support",
  subscription: "Subscription",
  iot_device: "IoT Device",
  rent_to_own: "Rent-to-Own",
  extension: "Rental Extension",
  refund: "Refund",
};

const labelFor = (t?: string) => INVOICE_TYPE_LABELS[t ?? "rental"] ?? (t ? t.replace(/_/g, " ") : "Charge");

export function UnifiedBillingPanel({ userId, role, country }: Props) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const idField = role === "driver" ? "driver_id" : "owner_id";

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    const [inv, rc] = await Promise.all([
      supabase.from("invoices").select("*").eq(idField, userId).order("created_at", { ascending: false }),
      supabase.from("receipts").select("*").eq(idField, userId).order("created_at", { ascending: false }),
    ]);
    setInvoices(inv.data ?? []);
    setReceipts(rc.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [userId, role]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`billing-${role}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `${idField}=eq.${userId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts", filter: `${idField}=eq.${userId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, role]);

  const viewDoc = async (kind: "invoice" | "receipt", id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const url = `https://bwvocmhcledbwqlpcswp.functions.supabase.co/billing-portal`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "render_html", kind, id }),
      });
      const html = await res.text();
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    } catch { toast.error("Unable to open document"); }
  };

  const resend = async (kind: "invoice" | "receipt", id: string) => {
    const action = kind === "invoice" ? "send_invoice" : "send_receipt";
    const key = kind === "invoice" ? "invoice_id" : "receipt_id";
    const { data, error } = await supabase.functions.invoke("billing-portal", { body: { action, [key]: id } });
    if (error || !(data as any)?.ok) { toast.error("Send failed"); return; }
    toast.success(`${kind === "invoice" ? "Invoice" : "Receipt"} emailed`);
    load();
  };

  const types = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach((i) => s.add(i.invoice_type || "rental"));
    return Array.from(s);
  }, [invoices]);

  const filtered = filterType === "all" ? invoices : invoices.filter(i => (i.invoice_type || "rental") === filterType);
  const outstanding = filtered.filter((i) => !["paid", "void", "refunded"].includes(String(i.status).toLowerCase()));
  const totalOutstanding = outstanding.reduce((s, i) => s + Number(i.total_amount || 0), 0);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Billing & Payments</CardTitle>
            <CardDescription>
  {role === "owner"
    ? "View invoices, receipts, IoT device charges and other owner-related payments."
    : "View rental charges, deposits, training, fines and other driver-related payments."
  }
</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {outstanding.length > 0 && (
            <div className="mb-4 p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-sm">
              You have <strong>{outstanding.length}</strong> unpaid {outstanding.length === 1 ? "invoice" : "invoices"} totalling{" "}
              <strong>{outstanding[0]?.currency ?? ""} {totalOutstanding.toFixed(2)}</strong>. Pay each below.
            </div>
          )}

          {types.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1">
              <Button size="sm" variant={filterType === "all" ? "default" : "outline"} onClick={() => setFilterType("all")}>All</Button>
              {types.map((t) => (
                <Button key={t} size="sm" variant={filterType === t ? "default" : "outline"} onClick={() => setFilterType(t)}>
                  {labelFor(t)}
                </Button>
              ))}
            </div>
          )}

          <Tabs defaultValue="invoices">
            <TabsList>
              <TabsTrigger value="invoices">Invoices ({filtered.length})</TabsTrigger>
              <TabsTrigger value="receipts">Receipts ({receipts.length})</TabsTrigger>
              <TabsTrigger value="wallet">Wallet</TabsTrigger>
            </TabsList>
            <TabsContent value="invoices" className="space-y-2 mt-4">
              {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No invoices yet</p>}
              {filtered.map((i) => {
                const unpaid = !["paid", "void", "refunded"].includes(String(i.status).toLowerCase());
                return (
                  <div key={i.id} className="flex items-center justify-between p-3 border rounded-lg gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">{labelFor(i.invoice_type)}</Badge>
                        <span className="font-mono text-xs">{i.invoice_number}</span>
                        <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
                      </div>
                      <p className="text-sm mt-1">{i.currency} {Number(i.total_amount).toFixed(2)}</p>
                      {i.description && <p className="text-xs text-muted-foreground truncate max-w-md">{i.description}</p>}
                      {i.due_date && <p className="text-xs text-muted-foreground">Due {new Date(i.due_date).toLocaleDateString()}</p>}
                    </div>
                    <div className="flex gap-1 items-center">
                      {unpaid && (
                        <Button size="sm" onClick={() => setPayTarget(i)}>
                          <CreditCard className="h-4 w-4 mr-1" /> Pay
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => viewDoc("invoice", i.id)}><Download className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => resend("invoice", i.id)}><Send className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </TabsContent>
            <TabsContent value="receipts" className="space-y-2 mt-4">
              {receipts.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No receipts yet</p>}
              {receipts.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-mono text-xs flex items-center gap-1"><Receipt className="h-3 w-3" /> {r.receipt_number}</p>
                    <p className="text-sm">{r.currency} {Number(r.amount).toFixed(2)} · <Badge variant="outline" className="text-[10px]">{r.payment_method ?? "—"}</Badge></p>
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => viewDoc("receipt", r.id)}><Download className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => resend("receipt", r.id)}><Send className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="wallet" className="mt-4">
              <WalletLedgerPanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pay {labelFor(payTarget?.invoice_type)}</DialogTitle>
            <DialogDescription>
              Invoice {payTarget?.invoice_number} · {payTarget?.currency} {Number(payTarget?.total_amount || 0).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          {payTarget && (
            <PaymentPreflightGate
              operation={role === "driver" ? "driver_payment" : "owner_payout"}
              amount={Number(Number(payTarget.total_amount).toFixed(2))}
              currency={payTarget.currency ?? undefined}
              context={{ invoice_id: payTarget.id, invoice_type: payTarget.invoice_type }}
            >
              <PaymentMethodPicker
                country={country}
                amount={Number(Number(payTarget.total_amount).toFixed(2))}
                rentalId={payTarget.rental_id ?? undefined}
                vehicleId={payTarget.vehicle_id ?? undefined}
                driverId={role === "driver" ? userId : payTarget.driver_id ?? undefined}
                description={`Invoice ${payTarget.invoice_number} · ${labelFor(payTarget.invoice_type)}`}
                onSuccess={() => {
                  toast.success("Payment received. Receipt will arrive shortly.");
                  setPayTarget(null);
                  setTimeout(load, 1500);
                }}
                onError={() => setPayTarget(null)}
              />
            </PaymentPreflightGate>
          )}

        </DialogContent>
      </Dialog>
    </>
  );
}

export default UnifiedBillingPanel;
