import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletLedgerPanel } from "@/components/payments/WalletLedgerPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadDocumentPdf, downloadHtmlAsPdf } from "@/lib/document-pdf";
import { buildReversalHtml, reversalFileName, reversalTitle, type ReversalDocument } from "@/lib/credit-note";
import { toast } from "sonner";
import { CreditCard, Download, ExternalLink, FileText, Loader2, Receipt, RefreshCw, RotateCcw, Search, Send, ShieldCheck } from "lucide-react";


interface PaymentRow {
  id: string; amount: number; currency: string; status: string; purpose: string | null;
  payment_method: string | null; transaction_id: string | null; created_at: string;
  settled_at: string | null; driver_id: string | null; owner_id: string | null;
}
interface SubRow {
  id: string; status: string; started_at: string; expires_at: string | null;
  auto_renew: boolean | null; payment_method: string | null;
  subscription_plans: { name: string; plan_type: string; price: number; currency: string; billing_interval: string } | null;
}
interface DocRow {
  id: string; created_at: string; currency: string; status: string;
  invoice_number?: string; receipt_number?: string; total_amount?: number; amount?: number;
  due_date?: string | null; invoice_type?: string | null; payment_method?: string | null;
}
interface DisputeRow {
  id: string; payment_id: string; provider: string; provider_reference: string | null;
  amount: number | null; currency: string | null; status: string; reason: string | null;
  resolution_notes: string | null; opened_at: string; resolved_at: string | null;
}

/** Payment statuses that represent a reversal, refund or dispute. */
const REVERSAL_STATUSES = ["refunded", "partially_refunded", "reversed", "chargeback", "disputed"];


const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(Number(amount ?? 0));
  } catch {
    return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  }
};

const PURPOSE_LABELS: Record<string, string> = {
  rental: "Rental payment",
  security_deposit: "Security deposit",
  late_fee: "Late fee",
  subscription_training: "Driver training subscription",
  subscription_insurance: "Insurance subscription",
  subscription_roadside: "Roadside support subscription",
};

const statusVariant = (s: string) =>
  s === "completed" || s === "paid" || s === "active" ? "default"
    : s === "failed" || s === "expired" || s === "cancelled" ? "destructive"
      : "secondary";

/**
 * Unified billing history for drivers and owners: current subscription status,
 * subscription periods, every payment, and all invoices/receipts.
 */
export default function BillingHistoryPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [invoices, setInvoices] = useState<DocRow[]>([]);
  const [receipts, setReceipts] = useState<DocRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Search & advanced filters (shared across payments, invoices and receipts).
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [pay, sub, inv, rcp, dsp] = await Promise.all([
      supabase.from("payments")
        .select("id, amount, currency, status, purpose, payment_method, transaction_id, created_at, settled_at, driver_id, owner_id")
        .or(`driver_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("user_subscriptions")
        .select("id, status, started_at, expires_at, auto_renew, payment_method, subscription_plans(name, plan_type, price, currency, billing_interval)")
        .eq("user_id", user.id).order("started_at", { ascending: false }),
      supabase.from("invoices")
        .select("id, invoice_number, status, total_amount, currency, due_date, invoice_type, created_at")
        .or(`driver_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("receipts")
        .select("id, receipt_number, status, amount, currency, payment_method, created_at")
        .or(`driver_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("payment_disputes")
        .select("id, payment_id, provider, provider_reference, amount, currency, status, reason, resolution_notes, opened_at, resolved_at")
        .order("opened_at", { ascending: false }).limit(100),
    ]);
    setPayments((pay.data as PaymentRow[]) ?? []);
    setSubs((sub.data as unknown as SubRow[]) ?? []);
    setInvoices((inv.data as DocRow[]) ?? []);
    setReceipts((rcp.data as DocRow[]) ?? []);
    setDisputes((dsp.data as DisputeRow[]) ?? []);
    setLoading(false);
  };


  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const activeSubs = useMemo(
    () => subs.filter((s) => s.status === "active" && (!s.expires_at || new Date(s.expires_at) > new Date())),
    [subs],
  );
  const totalPaid = useMemo(
    () => payments.filter((p) => p.status === "completed")
      .reduce<Record<string, number>>((acc, p) => {
        acc[p.currency] = (acc[p.currency] ?? 0) + Number(p.amount);
        return acc;
      }, {}),
    [payments],
  );

  const providers = useMemo(
    () => Array.from(new Set([
      ...payments.map((p) => p.payment_method),
      ...receipts.map((r) => r.payment_method),
    ].filter(Boolean) as string[])).sort(),
    [payments, receipts],
  );

  const periodOptions = useMemo(
    () => subs.map((s) => ({
      id: s.id,
      label: `${s.subscription_plans?.name ?? "Plan"} · ${new Date(s.started_at).toLocaleDateString()} – ${s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "ongoing"}`,
      start: new Date(s.started_at).getTime(),
      end: s.expires_at ? new Date(s.expires_at).getTime() : Date.now() + 3.15e10,
    })),
    [subs],
  );

  const activePeriod = useMemo(
    () => periodOptions.find((p) => p.id === periodFilter) ?? null,
    [periodOptions, periodFilter],
  );

  const inWindow = (iso: string) => {
    const t = new Date(iso).getTime();
    if (fromDate && t < new Date(fromDate).getTime()) return false;
    if (toDate && t > new Date(toDate).getTime() + 86_400_000 - 1) return false;
    if (activePeriod && (t < activePeriod.start || t > activePeriod.end)) return false;
    return true;
  };

  const q = query.trim().toLowerCase();
  const matches = (...values: Array<string | number | null | undefined>) =>
    !q || values.filter((v) => v !== null && v !== undefined)
      .some((v) => String(v).toLowerCase().includes(q));

  const filteredPayments = useMemo(
    () => payments.filter((p) =>
      inWindow(p.created_at) &&
      (statusFilter === "all" || p.status === statusFilter) &&
      (providerFilter === "all" || p.payment_method === providerFilter) &&
      matches(p.transaction_id, p.purpose, p.payment_method, p.amount, p.currency, p.status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, query, fromDate, toDate, statusFilter, providerFilter, activePeriod],
  );

  const filteredInvoices = useMemo(
    () => invoices.filter((i) =>
      inWindow(i.created_at) &&
      (statusFilter === "all" || i.status === statusFilter) &&
      matches(i.invoice_number, i.invoice_type, i.total_amount, i.currency, i.status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, query, fromDate, toDate, statusFilter, activePeriod],
  );

  const filteredReceipts = useMemo(
    () => receipts.filter((r) =>
      inWindow(r.created_at) &&
      (providerFilter === "all" || r.payment_method === providerFilter) &&
      matches(r.receipt_number, r.payment_method, r.amount, r.currency)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [receipts, query, fromDate, toDate, providerFilter, activePeriod],
  );

  /**
   * Credit notes and refund receipts derived from reversed / refunded payments
   * and from recorded payment disputes.
   */
  const reversalDocs = useMemo<ReversalDocument[]>(() => {
    const short = (id: string) => id.slice(0, 8).toUpperCase();
    const paymentById = new Map(payments.map((p) => [p.id, p]));

    const disputedPaymentIds = new Set(disputes.map((d) => d.payment_id));

    // Disputes take precedence over the plain reversed/disputed payment row.
    const fromPayments: ReversalDocument[] = payments
      .filter((p) => REVERSAL_STATUSES.includes(p.status) && !disputedPaymentIds.has(p.id))
      .map((p) => {
        const isCredit = p.status === "disputed" || p.status === "chargeback";
        return {
          kind: (isCredit ? "credit_note" : "refund_receipt") as ReversalDocument["kind"],
          reference: `${isCredit ? "CN" : "RR"}-${short(p.id)}`,
          amount: Number(p.amount ?? 0),
          currency: p.currency,
          issuedAt: p.settled_at ?? p.created_at,
          originalPaidAt: p.created_at,
          originalReference: p.transaction_id,
          provider: p.payment_method,
          purpose: PURPOSE_LABELS[p.purpose ?? "rental"] ?? (p.purpose ?? "Payment").replace(/_/g, " "),
          status: p.status.replace(/_/g, " "),
          reason: null,
          recipientName: user?.email ?? null,
        };
      });

    const fromDisputes: ReversalDocument[] = disputes.map((d) => {
      const p = paymentById.get(d.payment_id);
      return {
        kind: "credit_note" as const,
        reference: `CN-${short(d.id)}`,
        amount: Number(d.amount ?? p?.amount ?? 0),
        currency: d.currency ?? p?.currency ?? "USD",
        issuedAt: d.resolved_at ?? d.opened_at,
        originalPaidAt: p?.created_at ?? null,
        originalReference: d.provider_reference ?? p?.transaction_id ?? null,
        provider: d.provider ?? p?.payment_method ?? null,
        purpose: p ? (PURPOSE_LABELS[p.purpose ?? "rental"] ?? (p.purpose ?? "Payment").replace(/_/g, " ")) : "Disputed payment",
        status: d.status.replace(/_/g, " "),
        reason: d.reason,
        notes: d.resolution_notes,
        recipientName: user?.email ?? null,
      };
    });

    return [...fromDisputes, ...fromPayments]
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  }, [payments, disputes, user?.email]);

  const filteredReversals = useMemo(
    () => reversalDocs.filter((d) =>
      inWindow(d.issuedAt) &&
      (providerFilter === "all" || d.provider === providerFilter) &&
      matches(d.reference, d.originalReference, d.provider, d.amount, d.currency, d.status, d.reason)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reversalDocs, query, fromDate, toDate, providerFilter, activePeriod],
  );

  const downloadReversal = async (doc: ReversalDocument) => {
    setDownloading(doc.reference);
    try {
      await downloadHtmlAsPdf(buildReversalHtml(doc), reversalFileName(doc));
      toast.success(`${reversalTitle(doc.kind)} downloaded`);
    } catch {
      toast.error("Could not generate the PDF");
    } finally {
      setDownloading(null);
    }
  };


  const filtersActive = Boolean(q || fromDate || toDate || statusFilter !== "all" ||
    providerFilter !== "all" || periodFilter !== "all");

  const resetFilters = () => {
    setQuery(""); setFromDate(""); setToDate("");
    setStatusFilter("all"); setProviderFilter("all"); setPeriodFilter("all");
  };

  const downloadPdf = async (kind: "invoice" | "receipt", id: string, reference?: string) => {
    setDownloading(id);
    try {
      await downloadDocumentPdf(kind, id, `${reference ?? kind}-rentmaikar.pdf`);
      toast.success(`${kind === "invoice" ? "Invoice" : "Receipt"} downloaded`);
    } catch {
      toast.error("Could not generate the PDF");
    } finally {
      setDownloading(null);
    }
  };

  const viewDoc = async (kind: "invoice" | "receipt", id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch("https://bwvocmhcledbwqlpcswp.functions.supabase.co/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "render_html", kind, id }),
      });
      const html = await res.text();
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    } catch {
      toast.error("Unable to open document");
    }
  };

  const emailDoc = async (kind: "invoice" | "receipt", id: string) => {
    const action = kind === "invoice" ? "send_invoice" : "send_receipt";
    const key = kind === "invoice" ? "invoice_id" : "receipt_id";
    const { data, error } = await supabase.functions.invoke("billing-portal", { body: { action, [key]: id } });
    if (error || !data?.ok) { toast.error("Send failed"); return; }
    toast.success(`${kind === "invoice" ? "Invoice" : "Receipt"} emailed`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Billing History | Rentmaikar"
        description="View your Rentmaikar payments, subscription periods, invoices and receipts in one place."
        path="/billing"
      />
      <Header />
      <main className="pt-24 pb-16 max-w-6xl mx-auto px-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Billing history</h1>
            <p className="text-muted-foreground">
              Payments, subscription periods, invoices and receipts for your account.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild><Link to="/subscriptions">Manage subscriptions</Link></Button>
            <Button size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Current subscription status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Current subscription status</CardTitle>
            <CardDescription>Active plans and the period each one covers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : activeSubs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active subscription. <Link className="underline" to="/subscriptions">Browse plans</Link>.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeSubs.map((s) => (
                  <div key={s.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{s.subscription_plans?.name ?? s.subscription_plans?.plan_type ?? "Plan"}</p>
                      <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {s.subscription_plans
                        ? `${money(Number(s.subscription_plans.price), s.subscription_plans.currency)} / ${s.subscription_plans.billing_interval}`
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(s.started_at).toLocaleDateString()} –{" "}
                      {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "ongoing"}
                      {s.auto_renew ? " · auto-renews" : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(totalPaid).length > 0 && (
              <p className="text-xs text-muted-foreground">
                Lifetime settled:{" "}
                {Object.entries(totalPaid).map(([c, v]) => money(v, c)).join(" · ")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" /> Search &amp; filters</CardTitle>
            <CardDescription>Narrow payments, invoices and receipts by date, subscription period, status or provider reference.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 lg:col-span-3">
              <Label htmlFor="billing-search" className="text-xs">Search</Label>
              <Input id="billing-search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Invoice or receipt number, provider reference, amount, purpose" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-from" className="text-xs">From date</Label>
              <Input id="billing-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-to" className="text-xs">To date</Label>
              <Input id="billing-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subscription period</Label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger><SelectValue placeholder="Any period" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any period</SelectItem>
                  {periodOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Any status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="paid">Invoice paid</SelectItem>
                  <SelectItem value="unpaid">Invoice unpaid</SelectItem>
                  <SelectItem value="overdue">Invoice overdue</SelectItem>
                  <SelectItem value="void">Invoice void</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Provider</Label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger><SelectValue placeholder="Any provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any provider</SelectItem>
                  {providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={resetFilters} disabled={!filtersActive}>
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="payments">
          <TabsList className="flex-wrap">
            <TabsTrigger value="payments">Payments ({filteredPayments.length})</TabsTrigger>
            <TabsTrigger value="periods">Subscription periods ({subs.length})</TabsTrigger>
            <TabsTrigger value="invoices">Invoices ({filteredInvoices.length})</TabsTrigger>
            <TabsTrigger value="receipts">Receipts ({filteredReceipts.length})</TabsTrigger>
            <TabsTrigger value="reversals">Credit notes &amp; refunds ({filteredReversals.length})</TabsTrigger>
            <TabsTrigger value="wallet">Wallet</TabsTrigger>

          </TabsList>

          <TabsContent value="payments" className="mt-4 space-y-2">
            {loading && <Skeleton className="h-16 w-full" />}
            {!loading && filteredPayments.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {filtersActive ? "No payments match these filters." : "No payments yet."}
              </p>
            )}
            {filteredPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4 shrink-0" />
                    {PURPOSE_LABELS[p.purpose ?? "rental"] ?? (p.purpose ?? "Payment").replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {new Date(p.created_at).toLocaleString()}
                    {p.payment_method ? ` · ${p.payment_method}` : ""}
                    {p.settled_at ? " · settled" : ""}
                    {p.transaction_id ? ` · ref ${p.transaction_id}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{money(Number(p.amount), p.currency)}</p>
                  <Badge variant={statusVariant(p.status)} className="text-[10px]">{p.status}</Badge>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="periods" className="mt-4 space-y-2">
            {!loading && subs.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No subscription history yet.</p>
            )}
            {subs.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.subscription_plans?.name ?? "Plan"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.started_at).toLocaleDateString()} –{" "}
                    {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "ongoing"}
                    {s.payment_method ? ` · ${s.payment_method}` : ""}
                  </p>
                </div>
                <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="invoices" className="mt-4 space-y-2">
            {!loading && filteredInvoices.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {filtersActive ? "No invoices match these filters." : "No invoices yet."}
              </p>
            )}
            {filteredInvoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> {i.invoice_number}</p>
                  <p className="text-sm">
                    {money(Number(i.total_amount ?? 0), i.currency)}{" "}
                    <Badge variant={statusVariant(i.status)} className="text-[10px]">{i.status}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(i.created_at).toLocaleDateString()}
                    {i.due_date ? ` · due ${new Date(i.due_date).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  <Button size="sm" variant="outline" disabled={downloading === i.id}
                    onClick={() => downloadPdf("invoice", i.id, i.invoice_number)}
                    aria-label={`Download invoice ${i.invoice_number ?? ""} as PDF`}>
                    {downloading === i.id
                      ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      : <Download className="h-4 w-4 mr-1" />}
                    Download
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => viewDoc("invoice", i.id)} aria-label="Open invoice">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => emailDoc("invoice", i.id)} aria-label="Email invoice">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="receipts" className="mt-4 space-y-2">
            {!loading && filteredReceipts.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {filtersActive ? "No receipts match these filters." : "No receipts yet."}
              </p>
            )}
            {filteredReceipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs flex items-center gap-1"><Receipt className="h-3 w-3" /> {r.receipt_number}</p>
                  <p className="text-sm">
                    {money(Number(r.amount ?? 0), r.currency)}{" "}
                    <Badge variant="outline" className="text-[10px]">{r.payment_method ?? "—"}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  <Button size="sm" variant="outline" disabled={downloading === r.id}
                    onClick={() => downloadPdf("receipt", r.id, r.receipt_number)}
                    aria-label={`Download receipt ${r.receipt_number ?? ""} as PDF`}>
                    {downloading === r.id
                      ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      : <Download className="h-4 w-4 mr-1" />}
                    Download
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => viewDoc("receipt", r.id)} aria-label="Open receipt">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => emailDoc("receipt", r.id)} aria-label="Email receipt">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="reversals" className="mt-4 space-y-2">
            {loading && <Skeleton className="h-16 w-full" />}
            {!loading && filteredReversals.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {filtersActive
                  ? "No credit notes or refund receipts match these filters."
                  : "No reversed, refunded or disputed payments."}
              </p>
            )}
            {filteredReversals.map((d) => (
              <div key={`${d.kind}-${d.reference}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs flex items-center gap-1">
                    <RotateCcw className="h-3 w-3" /> {d.reference}
                  </p>
                  <p className="text-sm flex flex-wrap items-center gap-1">
                    <span className="font-semibold">{money(Number(d.amount), d.currency)}</span>
                    <Badge variant={d.kind === "credit_note" ? "secondary" : "default"} className="text-[10px]">
                      {reversalTitle(d.kind)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{d.status}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    Issued {new Date(d.issuedAt).toLocaleString()}
                    {d.originalPaidAt ? ` · original payment ${new Date(d.originalPaidAt).toLocaleDateString()}` : ""}
                    {d.provider ? ` · ${d.provider}` : ""}
                    {d.reason ? ` · ${d.reason}` : ""}
                  </p>
                </div>
                <div className="shrink-0">
                  <Button size="sm" variant="outline" disabled={downloading === d.reference}
                    onClick={() => downloadReversal(d)}
                    aria-label={`Download ${reversalTitle(d.kind)} ${d.reference} as PDF`}>
                    {downloading === d.reference
                      ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      : <Download className="h-4 w-4 mr-1" />}
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>


          <TabsContent value="wallet" className="mt-4">
            <WalletLedgerPanel />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
