import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, RefreshCw, Search, ShieldCheck, Link2 } from "lucide-react";

interface Props {
  scope: "driver" | "owner" | "admin";
  userId?: string;
}


interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_type: string;
  status: string;
  currency: string;
  amount: number | string;
  total_amount: number | string;
  driver_id: string | null;
  owner_id: string | null;
  rental_id: string | null;
  payment_id: string | null;
  description: string | null;
  line_items: any;
  metadata: any;
  due_date: string | null;
  issued_at: string;
  paid_at: string | null;
  created_at: string;
}

interface ReceiptRow {
  id: string;
  receipt_number: string;
  amount: number | string;
  currency: string;
  payment_id: string | null;
  invoice_id: string | null;
  created_at: string;
}

interface RentalRow {
  id: string;
  monthly_rate?: number | null;
  daily_rate?: number | null;
  weekly_rate?: number | null;
  security_deposit_amount?: number | null;
  security_deposit_status?: string | null;
  security_deposit_invoice_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

const money = (v: number | string | null | undefined, ccy?: string) =>
  `${ccy ?? ""} ${Number(v ?? 0).toFixed(2)}`.trim();

const statusColor: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  pending: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  issued: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  draft: "bg-muted text-muted-foreground",
  void: "bg-muted text-muted-foreground line-through",
  refunded: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

function extractPeriod(inv: InvoiceRow): { label: string; from?: string; to?: string } {
  const md = inv.metadata ?? {};
  const li = Array.isArray(inv.line_items) ? inv.line_items : [];
  const from = md.period_start ?? md.billing_period_start ?? li[0]?.period_start ?? null;
  const to = md.period_end ?? md.billing_period_end ?? li[0]?.period_end ?? null;
  if (from && to) {
    return {
      from, to,
      label: `${new Date(from).toLocaleDateString()} → ${new Date(to).toLocaleDateString()}`,
    };
  }
  if (inv.due_date) return { label: `Due ${new Date(inv.due_date).toLocaleDateString()}` };
  return { label: new Date(inv.issued_at).toLocaleDateString() };
}

function extractAgreedRate(inv: InvoiceRow, rental?: RentalRow | null): string | null {
  const md = inv.metadata ?? {};
  const li = Array.isArray(inv.line_items) ? inv.line_items : [];
  const agreed = md.agreed_rate ?? md.rate ?? li[0]?.unit_price ?? null;
  const unit = md.rate_unit ?? md.unit ?? li[0]?.unit ?? "";
  if (agreed) return `${money(agreed, inv.currency)}${unit ? ` / ${unit}` : ""}`;
  if (rental) {
    if (rental.weekly_rate) return `${money(rental.weekly_rate, inv.currency)} / week`;
    if (rental.daily_rate) return `${money(rental.daily_rate, inv.currency)} / day`;
    if (rental.monthly_rate) return `${money(rental.monthly_rate, inv.currency)} / month`;
  }
  return null;
}

export function InvoiceStatusPanel({ scope, userId }: Props) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [receipts, setReceipts] = useState<Record<string, ReceiptRow>>({});
  const [rentals, setRentals] = useState<Record<string, RentalRow>>({});
  const [depositLinks, setDepositLinks] = useState<Record<string, string>>({}); // rental_id -> deposit invoice id
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid" | "deposit">("all");

  const load = async () => {
    setLoading(true);
    let query = supabase.from("invoices").select("*").order("created_at", { ascending: false });
    if (scope === "driver" && userId) query = query.eq("driver_id", userId);
    if (scope === "owner" && userId) query = query.eq("owner_id", userId);

    if (scope === "admin") query = query.limit(500);
    const { data: inv, error } = await query;
    if (error) { toast.error("Failed to load invoices"); setLoading(false); return; }
    const list = (inv ?? []) as InvoiceRow[];
    setInvoices(list);

    const rentalIds = Array.from(new Set(list.map(i => i.rental_id).filter(Boolean))) as string[];
    const invoiceIds = list.map(i => i.id);
    const [rc, rr] = await Promise.all([
      invoiceIds.length
        ? supabase.from("receipts").select("*").in("invoice_id", invoiceIds)
        : Promise.resolve({ data: [] as ReceiptRow[] } as any),
      rentalIds.length
        ? supabase.from("rentals").select("id, monthly_rate, daily_rate, weekly_rate, security_deposit_amount, security_deposit_status, security_deposit_invoice_id, start_date, end_date").in("id", rentalIds)
        : Promise.resolve({ data: [] as RentalRow[] } as any),
    ]);
    const receiptMap: Record<string, ReceiptRow> = {};
    (rc.data ?? []).forEach((r: ReceiptRow) => { if (r.invoice_id) receiptMap[r.invoice_id] = r; });
    setReceipts(receiptMap);
    const rentalMap: Record<string, RentalRow> = {};
    const depMap: Record<string, string> = {};
    (rr.data ?? []).forEach((r: RentalRow) => {
      rentalMap[r.id] = r;
      if (r.security_deposit_invoice_id) depMap[r.id] = r.security_deposit_invoice_id;
    });
    setRentals(rentalMap);
    setDepositLinks(depMap);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId, scope]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invoices.filter(inv => {
      if (filter === "unpaid" && ["paid", "void", "refunded"].includes(inv.status)) return false;
      if (filter === "paid" && inv.status !== "paid") return false;
      if (filter === "deposit" && inv.invoice_type !== "deposit") return false;
      if (!term) return true;
      return [inv.invoice_number, inv.description, inv.invoice_type, inv.status].some(v =>
        String(v ?? "").toLowerCase().includes(term));
    });
  }, [invoices, q, filter]);

  const downloadReceipt = async (receiptId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch("https://bwvocmhcledbwqlpcswp.functions.supabase.co/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "render_html", kind: "receipt", id: receiptId }),
      });
      const html = await res.text();
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    } catch { toast.error("Unable to open receipt"); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Invoice Status
          </CardTitle>
          <CardDescription>
            Billing period, agreed rate, security deposit linkage, payment state, and receipt downloads.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoice #, description, status…" className="pl-8" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {(["all", "unpaid", "paid", "deposit"] as const).map(k => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
                {k[0].toUpperCase() + k.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Type / Period</TableHead>
                <TableHead>Agreed rate</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Deposit link</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Receipt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No invoices</TableCell></TableRow>
              )}
              {filtered.map(inv => {
                const rental = inv.rental_id ? rentals[inv.rental_id] : null;
                const period = extractPeriod(inv);
                const rate = extractAgreedRate(inv, rental);
                const depositInvId = inv.rental_id ? depositLinks[inv.rental_id] : undefined;
                const isDeposit = inv.invoice_type === "deposit";
                const receipt = receipts[inv.id];
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{inv.invoice_number}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{inv.invoice_type}</Badge>
                      <div className="text-xs mt-1">{period.label}</div>
                    </TableCell>
                    <TableCell className="text-sm">{rate ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm font-medium">{money(inv.total_amount, inv.currency)}</TableCell>
                    <TableCell className="text-xs">
                      {isDeposit ? (
                        <Badge variant="outline" className="text-[10px]">This is the deposit</Badge>
                      ) : depositInvId ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Link2 className="h-3 w-3" /> deposit {rental?.security_deposit_status ?? "held"}
                        </span>
                      ) : rental ? (
                        <span className="text-muted-foreground">no deposit</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${statusColor[inv.status] ?? ""}`}>{inv.status}</Badge>
                      {inv.paid_at && (
                        <div className="text-[11px] text-muted-foreground mt-1">paid {new Date(inv.paid_at).toLocaleDateString()}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {receipt ? (
                        <Button size="sm" variant="ghost" onClick={() => downloadReceipt(receipt.id)}>
                          <Download className="h-4 w-4 mr-1" /> {receipt.receipt_number}
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default InvoiceStatusPanel;
