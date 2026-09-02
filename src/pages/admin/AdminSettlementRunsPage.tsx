import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, PlayCircle, RefreshCw, Search } from "lucide-react";

interface Run {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  window_start: string | null;
  window_end: string | null;
  payment_id: string | null;
  triggered_by: string;
  status: string;
  total_checked: number;
  total_ok: number;
  total_failed: number;
  total_repaired: number;
  per_provider: Record<string, { checked: number; ok: number; failed: number; repaired: number }> | null;
  fatal_error: string | null;
}

interface ResultRow {
  id: string;
  run_id: string;
  payment_id: string;
  provider: string | null;
  provider_reference: string | null;
  purpose: string | null;
  amount: number | null;
  currency: string | null;
  ok: boolean;
  issues: string[] | null;
  repaired: string[] | null;
  created_at: string;
}

const statusStyle: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  partial: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  error: "bg-destructive/10 text-destructive border-destructive/30",
  running: "bg-sky-500/10 text-sky-500 border-sky-500/30",
};

const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Admin review of reconcile-settlements runs, failure drill-down and manual re-reconcile. */
export default function AdminSettlementRunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<string>("all");
  const [provider, setProvider] = useState<string>("all");
  const [onlyFailures, setOnlyFailures] = useState(true);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);

  const [from, setFrom] = useState(() => toLocalInput(new Date(Date.now() - 24 * 3600 * 1000)));
  const [to, setTo] = useState(() => toLocalInput(new Date()));
  const [runProviders, setRunProviders] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: r }, { data: res }] = await Promise.all([
      supabase.from("settlement_reconciliation_runs").select("*")
        .order("started_at", { ascending: false }).limit(100),
      supabase.from("settlement_reconciliation_results").select("*")
        .order("created_at", { ascending: false }).limit(500),
    ]);
    setRuns((r as unknown as Run[]) ?? []);
    setResults((res as unknown as ResultRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const providers = useMemo(
    () => Array.from(new Set(results.map((r) => r.provider ?? "unknown"))).sort(),
    [results],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.filter((r) => {
      if (selectedRun !== "all" && r.run_id !== selectedRun) return false;
      if (provider !== "all" && (r.provider ?? "unknown") !== provider) return false;
      if (onlyFailures && r.ok) return false;
      if (!q) return true;
      return [r.payment_id, r.provider_reference, r.purpose, (r.issues ?? []).join(" ")]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [results, selectedRun, provider, onlyFailures, query]);

  const summary = useMemo(() => {
    const last24 = runs.filter((x) => Date.now() - new Date(x.started_at).getTime() < 24 * 3600 * 1000);
    return {
      runs24: last24.length,
      checked24: last24.reduce((s, x) => s + x.total_checked, 0),
      failed24: last24.reduce((s, x) => s + x.total_failed, 0),
      repaired24: last24.reduce((s, x) => s + x.total_repaired, 0),
    };
  }, [runs]);

  const triggerRun = async () => {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      toast.error("Pick a valid time window");
      return;
    }
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("reconcile-settlements", {
      body: {
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        providers: runProviders === "all" ? undefined : [runProviders],
        limit: 200,
        repair: true,
        notify: true,
      },
    });
    setRunning(false);
    if (error || !data?.ok) {
      toast.error(error?.message ?? "Re-reconcile failed");
      return;
    }
    toast.success(`Checked ${data.checked} payments · ${data.failed} failing · ${data.repaired} repaired`);
    load();
  };

  const retryPayment = async (paymentId: string) => {
    const { data, error } = await supabase.functions.invoke("reconcile-settlements", {
      body: { payment_id: paymentId, repair: true, notify: true },
    });
    if (error || !data?.ok) { toast.error("Retry failed"); return; }
    toast.success(data.failed === 0 ? "Payment reconciled" : "Still failing — see issues");
    load();
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Settlement reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Every reconcile-settlements run, per-provider outcome, failing payments and manual re-runs.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Runs (24h)" value={summary.runs24} />
        <Stat label="Payments checked (24h)" value={summary.checked24} />
        <Stat label="Failing (24h)" value={summary.failed24} tone={summary.failed24 > 0 ? "bad" : "good"} />
        <Stat label="Auto-repaired (24h)" value={summary.repaired24} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manual re-reconcile</CardTitle>
          <CardDescription>
            Re-verify and repair every completed payment created inside the selected window.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="win-from" className="text-xs">From</Label>
            <Input id="win-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[15rem]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="win-to" className="text-xs">To</Label>
            <Input id="win-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="w-[15rem]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Provider</Label>
            <Select value={runProviders} onValueChange={setRunProviders}>
              <SelectTrigger className="w-[11rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="opay">OPay</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={triggerRun} disabled={running}>
            <PlayCircle className={`h-4 w-4 mr-2 ${running ? "animate-pulse" : ""}`} />
            {running ? "Reconciling…" : "Run re-reconcile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Runs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <Skeleton className="h-32 w-full" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Checked</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Repaired</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No runs recorded yet.</TableCell></TableRow>
                )}
                {runs.map((r) => (
                  <TableRow key={r.id} className={selectedRun === r.id ? "bg-muted/50" : undefined}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.payment_id
                        ? `single payment ${r.payment_id.slice(0, 8)}`
                        : r.window_start
                          ? `${new Date(r.window_start).toLocaleString()} → ${r.window_end ? new Date(r.window_end).toLocaleString() : "now"}`
                          : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.triggered_by}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyle[r.status] ?? ""}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.total_checked}</TableCell>
                    <TableCell className="text-right text-sm">{r.total_failed}</TableCell>
                    <TableCell className="text-right text-sm">{r.total_repaired}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost"
                        onClick={() => setSelectedRun(selectedRun === r.id ? "all" : r.id)}>
                        {selectedRun === r.id ? "Clear" : "Inspect"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment outcomes</CardTitle>
          <CardDescription>Filter by provider, run, or search a payment id / provider reference.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[14rem]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Payment id, reference, purpose or issue"
                value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search settlement results" />
            </div>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-[11rem]"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedRun} onValueChange={setSelectedRun}>
              <SelectTrigger className="w-[15rem]"><SelectValue placeholder="Run" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All runs</SelectItem>
                {runs.slice(0, 25).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{new Date(r.started_at).toLocaleString()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant={onlyFailures ? "default" : "outline"} size="sm" onClick={() => setOnlyFailures((v) => !v)}>
              {onlyFailures ? "Failures only" : "All outcomes"}
            </Button>
          </div>

          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>
            )}
            {filtered.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                    <span className="font-mono text-xs">{r.payment_id}</span>
                    <Badge variant="outline" className="text-[10px]">{r.provider ?? "unknown"}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.currency ?? ""} {r.amount ?? ""} · {r.purpose ?? "—"}
                    {r.provider_reference ? ` · ref ${r.provider_reference}` : ""}
                    {" · "}{new Date(r.created_at).toLocaleString()}
                  </p>
                  {(r.issues ?? []).length > 0 && (
                    <p className="text-xs text-destructive">Issues: {(r.issues ?? []).join(", ")}</p>
                  )}
                  {(r.repaired ?? []).length > 0 && (
                    <p className="text-xs text-emerald-500">Repaired: {(r.repaired ?? []).join(", ")}</p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => retryPayment(r.payment_id)}>
                  Re-reconcile
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-emerald-500" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
