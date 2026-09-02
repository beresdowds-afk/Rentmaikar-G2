import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileCheck, Play, Download } from "lucide-react";

interface Discrepancy {
  rental_id: string;
  driver_id: string | null;
  owner_id: string | null;
  code: string;
  detail: string;
  expected?: string | number | null;
  actual?: string | number | null;
  currency?: string | null;
}

const codeLabel: Record<string, string> = {
  missing_deposit_invoice: "Missing deposit invoice",
  deposit_amount_mismatch: "Deposit amount mismatch",
  deposit_invoice_link_mismatch: "Deposit link mismatch",
  rental_amount_off_agreed_rate: "Rental invoice off agreed rate",
  paid_invoice_missing_receipt: "Paid invoice missing receipt",
  receipt_amount_mismatch: "Receipt/invoice amount mismatch",
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);

export default function AdminRentalReconciliationPage() {
  const [start, setStart] = useState(daysAgo(30));
  const [end, setEnd] = useState(today());
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);
  const [rows, setRows] = useState<Discrepancy[]>([]);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("reconcile-rental-terms", {
        body: { start_date: new Date(start).toISOString(), end_date: new Date(end + "T23:59:59").toISOString() },
      });
      if (error || !(data as any)?.ok) { toast.error("Reconciliation failed"); setLoading(false); return; }
      setSummary((data as any).summary);
      setRows((data as any).discrepancies ?? []);
      toast.success(`Scanned ${(data as any).summary.rentals_scanned} rentals`);
    } finally { setLoading(false); }
  };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = ["rental_id","code","detail","expected","actual","currency","driver_id","owner_id"].join(",");
    const body = rows.map(r => [
      r.rental_id, r.code, `"${(r.detail ?? "").replace(/"/g, "'")}"`,
      r.expected ?? "", r.actual ?? "", r.currency ?? "", r.driver_id ?? "", r.owner_id ?? "",
    ].join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rental-recon-${start}_to_${end}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileCheck className="h-6 w-6" /> Rental Terms Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Cross-checks rentals, invoices, security deposit records, and receipt totals to make sure every amount matches the agreed terms.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
          <CardDescription>Scan created_at between these dates across rentals, invoices, and receipts.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3 items-end">
          <div className="grid gap-1"><Label>Start</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div className="grid gap-1"><Label>End</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
          <Button onClick={run} disabled={loading}><Play className="h-4 w-4 mr-1" /> {loading ? "Running…" : "Run reconciliation"}</Button>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <Stat label="Rentals scanned" value={summary.rentals_scanned} />
            <Stat label="Invoices scanned" value={summary.invoices_scanned} />
            <Stat label="Receipts scanned" value={summary.receipts_scanned} />
            <Stat label="Reconciled (paid)" value={summary.reconciled_paid_invoices} />
            <Stat label="Discrepancies" value={summary.discrepancy_count}
                  danger={summary.discrepancy_count > 0} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Discrepancies</CardTitle>
          <CardDescription>{rows.length === 0 ? "No issues in range." : "Every row below needs an admin review."}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rental</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-[11px]">{d.rental_id.slice(0, 8)}…</TableCell>
                  <TableCell><Badge variant="destructive" className="text-[10px]">{codeLabel[d.code] ?? d.code}</Badge></TableCell>
                  <TableCell className="text-xs">{d.expected ?? "—"} {d.currency ?? ""}</TableCell>
                  <TableCell className="text-xs">{d.actual ?? "—"} {d.currency ?? ""}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md">{d.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: any; danger?: boolean }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${danger ? "text-red-600" : ""}`}>{value ?? 0}</div>
    </div>
  );
}
