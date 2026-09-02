import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Run {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  since: string;
  status: "running" | "success" | "partial" | "error";
  triggered_by: string;
  total_checked: number;
  total_updated: number;
  total_backfilled: number;
  total_errors: number;
  per_psp: Record<string, { checked: number; updated: number; backfilled: number; errors: number }>;
  errors: Array<{ psp?: string; reference?: string; order_id?: string; error: string }>;
  backfilled_payment_ids: string[];
  fatal_error: string | null;
}

interface Alert {
  id: string;
  run_id: string | null;
  alert_type: string;
  severity: string;
  psp: string | null;
  message: string;
  details: Record<string, unknown>;
  acknowledged_at: string | null;
  created_at: string;
}

const statusStyle: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  error: "bg-red-500/10 text-red-400 border-red-500/30",
  running: "bg-sky-500/10 text-sky-400 border-sky-500/30",
};

const ReconciliationLogsPage = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from("reconciliation_runs").select("*").order("started_at", { ascending: false }).limit(100),
      supabase.from("reconciliation_alerts").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setRuns((r as unknown as Run[]) ?? []);
    setAlerts((a as unknown as Alert[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    const last24 = runs.filter((x) => Date.now() - new Date(x.started_at).getTime() < 24 * 3600 * 1000);
    return {
      runs24: last24.length,
      backfilled24: last24.reduce((s, x) => s + x.total_backfilled, 0),
      errors24: last24.reduce((s, x) => s + x.total_errors, 0),
      openAlerts: alerts.filter((x) => !x.acknowledged_at).length,
    };
  }, [runs, alerts]);

  const ackAlert = async (id: string) => {
    await supabase.from("reconciliation_alerts")
      .update({ acknowledged_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payment reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Every run of the reconcile-payments cron job, per-PSP summary, backfilled payments, and alerts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Runs (24h)" value={summary.runs24} />
        <Stat label="Payments backfilled (24h)" value={summary.backfilled24} />
        <Stat label="Errors (24h)" value={summary.errors24} tone={summary.errors24 > 0 ? "warn" : "ok"} />
        <Stat label="Open alerts" value={summary.openAlerts} tone={summary.openAlerts > 0 ? "warn" : "ok"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent alerts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">No alerts yet.</p>}
          {alerts.map((a) => (
            <div key={a.id}
              className={`flex items-start justify-between gap-4 p-3 rounded-md border ${
                a.acknowledged_at ? "opacity-60 border-border" : "border-amber-500/40 bg-amber-500/5"}`}>
              <div className="flex items-start gap-3">
                {a.severity === "critical"
                  ? <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
                  : <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />}
                <div>
                  <div className="text-sm font-medium">{a.message}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {a.alert_type}{a.psp ? ` · ${a.psp}` : ""} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
              {!a.acknowledged_at
                ? <Button size="sm" variant="ghost" onClick={() => ackAlert(a.id)}>Acknowledge</Button>
                : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Checked</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="text-right">Backfilled</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead>Trigger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => {
                const open = expanded === r.id;
                return (
                  <>
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(open ? null : r.id)}>
                      <TableCell>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className={statusStyle[r.status]}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total_checked}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total_updated}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{r.total_backfilled}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-400">{r.total_errors}</TableCell>
                      <TableCell className="text-xs">{r.triggered_by}</TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30">
                          <RunDetails run={r} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
              {runs.length === 0 && !loading && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No runs yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, value, tone = "ok" }: { label: string; value: number; tone?: "ok" | "warn" }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tone === "warn" ? "text-amber-400" : ""}`}>{value}</div>
    </CardContent>
  </Card>
);

const RunDetails = ({ run }: { run: Run }) => (
  <div className="p-4 space-y-4">
    <div>
      <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Per PSP</div>
      <div className="grid grid-cols-3 gap-3">
        {(["paystack", "opay", "paypal"] as const).map((psp) => {
          const s = run.per_psp?.[psp] ?? { checked: 0, updated: 0, backfilled: 0, errors: 0 };
          return (
            <div key={psp} className="p-3 rounded-md border border-border">
              <div className="text-sm font-medium capitalize">{psp}</div>
              <div className="text-xs mt-1 grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Checked</span><span className="text-right text-foreground">{s.checked}</span>
                <span>Updated</span><span className="text-right text-foreground">{s.updated}</span>
                <span>Backfilled</span><span className="text-right text-foreground">{s.backfilled}</span>
                <span>Errors</span><span className="text-right text-red-400">{s.errors}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    {run.backfilled_payment_ids.length > 0 && (
      <div>
        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase">
          Backfilled payment IDs ({run.backfilled_payment_ids.length})
        </div>
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {run.backfilled_payment_ids.map((id) => (
            <code key={id} className="text-[10px] px-2 py-0.5 rounded bg-background border border-border">{id}</code>
          ))}
        </div>
      </div>
    )}
    {run.errors.length > 0 && (
      <div>
        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Errors</div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {run.errors.map((e, i) => (
            <div key={i} className="text-xs p-2 rounded bg-red-500/5 border border-red-500/20">
              <span className="text-red-400 font-medium">{e.psp ?? "—"}</span>{" "}
              <span className="text-muted-foreground">{e.reference ?? e.order_id ?? ""}</span>{" — "}
              <span>{e.error}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    {run.fatal_error && (
      <div className="text-xs p-2 rounded bg-red-500/10 border border-red-500/30 text-red-300">
        Fatal: {run.fatal_error}
      </div>
    )}
  </div>
);

export default ReconciliationLogsPage;
