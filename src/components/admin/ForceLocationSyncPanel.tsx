import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeEdge } from "@/lib/edge-invoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LocateFixed, MapPin, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

interface LinkedDevice {
  id: string;
  provider_device_id: string | null;
  serial_number: string;
  sim_number: string | null;
  vehicle_id: string | null;
  vehicle_gps_enabled: boolean;
  polling_ready: boolean;
  vehicle: { make: string | null; model: string | null; year: number | null; license_plate: string | null } | null;
}

interface ForceSyncResult {
  ok: boolean;
  provider_device_id?: string;
  requested_at?: string;
  provider_responded_at?: string;
  finished_at?: string;
  fixes?: number;
  persisted?: number;
  deduped?: number;
  unmapped?: number;
  published?: number;
  gps_disabled?: number;
  linked_vehicle_id?: string | null;
  vehicle_gps_enabled?: boolean | null;
  location?: {
    latitude: number;
    longitude: number;
    speed_kmh: number | null;
    heading: number | null;
    ignition: boolean | null;
    address: string | null;
    gps_timestamp: string;
    received_at: string;
  } | null;
  raw?: Record<string, unknown> | null;
  errors?: string[];
  diagnosis?: { code?: string; title?: string; detail?: string; hints?: string[] };
  error?: string;
}

const MANUAL = "__manual__";
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const vehicleLabel = (d: LinkedDevice) => {
  const v = d.vehicle;
  if (!v) return "—";
  return `${[v.year, v.make, v.model].filter(Boolean).join(" ")}${v.license_plate ? ` · ${v.license_plate}` : ""}`;
};

/**
 * One-off "sync this tracker now" action for admins: polls the provider
 * immediately, routes the fix through the unified location pipeline, and
 * shows the API result plus request/response timestamps.
 */
export default function ForceLocationSyncPanel() {
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [manualId, setManualId] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ForceSyncResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeEdge("sarekon-admin", { action: "device_links" });
      if (error) throw new Error(error.message);
      setDevices(((data as { devices?: LinkedDevice[] })?.devices ?? []) as LinkedDevice[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pollable = useMemo(
    () => devices.filter((d) => d.provider_device_id || d.serial_number),
    [devices],
  );

  const effectiveDeviceId = useMemo(() => {
    if (selected === MANUAL) return manualId.trim();
    const dev = pollable.find((d) => d.id === selected);
    return dev?.provider_device_id ?? dev?.serial_number ?? "";
  }, [selected, manualId, pollable]);

  const selectedDevice = pollable.find((d) => d.id === selected) ?? null;

  const run = async () => {
    if (!effectiveDeviceId) {
      toast.error("Pick a linked tracker or enter a device id / ICCID");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await invokeEdge("sarekon-admin", {
        action: "force_sync_device",
        provider_device_id: effectiveDeviceId,
      });
      if (error) throw new Error(error.message);
      const res = data as ForceSyncResult;
      setResult(res);
      if (res.ok) {
        toast.success(res.fixes ? `Latest fix received and persisted` : "Provider responded — no new fix available");
      } else {
        toast.error(res.diagnosis?.title ?? res.error ?? "Force sync failed");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LocateFixed className="h-5 w-5" />
              Force location sync
            </CardTitle>
            <CardDescription>
              Poll a single tracker immediately instead of waiting for the next worker pass. The fix flows
              through the same unified pipeline (state, history, live publish) and is logged in the run history.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh list
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
          <div className="space-y-1">
            <Label>Tracker</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading linked trackers…" : "Select a tracker"} />
              </SelectTrigger>
              <SelectContent>
                {pollable.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.serial_number}
                    {d.vehicle_id ? ` — ${vehicleLabel(d)}` : " — not linked"}
                    {d.vehicle_id && d.vehicle_gps_enabled === false ? " (GPS off)" : ""}
                  </SelectItem>
                ))}
                <SelectItem value={MANUAL}>Enter device id / ICCID manually…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={run} disabled={running || !effectiveDeviceId}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
            Sync now
          </Button>
        </div>

        {selected === MANUAL && (
          <div className="space-y-1 max-w-md">
            <Label htmlFor="force-manual-id">SareKon device id / ICCID</Label>
            <Input
              id="force-manual-id"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="e.g. 860123456789012"
            />
          </div>
        )}

        {selectedDevice?.vehicle_id && selectedDevice.vehicle_gps_enabled === false && (
          <Alert>
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>GPS tracking is off for this vehicle</AlertTitle>
            <AlertDescription>
              The provider will still be polled, but the fix will be dropped until an admin re-enables GPS
              tracking on the Device links tab.
            </AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {result.ok ? <Badge>Success</Badge> : <Badge variant="destructive">Failed</Badge>}
                <span className="font-mono text-xs text-muted-foreground">{result.provider_device_id}</span>
              </div>
              {result.vehicle_gps_enabled === false && (
                <Badge variant="secondary">vehicle GPS off — fix dropped</Badge>
              )}
            </div>

            {!result.ok && result.diagnosis && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>{result.diagnosis.title ?? "Provider error"}</AlertTitle>
                <AlertDescription>
                  {result.diagnosis.detail}
                  {result.diagnosis.hints?.length ? (
                    <ul className="mt-1 list-disc pl-4 text-xs">
                      {result.diagnosis.hints.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Requested at</p>
                <p className="font-medium">{fmt(result.requested_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Provider responded</p>
                <p className="font-medium">{fmt(result.provider_responded_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Finished at</p>
                <p className="font-medium">{fmt(result.finished_at)}</p>
              </div>
              {result.ok && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Fixes returned</p>
                    <p className="font-medium">{result.fixes ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Persisted / deduped</p>
                    <p className="font-medium">
                      {result.persisted ?? 0} / {result.deduped ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Published live</p>
                    <p className="font-medium">{result.published ?? 0}</p>
                  </div>
                </>
              )}
            </div>

            {result.location && (
              <div className="rounded-md bg-muted/50 p-3 space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <MapPin className="h-4 w-4" /> Latest API fix
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Coordinates</p>
                    <p className="font-medium">
                      {result.location.latitude.toFixed(5)}, {result.location.longitude.toFixed(5)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Speed</p>
                    <p className="font-medium">{result.location.speed_kmh != null ? `${result.location.speed_kmh} km/h` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ignition</p>
                    <p className="font-medium">
                      {result.location.ignition == null ? "—" : result.location.ignition ? "On" : "Off"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fix time (device)</p>
                    <p className="font-medium">{fmt(result.location.gps_timestamp)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Received at</p>
                    <p className="font-medium">{fmt(result.location.received_at)}</p>
                  </div>
                  {result.location.address && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-xs text-muted-foreground">Address</p>
                      <p className="font-medium">{result.location.address}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {result.errors?.length ? (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Persistence errors</AlertTitle>
                <AlertDescription className="text-xs break-all">{result.errors.join(" · ")}</AlertDescription>
              </Alert>
            ) : null}

            {result.raw && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Raw provider payload</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3">
                  {JSON.stringify(result.raw, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
