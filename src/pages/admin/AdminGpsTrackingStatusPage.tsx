import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Satellite,
  Radio,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Siren,
  Link2,
  LocateFixed,
  CloudOff,
} from "lucide-react";
import { toast } from "sonner";
import GPSANDTRACKDeviceLinkPanel from "@/components/admin/GPSANDTRACKDeviceLinkPanel";
import ForceLocationSyncPanel from "@/components/admin/ForceLocationSyncPanel";

interface IngestRun {
  id: string;
  source: string;
  provider: string | null;
  devices_seen: number | null;
  events_processed: number | null;
  analytics_emitted: number | null;
  broker_reachable: boolean | null;
  degraded_reason: string | null;
  error: string | null;
  duration_ms: number | null;
  passes: number | null;
  deduped: number | null;
  unmapped: number | null;
  gps_disabled: number | null;
  created_at: string;
}

interface WorkerSpec {
  source: string;
  label: string;
  description: string;
  icon: "satellite" | "radio";
  stallAfterMinutes: number;
  warnAfterMinutes: number;
}

const WORKERS: WorkerSpec[] = [
  {
    source: "sarekon_location_worker",
    label: "GPSANDTRACK location worker",
    description: "Polls GPSANDTRACK for live vehicle positions (runs every minute).",
    icon: "satellite",
    stallAfterMinutes: 5,
    warnAfterMinutes: 2,
  },
  {
    source: "mqtt_worker",
    label: "MQTT ingestion worker",
    description: "Consumes EMQX/MQTT telemetry topics and persists vehicle state.",
    icon: "radio",
    stallAfterMinutes: 5,
    warnAfterMinutes: 2,
  },
];

type WorkerStatus = "healthy" | "warning" | "stalled" | "never_run";

function statusFor(lastRunAt: string | null, spec: WorkerSpec): WorkerStatus {
  if (!lastRunAt) return "never_run";
  const ageMin = (Date.now() - new Date(lastRunAt).getTime()) / 60_000;
  if (ageMin > spec.stallAfterMinutes) return "stalled";
  if (ageMin > spec.warnAfterMinutes) return "warning";
  return "healthy";
}

function statusBadge(status: WorkerStatus) {
  switch (status) {
    case "healthy":
      return <Badge variant="default">healthy</Badge>;
    case "warning":
      return <Badge variant="secondary">slow</Badge>;
    case "stalled":
      return <Badge variant="destructive">stalled</Badge>;
    case "never_run":
      return <Badge variant="outline">never run</Badge>;
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

interface ProviderSummary {
  provider: string;
  sources: string[];
  lastRunAt: string | null;
  lastError: string | null;
  runs: number;
  erroredRuns: number;
  devicesSeen: number;
  eventsProcessed: number;
  gpsDisabled: number;
  reachable: boolean | null;
}

export default function AdminGpsTrackingStatusPage() {
  const [latest, setLatest] = useState<Record<string, IngestRun | null>>({});
  const [runs, setRuns] = useState<IngestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const load = useCallback(async () => {
    const [{ data: recent }] = await Promise.all([
      supabase
        .from("telemetry_ingest_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const rows = (recent ?? []) as IngestRun[];
    setRuns(rows);

    const latestMap: Record<string, IngestRun | null> = {};
    for (const w of WORKERS) {
      latestMap[w.source] = rows.find((r) => r.source === w.source) ?? null;
    }
    setLatest(latestMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const workerStates = useMemo(
    () =>
      WORKERS.map((w) => {
        const last = latest[w.source] ?? null;
        return { spec: w, last, status: statusFor(last?.created_at ?? null, w) };
      }),
    [latest],
  );

  const stalledWorkers = workerStates.filter(
    (w) => w.status === "stalled" || w.status === "never_run",
  );

  /** Per-provider drill-down: aggregates the retained run history by provider. */
  const providerSummaries = useMemo<ProviderSummary[]>(() => {
    const byProvider = new Map<string, IngestRun[]>();
    for (const r of runs) {
      const key = r.provider ?? "unknown";
      byProvider.set(key, [...(byProvider.get(key) ?? []), r]);
    }
    return [...byProvider.entries()]
      .map(([provider, rows]) => {
        const last = rows[0] ?? null; // rows are newest-first
        return {
          provider,
          sources: [...new Set(rows.map((r) => r.source))],
          lastRunAt: last?.created_at ?? null,
          lastError: rows.find((r) => r.error)?.error ?? null,
          runs: rows.length,
          erroredRuns: rows.filter((r) => r.error).length,
          devicesSeen: rows.reduce((n, r) => n + (r.devices_seen ?? 0), 0),
          eventsProcessed: rows.reduce((n, r) => n + (r.events_processed ?? 0), 0),
          gpsDisabled: rows.reduce((n, r) => n + (r.gps_disabled ?? 0), 0),
          reachable: last?.broker_reachable ?? null,
        };
      })
      .sort((a, b) => a.provider.localeCompare(b.provider));
  }, [runs]);

  const runWatchdog = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("gps-worker-watchdog", { body: {} });
      if (error) throw new Error(error.message);
      const res = data as { workers?: Array<{ label: string; stalled: boolean; notified: number }> };
      const stalledCount = res?.workers?.filter((w) => w.stalled).length ?? 0;
      const notified = res?.workers?.reduce((n, w) => n + (w.notified ?? 0), 0) ?? 0;
      if (stalledCount === 0) {
        toast.success("All location workers are healthy.");
      } else {
        toast.warning(
          `${stalledCount} worker${stalledCount === 1 ? "" : "s"} stalled — ${notified} admin alert${notified === 1 ? "" : "s"} sent.`,
        );
      }
      await load();
    } catch (e) {
      toast.error(`Watchdog check failed: ${(e as Error).message}`);
    } finally {
      setChecking(false);
    }
  };

  const filterOptions = useMemo(() => {
    const providers = [...new Set(runs.map((r) => r.provider).filter((p): p is string => !!p))];
    return { providers };
  }, [runs]);

  const filteredRuns = useMemo(() => {
    if (sourceFilter === "all") return runs;
    if (sourceFilter.startsWith("provider:")) {
      const p = sourceFilter.slice("provider:".length);
      return runs.filter((r) => r.provider === p);
    }
    return runs.filter((r) => r.source === sourceFilter);
  }, [runs, sourceFilter]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">GPS Tracking</h1>
          <p className="text-muted-foreground">
            Unified location pipeline: worker health, device→vehicle links with per-vehicle GPS switches, and
            on-demand syncs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={runWatchdog} disabled={checking} className="gap-2">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
            Run stall check
          </Button>
        </div>
      </div>

      <Tabs defaultValue="workers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workers" className="flex items-center gap-2">
            <Satellite className="h-4 w-4" /> Worker status
          </TabsTrigger>
          <TabsTrigger value="links" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Device links
          </TabsTrigger>
          <TabsTrigger value="force" className="flex items-center gap-2">
            <LocateFixed className="h-4 w-4" /> Force sync
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workers" className="space-y-6">
          {stalledWorkers.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {stalledWorkers.length} location worker{stalledWorkers.length === 1 ? "" : "s"} stalled
              </AlertTitle>
              <AlertDescription>
                {stalledWorkers
                  .map((w) =>
                    w.status === "never_run"
                      ? `${w.spec.label} has never reported a run`
                      : `${w.spec.label} last ran ${timeAgo(w.last?.created_at ?? null)}`,
                  )
                  .join(" · ")}
                . The watchdog cron alerts all admins every 5 minutes while this persists.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {workerStates.map(({ spec, last, status }) => {
              const Icon = spec.icon === "satellite" ? Satellite : Radio;
              return (
                <Card key={spec.source}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-4 w-4" /> {spec.label}
                      </CardTitle>
                      <CardDescription>{spec.description}</CardDescription>
                    </div>
                    {statusBadge(status)}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {loading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Last run</p>
                            <p className="text-sm font-medium">{timeAgo(last?.created_at ?? null)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Devices seen</p>
                            <p className="text-sm font-semibold">{last?.devices_seen ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Events processed</p>
                            <p className="text-sm font-semibold">{last?.events_processed ?? "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Duration</p>
                            <p className="text-sm font-semibold">
                              {last?.duration_ms != null ? `${last.duration_ms} ms` : "—"}
                            </p>
                          </div>
                        </div>
                        {(last?.gps_disabled ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CloudOff className="h-3.5 w-3.5" />
                            {last?.gps_disabled} fix(es) skipped — vehicle GPS tracking switched off.
                          </p>
                        )}
                        {last?.error ? (
                          <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Last run reported an error</AlertTitle>
                            <AlertDescription className="text-xs break-all">{last.error}</AlertDescription>
                          </Alert>
                        ) : last ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Last run at {new Date(last.created_at).toLocaleString()} completed without errors.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No runs recorded yet for this worker.
                          </p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {providerSummaries.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Provider drill-down</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {providerSummaries.map((p) => (
                  <Card key={p.provider}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                      <div>
                        <CardTitle className="text-base capitalize">{p.provider}</CardTitle>
                        <CardDescription className="font-mono text-xs">
                          {p.sources.join(", ")}
                        </CardDescription>
                      </div>
                      {p.reachable === false ? (
                        <Badge variant="destructive">unreachable</Badge>
                      ) : p.erroredRuns > 0 ? (
                        <Badge variant="secondary">{p.erroredRuns} error(s)</Badge>
                      ) : (
                        <Badge variant="default">ok</Badge>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Last run</p>
                          <p className="font-medium">{timeAgo(p.lastRunAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Runs retained</p>
                          <p className="font-medium">{p.runs}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Devices seen</p>
                          <p className="font-medium">{p.devicesSeen}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Events processed</p>
                          <p className="font-medium">{p.eventsProcessed}</p>
                        </div>
                        {p.gpsDisabled > 0 && (
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Dropped (vehicle GPS off)</p>
                            <p className="font-medium">{p.gpsDisabled}</p>
                          </div>
                        )}
                      </div>
                      {p.lastError && (
                        <p className="mt-2 text-xs text-destructive break-all">Latest error: {p.lastError}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-base">Recent ingestion runs</CardTitle>
                <CardDescription>
                  Latest 100 worker runs — filter by worker or drill into a single provider.
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={sourceFilter === "all" ? "default" : "outline"}
                  onClick={() => setSourceFilter("all")}
                >
                  All
                </Button>
                {WORKERS.map((w) => (
                  <Button
                    key={w.source}
                    size="sm"
                    variant={sourceFilter === w.source ? "default" : "outline"}
                    onClick={() => setSourceFilter(w.source)}
                  >
                    {w.label.split(" ")[0]}
                  </Button>
                ))}
                {filterOptions.providers.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={sourceFilter === `provider:${p}` ? "default" : "outline"}
                    onClick={() => setSourceFilter(`provider:${p}`)}
                    className="capitalize"
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {filteredRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Worker</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Devices</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>GPS off</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRuns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.source}</TableCell>
                        <TableCell className="capitalize">{r.provider ?? "—"}</TableCell>
                        <TableCell>{r.devices_seen ?? "—"}</TableCell>
                        <TableCell>{r.events_processed ?? "—"}</TableCell>
                        <TableCell>{r.gps_disabled ?? 0}</TableCell>
                        <TableCell>{r.duration_ms != null ? `${r.duration_ms} ms` : "—"}</TableCell>
                        <TableCell>
                          {r.error ? (
                            <Badge variant="destructive" title={r.error}>
                              error
                            </Badge>
                          ) : r.degraded_reason ? (
                            <Badge variant="secondary" title={r.degraded_reason}>
                              degraded
                            </Badge>
                          ) : (
                            <Badge variant="default">ok</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="links">
          <GPSANDTRACKDeviceLinkPanel />
        </TabsContent>

        <TabsContent value="force">
          <ForceLocationSyncPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
