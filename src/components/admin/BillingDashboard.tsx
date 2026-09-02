import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Eye, Ban, Plus, FileText, Receipt, Activity, RefreshCw } from "lucide-react";

type Invoice = any;
type ReceiptRow = any;
type ActivityRow = any;

const statusColor = (s: string) => ({
  draft: "secondary", sent: "default", paid: "default", void: "destructive",
  overdue: "destructive", partial: "outline", issued: "default",
}[s] ?? "outline") as any;

export function BillingDashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    const [inv, rc, log] = await Promise.all([
      supabase.from("invoices").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("receipts").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("invoice_activity_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setInvoices(inv.data ?? []);
    setReceipts(rc.data ?? []);
    setActivity(log.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const invoke = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("billing-portal", { body });
    if (error) { toast.error(error.message); return null; }
    return data;
  };

  const sendInvoice = async (id: string) => {
    const r = await invoke({ action: "send_invoice", invoice_id: id });
    if (r?.ok) { toast.success("Invoice sent"); load(); }
    else if (r) toast.error("Send failed");
  };
  const sendReceipt = async (id: string) => {
    const r = await invoke({ action: "send_receipt", receipt_id: id });
    if (r?.ok) { toast.success("Receipt sent"); load(); }
    else if (r) toast.error("Send failed");
  };
  const voidInvoice = async (id: string) => {
    const reason = window.prompt("Void reason?"); if (!reason) return;
    await invoke({ action: "void_invoice", invoice_id: id, reason });
    toast.success("Invoice voided"); load();
  };
  const viewDoc = async (kind: "invoice" | "receipt", id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const url = `https://bwvocmhcledbwqlpcswp.functions.supabase.co/billing-portal`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: "render_html", kind, id }),
    });
    const html = await res.text();
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
  };

  const filteredInv = invoices.filter(i =>
    !search || i.invoice_number?.toLowerCase().includes(search.toLowerCase())
    || i.description?.toLowerCase().includes(search.toLowerCase())
    || i.driver_id?.includes(search) || i.rental_id?.includes(search)
  );
  const filteredRc = receipts.filter(r =>
    !search || r.receipt_number?.toLowerCase().includes(search.toLowerCase())
    || r.transaction_id?.toLowerCase().includes(search.toLowerCase())
    || r.driver_id?.includes(search)
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Invoices & Receipts</CardTitle>
            <CardDescription>Generate billing invoices, dispatch payment receipts, and audit every send.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Invoice</Button>
              </DialogTrigger>
              <CreateInvoiceDialog onCreated={() => { setShowCreate(false); load(); }} />
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Input placeholder="Search by number, driver, rental, txn ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
        </CardContent>
      </Card>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices"><FileText className="h-4 w-4 mr-1" />Invoices ({filteredInv.length})</TabsTrigger>
          <TabsTrigger value="receipts"><Receipt className="h-4 w-4 mr-1" />Receipts ({filteredRc.length})</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="h-4 w-4 mr-1" />Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Number</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead>
                <TableHead>Status</TableHead><TableHead>Email</TableHead><TableHead>Due</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredInv.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                    <TableCell><Badge variant="outline">{i.invoice_type}</Badge></TableCell>
                    <TableCell>{i.currency} {Number(i.total_amount).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={statusColor(i.status)}>{i.status}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={i.email_status === "sent" ? "default" : i.email_status === "failed" ? "destructive" : "outline"}>
                        {i.email_status ?? "pending"}
                      </Badge>
                      {i.email_attempts > 0 && <span className="text-[10px] text-muted-foreground ml-1">×{i.email_attempts}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => viewDoc("invoice", i.id)}><Eye className="h-3 w-3" /></Button>
                      <Button size="sm" variant={i.email_status === "failed" ? "destructive" : "ghost"}
                        onClick={() => sendInvoice(i.id)} disabled={i.status === "void"}
                        title={i.email_status === "failed" ? `Retry (last error: ${i.email_error ?? "unknown"})` : "Send / resend"}
                      ><Send className="h-3 w-3" /></Button>
                      {i.status !== "void" && <Button size="sm" variant="ghost" onClick={() => voidInvoice(i.id)}><Ban className="h-3 w-3" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredInv.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No invoices yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="receipts">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Number</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead>
                <TableHead>Status</TableHead><TableHead>Email</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredRc.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.receipt_number}</TableCell>
                    <TableCell>{r.currency} {Number(r.amount).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline">{r.payment_method ?? "—"}</Badge></TableCell>
                    <TableCell><Badge variant={statusColor(r.status)}>{r.status}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={r.email_status === "sent" ? "default" : r.email_status === "failed" ? "destructive" : "outline"}>
                        {r.email_status ?? "pending"}
                      </Badge>
                      {r.email_attempts > 0 && <span className="text-[10px] text-muted-foreground ml-1">×{r.email_attempts}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => viewDoc("receipt", r.id)}><Eye className="h-3 w-3" /></Button>
                      <Button size="sm" variant={r.email_status === "failed" ? "destructive" : "ghost"}
                        onClick={() => sendReceipt(r.id)}
                        title={r.email_status === "failed" ? `Retry (last error: ${r.email_error ?? "unknown"})` : "Send / resend"}
                      ><Send className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRc.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No receipts yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>When</TableHead><TableHead>Entity</TableHead><TableHead>Action</TableHead>
                <TableHead>Channel</TableHead><TableHead>Actor</TableHead><TableHead>Details</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {activity.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{a.entity_type}</Badge> <span className="font-mono text-[10px]">{String(a.entity_id).slice(0, 8)}</span></TableCell>
                    <TableCell><Badge>{a.action}</Badge></TableCell>
                    <TableCell className="text-xs">{a.channel ?? "—"}</TableCell>
                    <TableCell className="font-mono text-[10px]">{a.actor_id ? String(a.actor_id).slice(0, 8) : "system"}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate">{JSON.stringify(a.details)}</TableCell>
                  </TableRow>
                ))}
                {activity.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No activity yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CreateInvoiceDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    driver_id: "", rental_id: "", vehicle_id: "", owner_id: "",
    invoice_type: "rental", amount: "", tax_amount: "0", currency: "USD",
    description: "", due_date: "", recipient_email: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Amount required"); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("billing-portal", {
      body: {
        action: "create_invoice",
        ...form,
        amount: Number(form.amount), tax_amount: Number(form.tax_amount || 0),
        driver_id: form.driver_id || null, rental_id: form.rental_id || null,
        vehicle_id: form.vehicle_id || null, owner_id: form.owner_id || null,
        due_date: form.due_date || null,
      },
    });
    setSaving(false);
    if (error || !data?.ok) { toast.error(error?.message ?? "Failed"); return; }
    toast.success(`Invoice ${data.invoice.invoice_number} created`);
    onCreated();
  };

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Type</Label>
          <Select value={form.invoice_type} onValueChange={(v) => set("invoice_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["rental", "subscription", "deposit", "fee", "adjustment", "other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Currency</Label>
          <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="NGN">NGN</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Amount *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
        <div><Label>Tax</Label><Input type="number" step="0.01" value={form.tax_amount} onChange={(e) => set("tax_amount", e.target.value)} /></div>
        <div><Label>Driver ID</Label><Input value={form.driver_id} onChange={(e) => set("driver_id", e.target.value)} /></div>
        <div><Label>Owner ID</Label><Input value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)} /></div>
        <div><Label>Rental ID</Label><Input value={form.rental_id} onChange={(e) => set("rental_id", e.target.value)} /></div>
        <div><Label>Vehicle ID</Label><Input value={form.vehicle_id} onChange={(e) => set("vehicle_id", e.target.value)} /></div>
        <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
        <div><Label>Recipient Email</Label><Input type="email" value={form.recipient_email} onChange={(e) => set("recipient_email", e.target.value)} /></div>
        <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create Invoice"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
