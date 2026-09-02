import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

interface Row {
  payment_id: string; payment_status: string; payment_amount: number; currency: string;
  invoice_id: string | null; invoice_number: string | null; invoice_status: string | null;
  receipt_id: string | null; receipt_number: string | null; receipt_status: string | null;
  discrepancy: string; created_at: string;
}

const badge = (d: string) => d === "ok" ? "default" : "destructive";

export default function BillingReconciliationPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyMismatch, setOnlyMismatch] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("billing_reconciliation_view" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = onlyMismatch ? rows.filter(r => r.discrepancy !== "ok") : rows;
  const counts = rows.reduce((acc, r) => { acc[r.discrepancy] = (acc[r.discrepancy] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 max-w-7xl mx-auto px-4">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Billing Reconciliation</h1>
            <p className="text-muted-foreground">Mismatches between payment status, invoice, and receipt.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOnlyMismatch(v => !v)}>
              {onlyMismatch ? "Show all" : "Only mismatches"}
            </Button>
            <Button size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {(["ok","missing_receipt","invoice_not_marked_paid","receipt_without_completed_payment","amount_mismatch"] as const).map(k => (
            <Card key={k}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{k.split("_").join(" ")}</p>
                <p className="text-2xl font-bold">{counts[k] ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>All clear</AlertTitle>
            <AlertDescription>No discrepancies detected in the last 500 payments.</AlertDescription></Alert>
        ) : (
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Payment</TableHead><TableHead>Amount</TableHead>
                <TableHead>Invoice</TableHead><TableHead>Receipt</TableHead>
                <TableHead>Discrepancy</TableHead><TableHead>When</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.payment_id}>
                    <TableCell className="font-mono text-xs">{r.payment_id.slice(0,8)} <Badge variant="outline">{r.payment_status}</Badge></TableCell>
                    <TableCell>{r.currency} {Number(r.payment_amount).toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{r.invoice_number ?? "—"} {r.invoice_status && <Badge variant="outline">{r.invoice_status}</Badge>}</TableCell>
                    <TableCell className="text-xs">{r.receipt_number ?? "—"} {r.receipt_status && <Badge variant="outline">{r.receipt_status}</Badge>}</TableCell>
                    <TableCell><Badge variant={badge(r.discrepancy) as never}>{r.discrepancy.split("_").join(" ")}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
