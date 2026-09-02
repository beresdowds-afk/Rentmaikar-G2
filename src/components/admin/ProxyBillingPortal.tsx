import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Ban, Eye, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ProxyStatusTimeline } from "@/components/proxy/ProxyStatusTimeline";
import { ProxyNotificationPrefs } from "@/components/proxy/ProxyNotificationPrefs";

export function ProxyBillingPortal() {
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [revokeReason, setRevokeReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase.from("driver_proxy_billing_accounts" as any).select("*").order("created_at", { ascending: false }).limit(200);
    if (query.trim()) q = q.ilike("proxy_email", `%${query.trim()}%`);
    const { data } = await q;
    setRows((data as any[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openDetails = async (row: any) => {
    setSelected(row);
    const { data } = await supabase.from("proxy_billing_audit_log" as any)
      .select("*").eq("proxy_account_id", row.id).order("created_at", { ascending: false });
    setAudit((data as any[]) ?? []);
  };

  const markVerified = async (row: any) => {
    const { error } = await supabase.functions.invoke("proxy-consent-manager", {
      body: { action: "mark_identity", proxy_account_id: row.id, status: "verified" },
    });
    if (error) return toast.error("Failed");
    toast.success("Identity marked verified");
    load(); if (selected?.id === row.id) openDetails(row);
  };

  const revoke = async () => {
    if (!selected) return;
    const { error } = await supabase.rpc("admin_revoke_proxy_billing" as any, { _proxy_id: selected.id, _reason: revokeReason });
    if (error) return toast.error(error.message);
    toast.success("Proxy revoked");
    setSelected(null); setRevokeReason(""); load();
  };

  const review = async (decision: "approved" | "rejected") => {
    if (!selected) return;
    const { error } = await supabase.rpc("admin_review_proxy_billing" as any, {
      _proxy_id: selected.id, _decision: decision, _notes: reviewNotes || null,
    });
    if (error) return toast.error(error.message);
    toast.success(decision === "approved" ? "Proxy approved" : "Proxy rejected");
    setReviewNotes(""); openDetails({ ...selected }); load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Proxy Billing Accounts</CardTitle>
          <CardDescription>Manage drivers who use another person's card. Every action is audit-logged.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Search by proxy email" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="w-64" />
          <Button variant="outline" size="icon" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proxy</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Identity</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Card</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.proxy_full_name}</div>
                  <div className="text-xs text-muted-foreground">{r.proxy_email}</div>
                </TableCell>
                <TableCell>{r.region}</TableCell>
                <TableCell><Badge variant="outline">{r.identity_status}</Badge></TableCell>
                <TableCell><Badge variant="outline">{r.consent_status}</Badge></TableCell>
                <TableCell><Badge>{r.status}</Badge></TableCell>
                <TableCell className="text-xs">{r.card_last4 ? `${r.card_brand ?? ""} ••• ${r.card_last4}` : "—"}</TableCell>
                <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openDetails(r)}><Eye className="h-4 w-4" /></Button>
                    {r.identity_status !== "verified" && (
                      <Button size="sm" variant="ghost" title="Mark identity verified" onClick={() => markVerified(r)}><ShieldCheck className="h-4 w-4" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No proxy accounts</TableCell></TableRow>
            )}
          </TableBody>
        </Table>

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Proxy details & audit log</DialogTitle></DialogHeader>
            {selected && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Proxy:</span> {selected.proxy_full_name}</div>
                  <div><span className="text-muted-foreground">Email:</span> {selected.proxy_email}</div>
                  <div><span className="text-muted-foreground">Phone:</span> {selected.proxy_phone ?? "—"}</div>
                  <div><span className="text-muted-foreground">Relationship:</span> {selected.proxy_relationship ?? "—"}</div>
                  <div><span className="text-muted-foreground">Identity:</span> {selected.identity_status}</div>
                  <div><span className="text-muted-foreground">Consent:</span> {selected.consent_status}</div>
                  <div><span className="text-muted-foreground">Card:</span> {selected.card_last4 ? `${selected.card_brand ?? ""} •••• ${selected.card_last4}` : "—"}</div>
                  <div><span className="text-muted-foreground">Status:</span> {selected.status}</div>
                </div>
                {selected.consent_signature && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Signed consent</p>
                    <img src={selected.consent_signature} alt="signature" className="border rounded max-h-40" />
                  </div>
                )}
                <div className="border rounded-lg p-3 bg-muted/30">
                  <p className="text-sm font-medium mb-3">Consent lifecycle</p>
                  <ProxyStatusTimeline proxy={selected} />
                </div>
                {selected.consent_status === "signed" && selected.admin_review_status !== "approved" && selected.admin_review_status !== "rejected" && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">Admin review</p>
                    <Textarea placeholder="Notes (optional)" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} maxLength={500} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => review("approved")}><CheckCircle2 className="h-4 w-4 mr-1" /> Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => review("rejected")}><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
                    </div>
                  </div>
                )}
                <div>

                  <p className="text-sm font-medium mb-2">Audit trail</p>
                  <div className="max-h-64 overflow-y-auto border rounded divide-y">
                    {audit.map(a => (
                      <div key={a.id} className="p-2 text-xs">
                        <div className="flex justify-between">
                          <span className="font-mono">{a.action}</span>
                          <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-muted-foreground">{a.actor_role}</div>
                        {a.details && <pre className="mt-1 text-[10px] bg-muted p-1 rounded whitespace-pre-wrap">{JSON.stringify(a.details, null, 2)}</pre>}
                      </div>
                    ))}
                    {audit.length === 0 && <p className="p-3 text-xs text-muted-foreground text-center">No audit entries</p>}
                  </div>
                </div>

                <ProxyNotificationPrefs
                  proxyId={selected.id}
                  initial={selected.notification_prefs ?? null}
                  phoneAvailable={!!selected.proxy_phone}
                  title="Notification preferences (admin override)"
                  description="Admins can adjust channels and event alerts on behalf of the proxy — every change is audit-logged."
                  onSaved={() => openDetails({ ...selected })}
                />

                {selected.status !== "revoked" && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">Admin-mediated revocation</p>
                    <Textarea placeholder="Reason for revocation" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} maxLength={500} />
                    <Button variant="destructive" onClick={revoke} disabled={!revokeReason.trim()}>
                      <Ban className="h-4 w-4 mr-2" /> Revoke proxy
                    </Button>
                  </div>
                )}
              </div>
            )}
            <DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
