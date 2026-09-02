import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileText, Receipt, Download, Send, RefreshCw } from "lucide-react";

interface Props { userId?: string }

export function DriverBillingPanel({ userId }: Props) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    const [inv, rc] = await Promise.all([
      supabase.from("invoices").select("*").eq("driver_id", userId).order("created_at", { ascending: false }),
      supabase.from("receipts").select("*").eq("driver_id", userId).order("created_at", { ascending: false }),
    ]);
    setInvoices(inv.data ?? []);
    setReceipts(rc.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [userId]);

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
    } catch (e) { toast.error("Unable to open document"); }
  };

  const resend = async (kind: "invoice" | "receipt", id: string) => {
    const action = kind === "invoice" ? "send_invoice" : "send_receipt";
    const key = kind === "invoice" ? "invoice_id" : "receipt_id";
    const { data, error } = await supabase.functions.invoke("billing-portal", { body: { action, [key]: id } });
    if (error || !data?.ok) { toast.error("Send failed"); return; }
    toast.success(`${kind === "invoice" ? "Invoice" : "Receipt"} emailed`);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Billing Documents</CardTitle>
          <CardDescription>All your invoices and payment receipts in one place.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="invoices">
          <TabsList>
            <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
            <TabsTrigger value="receipts">Receipts ({receipts.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="invoices" className="space-y-2 mt-4">
            {invoices.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No invoices yet</p>}
            {invoices.map(i => (
              <div key={i.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-mono text-xs">{i.invoice_number}</p>
                  <p className="text-sm">{i.currency} {Number(i.total_amount).toFixed(2)} · <Badge variant="outline" className="text-[10px]">{i.status}</Badge></p>
                  {i.due_date && <p className="text-xs text-muted-foreground">Due {new Date(i.due_date).toLocaleDateString()}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => viewDoc("invoice", i.id)}><Download className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => resend("invoice", i.id)}><Send className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="receipts" className="space-y-2 mt-4">
            {receipts.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No receipts yet</p>}
            {receipts.map(r => (
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
        </Tabs>
      </CardContent>
    </Card>
  );
}
