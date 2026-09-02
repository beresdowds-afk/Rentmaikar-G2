import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import ProviderCredentialSettings from "./ProviderCredentialSettings";

const PROVIDERS = [
  "traccar", "emqx", "hologram", "persona", "twilio", "termii",
  "resend", "elevenlabs", "paystack", "paypal", "opay", "other",
] as const;

interface BillingEvent {
  id: string;
  provider: string;
  event_type: string;
  description: string | null;
  amount: number;
  currency: string;
  occurred_at: string;
  status: string;
  source: string;
  external_id: string | null;
}

interface Summary {
  period_start: string;
  period_end: string;
  providers: Array<{
    provider: string;
    currency: string;
    total_amount: number;
    event_count: number;
    unreconciled_count: number;
    disputed_count: number;
  }>;
  platform_revenue_by_currency: Record<string, number>;
  provider_cost_by_currency: Record<string, number>;
}

const money = (v: number, c: string) =>
  `${c} ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProviderBillingDashboard() {
  const qc = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [form, setForm] = useState({
    provider: "traccar",
    event_type: "invoice",
    description: "",
    amount: "",
    currency: "USD",
  });

  const summaryQuery = useQuery({
    queryKey: ["provider-billing-summary"],
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase.rpc("admin_provider_billing_summary" as never, {} as never);
      if (error) throw error;
      return data as unknown as Summary;
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["provider-billing-events"],
    queryFn: async (): Promise<BillingEvent[]> => {
      const { data, error } = await supabase
        .from("provider_billing_events" as never)
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as BillingEvent[];
    },
  });

  const accountsQuery = useQuery({
    queryKey: ["provider-billing-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_billing_accounts" as never)
        .select("*")
        .order("provider");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; provider: string; display_name: string; billing_currency: string;
        sync_enabled: boolean; last_synced_at: string | null; last_sync_status: string | null;
        last_sync_detail: string | null;
      }>;
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("provider-billing-sync", {
        body: { action: "sync" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Provider billing synced");
      qc.invalidateQueries({ queryKey: ["provider-billing-summary"] });
      qc.invalidateQueries({ queryKey: ["provider-billing-events"] });
      qc.invalidateQueries({ queryKey: ["provider-billing-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("provider-billing-sync", {
        body: { action: "record_event", event: { ...form, amount: Number(form.amount) } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Charge recorded");
      setManualOpen(false);
      setForm((f) => ({ ...f, description: "", amount: "" }));
      qc.invalidateQueries({ queryKey: ["provider-billing-events"] });
      qc.invalidateQueries({ queryKey: ["provider-billing-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reconcile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("provider_billing_events" as never)
        .update({ status: "reconciled", reconciled_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["provider-billing-events"] });
      qc.invalidateQueries({ queryKey: ["provider-billing-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const netByCurrency = useMemo(() => {
    const s = summaryQuery.data;
    if (!s) return [] as Array<{ currency: string; revenue: number; cost: number; net: number }>;
    const currencies = new Set([
      ...Object.keys(s.platform_revenue_by_currency ?? {}),
      ...Object.keys(s.provider_cost_by_currency ?? {}),
    ]);
    return Array.from(currencies).map((c) => {
      const revenue = Number(s.platform_revenue_by_currency?.[c] ?? 0);
      const cost = Number(s.provider_cost_by_currency?.[c] ?? 0);
      return { currency: c, revenue, cost, net: revenue - cost };
    });
  }, [summaryQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Provider billing &amp; reconciliation</h2>
          <p className="text-sm text-muted-foreground">
            Third-party charges (Traccar, EMQX, Hologram, Persona, messaging, PSPs) recorded
            independently and reconciled against platform revenue.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Record charge</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record a provider charge</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Provider</Label>
                  <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount</Label>
                    <Input type="number" step="0.01" value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => recordEvent.mutate()} disabled={!form.amount || recordEvent.isPending}>
                  Save charge
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} /> Sync providers
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue vs provider cost (last 30 days)</CardTitle>
          <CardDescription>Platform treasury movements compared with recorded third-party charges.</CardDescription>
        </CardHeader>
        <CardContent>
          {summaryQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : netByCurrency.length === 0 ? (
            <p className="text-sm text-muted-foreground">No revenue or provider charges in this period yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {netByCurrency.map((row) => (
                <div key={row.currency} className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.currency}</p>
                  <p className="mt-1 text-2xl font-semibold">{money(row.net, row.currency)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Revenue {money(row.revenue, row.currency)} · Provider cost {money(row.cost, row.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Per-provider totals</CardTitle></CardHeader>
        <CardContent>
          {!summaryQuery.data?.providers?.length ? (
            <p className="text-sm text-muted-foreground">No provider charges recorded yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summaryQuery.data.providers.map((p) => (
                <div key={`${p.provider}-${p.currency}`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{p.provider}</span>
                    {p.unreconciled_count > 0 ? (
                      <Badge variant="outline" className="text-amber-500 border-amber-500/40">
                        {p.unreconciled_count} open
                      </Badge>
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                  <p className="mt-1 text-lg font-semibold">{money(p.total_amount, p.currency)}</p>
                  <p className="text-xs text-muted-foreground">{p.event_count} events</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Provider billing accounts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {accountsQuery.data?.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{a.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.billing_currency} · last sync{" "}
                  {a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : "never"}
                  {a.last_sync_detail ? ` · ${a.last_sync_detail}` : ""}
                </p>
              </div>
              <Badge variant="outline" className={a.last_sync_status === "error" ? "text-red-500 border-red-500/40" : ""}>
                {a.last_sync_status ?? (a.sync_enabled ? "pending" : "manual")}
              </Badge>
            </div>
          ))}
          {!accountsQuery.data?.length && (
            <p className="text-sm text-muted-foreground">No provider billing accounts configured.</p>
          )}
        </CardContent>
      </Card>

      <ProviderCredentialSettings />

      <Card>
        <CardHeader><CardTitle className="text-base">Recorded charges</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventsQuery.data?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{new Date(e.occurred_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm capitalize">{e.provider}</TableCell>
                  <TableCell className="text-xs">{e.description ?? e.event_type}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(e.amount, e.currency)}</TableCell>
                  <TableCell className="text-xs">{e.source}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={e.status === "recorded" ? "text-amber-500 border-amber-500/40" : ""}>
                      {e.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {e.status === "recorded" && (
                      <Button size="sm" variant="ghost" onClick={() => reconcile.mutate(e.id)}>
                        Reconcile
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!eventsQuery.data?.length && !eventsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    <AlertTriangle className="mx-auto mb-2 h-4 w-4" />
                    No provider charges recorded yet — run a sync or record one manually.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
