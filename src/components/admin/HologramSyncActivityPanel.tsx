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
  devices_synced: number;
}

interface Schedule {
  provider: string;
  enabled: boolean;
  interval_minutes: number;
}

export function HologramSyncActivityPanel() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [state, setState] = useState<SyncState | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: logs }, { data: st }, { data: sc }] = await Promise.all([
      supabase.from("iot_sync_activity_log").select("*")
        .eq("provider", "hologram").order("created_at", { ascending: false }).limit(100),
      supabase.from("iot_sync_state").select("*").eq("provider", "hologram").maybeSingle(),
      supabase.from("iot_sync_schedule").select("*").eq("provider", "hologram").maybeSingle(),
    ]);
    setRows((logs as ActivityRow[]) || []);
    setState((st as SyncState) || null);
    setSchedule((sc as Schedule) || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("hologram-sync-activity")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "iot_sync_activity_log" },
        (payload) => {
          const row = payload.new as ActivityRow;
          if (row.provider === "hologram") setRows((prev) => [row, ...prev].slice(0, 100));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("hologram-admin", { body: { action: "run_sync" } });
      if (error) throw new Error(error.message);
      const res = (data as { result?: { imported?: number; updated?: number; errors?: unknown[] } })?.result;
      toast.success(`Sync finished — ${res?.updated ?? 0} refreshed, ${res?.imported ?? 0} imported`);
      await load();
    } catch (e) {
      toast.error("Sync failed", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const levelVariant = (l: string) =>
    l === "error" ? "destructive" : l === "warn" ? "secondary" : "outline";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Scheduled Hologram sync
          </CardTitle>
          <CardDescription>
            Background job refreshes SIM inventory, state and data usage
            {schedule ? ` every ${schedule.interval_minutes} minutes` : ""}.
            Failures are recorded below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Schedule</p>
              <Badge variant={schedule?.enabled ? "default" : "secondary"}>
                {schedule?.enabled ? "enabled" : "disabled"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">State</p>
              <Badge variant={state?.state === "error" ? "destructive" : "outline"}>{state?.state ?? "never run"}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last success</p>
              <p className="text-xs">{state?.last_success_at ? new Date(state.last_success_at).toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last error</p>
              <p className="text-xs">{state?.last_error ?? "—"}</p>
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
            <div className="p-6 text-sm text-muted-foreground">No sync activity recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={levelVariant(r.level) as never}>{r.level}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{r.event}</TableCell>
                    <TableCell className="text-xs">{r.message ?? "—"}</TableCell>
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
