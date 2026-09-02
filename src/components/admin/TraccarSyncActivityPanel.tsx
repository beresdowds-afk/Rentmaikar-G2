import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, PlayCircle, Activity } from "lucide-react";
import { toast } from "sonner";

interface ActivityRow {
  id: string;
  provider: string;
  event: string;
  level: string;
  message: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface SyncState {
  provider: string;
  state: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  devices_synced: number | null;
  positions_imported?: number | null;
}

interface Schedule {
  provider: string;
  enabled: boolean;
  interval_minutes: number;
}

/** Traccar sync activity feed — run history, timestamps and per-device errors. */
export function TraccarSyncActivityPanel() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [state, setState] = useState<SyncState | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: logs }, { data: st }, { data: sc }] = await Promise.all([
      supabase.from("iot_sync_activity_log").select("*")
        .eq("provider", "traccar").order("created_at", { ascending: false }).limit(100),
      supabase.from("iot_sync_state").select("*").eq("provider", "traccar").maybeSingle(),
      supabase.from("iot_sync_schedule").select("*").eq("provider", "traccar").maybeSingle(),
    ]);
    setRows((logs as unknown as ActivityRow[]) || []);
    setState((st as unknown as SyncState) || null);
    setSchedule((sc as unknown as Schedule) || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("traccar-sync-activity")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "iot_sync_activity_log" },
        (payload) => {
          const row = payload.new as ActivityRow;
          if (row.provider === "traccar") setRows((prev) => [row, ...prev].slice(0, 100));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("traccar-admin", { body: { action: "sync" } });
      if (error) throw new Error(error.message);
      const res = data as {
        ok?: boolean;
        devices_synced?: number;
        positions_imported?: number;
        device_errors?: Array<{ device: string; error: string }>;
        diagnosis?: { title?: string; detail?: string };
      };
      if (res?.ok === false) {
        throw new Error(`${res.diagnosis?.title ?? "Sync failed"} — ${res.diagnosis?.detail ?? ""}`);
      }
      const errs = res?.device_errors?.length ?? 0;
      toast.success(
        `Sync finished — ${res?.devices_synced ?? 0} device(s), ${res?.positions_imported ?? 0} position(s)` +
          (errs ? `, ${errs} error(s)` : ""),
      );
      await load();
    } catch (e) {
      toast.error("Sync failed", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const levelVariant = (l: string) =>
    l === "error" ? "destructive" : l === "warn" ? "secondary" : "outline";

  const detailSummary = (r: ActivityRow) => {
    const d = r.details as Record<string, unknown> | null;
    if (!d) return null;
    const parts: string[] = [];
    if (typeof d.devices_synced === "number") parts.push(`${d.devices_synced} devices`);
    if (typeof d.positions_imported === "number") parts.push(`${d.positions_imported} positions`);
    if (typeof d.duration_ms === "number") parts.push(`${d.duration_ms}ms`);
    if (typeof d.triggered_by === "string") parts.push(String(d.triggered_by));
    if (Array.isArray(d.errors) && d.errors.length) parts.push(`${d.errors.length} error(s)`);
    return parts.join(" · ") || null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Scheduled Traccar sync
          </CardTitle>
          <CardDescription>
            A background job pulls devices and their latest known position from Traccar
            {schedule ? ` every ${schedule.interval_minutes} minutes` : ""} and writes them to the
            fleet dashboard. Every run — and each per-device error — is recorded below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Schedule</p>
              <Badge variant={schedule?.enabled ? "default" : "secondary"}>
                {schedule?.enabled ? `every ${schedule.interval_minutes}m` : "disabled"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">State</p>
              <Badge variant={state?.state === "error" ? "destructive" : "outline"}>
                {state?.state ?? "never run"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last run</p>
              <p className="text-xs">{state?.last_sync_at ? new Date(state.last_sync_at).toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last success</p>
              <p className="text-xs">{state?.last_success_at ? new Date(state.last_success_at).toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last error</p>
              <p className="text-xs break-words">{state?.last_error ?? "—"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={runNow} disabled={running} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Run sync now
            </Button>
            <Button size="sm" variant="outline" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No Traccar sync activity recorded yet. Run a sync to populate this feed.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={levelVariant(r.level) as never}>{r.level}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{r.event}</TableCell>
                    <TableCell className="text-xs">{r.message ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{detailSummary(r) ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TraccarSyncActivityPanel;
