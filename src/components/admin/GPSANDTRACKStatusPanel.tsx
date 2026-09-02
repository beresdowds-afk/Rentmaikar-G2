import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge-invoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Admin status panel: last successful sync + error detail for each GPSANDTRACK
 * subsystem (telemetry, devices, commands), plus the map-merge safeguard
 * indicator proving positions land on the shared fleet map.
 */

interface ScopeState {
  state: string | null;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  devices_synced: number | null;
  positions_imported: number | null;
}

interface ActivityRow {
  event: string;
  level: string;
  message: string;
  created_at: string;
}

interface StatusPayload {
  scopes: Record<string, ScopeState | null>;
  activity: ActivityRow[];
  map_merge: { devices_total: number; devices_on_map: number };
}

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "Never");

const SCOPES: Array<{ key: string; label: string; hint: string }> = [
  { key: "telemetry", label: "Telemetry", hint: "Positions written to the shared feed" },
  { key: "devices", label: "Devices / assets", hint: "Registry metadata and linking" },
  { key: "commands", label: "Command queue", hint: "Queued command refreshes" },
];

function stateBadge(state: string | null | undefined) {
  if (state === "ok") return <Badge>Healthy</Badge>;
  if (state === "running") return <Badge variant="secondary">Running</Badge>;
  if (state === "degraded") return <Badge variant="secondary">Degraded</Badge>;
  if (state === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">Never run</Badge>;
}

export default function GPSANDTRACKStatusPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await invokeEdge("sarekon-admin", { action: "sync_status", limit: 25 });
      if (err) throw new Error(err.message);
      setData(res as StatusPayload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const merge = data?.map_merge;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Last successful run and error detail per subsystem.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load status</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {SCOPES.map((s) => {
          const st = data?.scopes?.[s.key] ?? null;
          return (
            <Card key={s.key}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  {s.label}
                  {stateBadge(st?.state)}
                </CardTitle>
                <CardDescription>{s.hint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Last success</span>
                  <span>{fmt(st?.last_success_at)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Last attempt</span>
                  <span>{fmt(st?.last_sync_at)}</span>
                </div>
                {(st?.devices_synced ?? null) !== null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Records</span>
                    <span>
                      {st?.devices_synced ?? 0}
                      {s.key === "telemetry" ? ` device(s) · ${st?.positions_imported ?? 0} position(s)` : ""}
                    </span>
                  </div>
                )}
                {st?.last_error && (
                  <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                    {st.last_error}
                    <span className="block text-muted-foreground">{fmt(st.last_error_at)}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" aria-hidden="true" /> Fleet map merge
          </CardTitle>
          <CardDescription>
            GPSANDTRACK positions are written to the shared device registry that the existing fleet map reads — no second
            map or provider-specific layer is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          {merge && merge.devices_on_map > 0 ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Merged into shared map</Badge>
          ) : (
            <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" /> No positions on the map yet</Badge>
          )}
          <span className="text-muted-foreground">
            {merge?.devices_on_map ?? 0} of {merge?.devices_total ?? 0} GPSANDTRACK device(s) carry coordinates
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data?.activity?.length ? (
            <p className="text-sm text-muted-foreground">No GPSANDTRACK sync activity recorded yet.</p>
          ) : (
            data.activity.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <span className="flex items-center gap-2">
                  <Badge variant={a.level === "error" ? "destructive" : a.level === "warn" ? "secondary" : "outline"}>
                    {a.event}
                  </Badge>
                  <span>{a.message}</span>
                </span>
                <span className="text-muted-foreground">{fmt(a.created_at)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
