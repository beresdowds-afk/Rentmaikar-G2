import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeEdge } from "@/lib/edge-invoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Link2, Link2Off, RefreshCw, Satellite, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { VehiclePicker } from "./VehiclePicker";

/** A tracker as the SareKon account reports it. */
interface ProviderDevice {
  id: string;
  serial: string;
  name: string | null;
  status: string | null;
  lastUpdate: string | null;
}

/** A row in our own registry — this is what the GPS worker polls. */
interface RegistryDevice {
  id: string;
  provider_device_id: string | null;
  serial_number: string;
  sim_number: string | null;
  vehicle_id: string | null;
  telemetry_enabled: boolean;
  last_ping: string | null;
  latitude: number | null;
  longitude: number | null;
  polling_ready: boolean;
  /** False when the linked vehicle's GPS/telemetry switch is off. */
  vehicle_gps_enabled: boolean;
  vehicle: { id: string; make: string | null; model: string | null; year: number | null; license_plate: string | null; gps_tracking_enabled?: boolean | null } | null;
}

/** Merged view: one line per tracker, whichever side knows about it. */
interface MergedRow {
  key: string;
  providerDeviceId: string;
  serial: string;
  label: string | null;
  iccid: string | null;
  registry: RegistryDevice | null;
  seenAtProvider: boolean;
  lastUpdate: string | null;
}

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

const vehicleLabel = (v: RegistryDevice["vehicle"]) =>
  v ? `${[v.year, v.make, v.model].filter(Boolean).join(" ")}${v.license_plate ? ` · ${v.license_plate}` : ""}` : "—";

/**
 * Maps each SareKon tracker (by provider device id / ICCID) to a vehicle.
 *
 * The unified GPS worker only polls registry rows that carry BOTH a provider
 * device id and a vehicle, so an unlinked tracker returns no locations no
 * matter how healthy the SareKon account is. This screen makes that pairing —
 * and its readiness — explicit.
 */
export default function GPSANDTRACKDeviceLinkPanel() {
  const [providerDevices, setProviderDevices] = useState<ProviderDevice[]>([]);
  const [registry, setRegistry] = useState<RegistryDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [iccidDraft, setIccidDraft] = useState<Record<string, string>>({});

  // manual entry for a SIM/tracker the provider search does not return
  const [manualId, setManualId] = useState("");
  const [manualIccid, setManualIccid] = useState("");
  const [manualVehicle, setManualVehicle] = useState<string | null>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await invokeEdge("sarekon-admin", body);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [links, devices] = await Promise.all([
        call({ action: "device_links" }),
        call({ action: "list_devices" }).catch(() => ({ devices: [] })),
      ]);
      setRegistry((links.devices as RegistryDevice[]) ?? []);
      setProviderDevices((devices.devices as ProviderDevice[]) ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo<MergedRow[]>(() => {
    const byProviderId = new Map<string, RegistryDevice>();
    for (const r of registry) {
      if (r.provider_device_id) byProviderId.set(r.provider_device_id, r);
      byProviderId.set(r.serial_number, byProviderId.get(r.serial_number) ?? r);
    }

    const merged: MergedRow[] = providerDevices.map((d) => {
      const reg = byProviderId.get(d.id) ?? byProviderId.get(d.serial) ?? null;
      return {
        key: d.id,
        providerDeviceId: d.id,
        serial: d.serial || d.id,
        label: d.name,
        iccid: reg?.sim_number ?? null,
        registry: reg,
        seenAtProvider: true,
        lastUpdate: d.lastUpdate,
      };
    });

    const covered = new Set(merged.map((m) => m.registry?.id).filter(Boolean));
    for (const r of registry) {
      if (covered.has(r.id)) continue;
      merged.push({
        key: r.id,
        providerDeviceId: r.provider_device_id ?? r.serial_number,
        serial: r.serial_number,
        label: null,
        iccid: r.sim_number,
        registry: r,
        seenAtProvider: false,
        lastUpdate: r.last_ping,
      });
    }

    const q = query.trim().toLowerCase();
    return merged.filter((m) => {
      if (onlyUnlinked && m.registry?.vehicle_id) return false;
      if (!q) return true;
      return [m.providerDeviceId, m.serial, m.label, m.iccid, vehicleLabel(m.registry?.vehicle ?? null)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [providerDevices, registry, query, onlyUnlinked]);

  const readyCount = registry.filter((r) => r.polling_ready).length;
  const unlinkedCount = registry.filter((r) => !r.vehicle_id).length;

  const save = async (row: MergedRow, vehicleId: string | null) => {
    setSavingKey(row.key);
    try {
      const iccid = iccidDraft[row.key] ?? row.iccid ?? "";
      const res = await call({
        action: "link_provider_device",
        provider_device_id: row.providerDeviceId,
        serial_number: row.serial,
        iccid: iccid.trim() ? iccid.trim() : null,
        vehicle_id: vehicleId,
      });
      if (res.conflict) {
        toast.error(res.message as string);
        return;
      }
      if (!res.ok) {
        toast.error((res.error as string) ?? "Could not save the link");
        return;
      }
      toast.success(vehicleId ? "Tracker linked — the GPS worker will pick it up on the next pass" : "Tracker unlinked");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  /** Per-vehicle GPS/telemetry switch — gates the whole unified location pipeline. */
  const toggleGps = async (row: MergedRow, enabled: boolean) => {
    const vehicleId = row.registry?.vehicle_id;
    if (!vehicleId) return;
    setSavingKey(`gps:${row.key}`);
    try {
      const res = await call({ action: "set_vehicle_gps", vehicle_id: vehicleId, gps_tracking_enabled: enabled });
      if (!res.ok) {
        toast.error((res.error as string) ?? "Could not update GPS tracking");
        return;
      }
      toast.success(enabled ? "GPS tracking enabled — locations resume on the next pass" : "GPS tracking paused — this vehicle stops syncing locations");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  const addManual = async () => {
    if (!manualId.trim()) {
      toast.error("Enter the SareKon device id or ICCID");
      return;
    }
    setSavingKey("__manual__");
    try {
      const res = await call({
        action: "link_provider_device",
        provider_device_id: manualId.trim(),
        serial_number: manualId.trim(),
        iccid: manualIccid.trim() ? manualIccid.trim() : null,
        vehicle_id: manualVehicle,
      });
      if (res.conflict) {
        toast.error(res.message as string);
        return;
      }
      if (!res.ok) {
        toast.error((res.error as string) ?? "Could not save the link");
        return;
      }
      toast.success("Tracker registered");
      setManualId("");
      setManualIccid("");
      setManualVehicle(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Satellite className="h-5 w-5" />
              Device → vehicle links
            </CardTitle>
            <CardDescription>
              The GPS worker only polls trackers that are matched to a vehicle. {readyCount} feeding locations
              {unlinkedCount > 0 ? ` · ${unlinkedCount} waiting to be linked` : ""}.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {unlinkedCount > 0 && (
          <Alert>
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Unlinked trackers won't report locations</AlertTitle>
            <AlertDescription>
              Pick a vehicle for each tracker below. Locations start flowing within one polling pass (about 15 seconds).
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search device id, serial, ICCID or vehicle…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant={onlyUnlinked ? "default" : "outline"} size="sm" onClick={() => setOnlyUnlinked((v) => !v)}>
            Unlinked only
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device / serial</TableHead>
                <TableHead>ICCID</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>GPS tracking</TableHead>
                <TableHead>Feed</TableHead>
                <TableHead>Last position</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const busy = savingKey === row.key;
                const linked = Boolean(row.registry?.vehicle_id);
                return (
                  <TableRow key={row.key}>
                    <TableCell className="align-top">
                      <div className="font-medium">{row.serial}</div>
                      <div className="text-xs text-muted-foreground">{row.providerDeviceId}</div>
                      {row.label && <div className="text-xs text-muted-foreground">{row.label}</div>}
                      {!row.seenAtProvider && (
                        <Badge variant="outline" className="mt-1 font-normal">
                          Not in provider list
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        aria-label={`ICCID for ${row.serial}`}
                        className="w-44"
                        placeholder="ICCID / SIM"
                        value={iccidDraft[row.key] ?? row.iccid ?? ""}
                        onChange={(e) => setIccidDraft((d) => ({ ...d, [row.key]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <VehiclePicker
                        value={row.registry?.vehicle_id ?? null}
                        onChange={(v) => save(row, v)}
                      />
                      {row.registry?.vehicle && (
                        <div className="mt-1 text-xs text-muted-foreground">{vehicleLabel(row.registry.vehicle)}</div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {row.registry?.vehicle_id ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.registry.vehicle_gps_enabled !== false}
                            disabled={savingKey === `gps:${row.key}`}
                            onCheckedChange={(v) => toggleGps(row, v)}
                            aria-label={`GPS tracking for ${vehicleLabel(row.registry.vehicle)}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {row.registry.vehicle_gps_enabled !== false ? "On" : "Off"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {row.registry?.polling_ready ? (
                        <Badge className="gap-1">
                          <Link2 className="h-3 w-3" /> Feeding GPS
                        </Badge>
                      ) : linked && row.registry && row.registry.vehicle_gps_enabled === false ? (
                        <Badge variant="secondary" className="gap-1">
                          <Link2Off className="h-3 w-3" /> GPS off
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Link2Off className="h-3 w-3" /> {linked ? "Paused" : "Not linked"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">
                      <div>{fmt(row.registry?.last_ping ?? row.lastUpdate)}</div>
                      {row.registry?.latitude != null && row.registry?.longitude != null && (
                        <div>
                          {row.registry.latitude.toFixed(4)}, {row.registry.longitude.toFixed(4)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => save(row, row.registry?.vehicle_id ?? null)}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                        {linked && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(row, null)}>
                            Unlink
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    {loading ? "Loading trackers…" : "No trackers match this filter."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <div>
            <h4 className="text-sm font-medium">Register a tracker manually</h4>
            <p className="text-xs text-muted-foreground">
              Use this when a SIM is already installed but the provider search doesn't return it yet.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="manual-device">SareKon device id / serial</Label>
              <Input id="manual-device" value={manualId} onChange={(e) => setManualId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-iccid">ICCID (optional)</Label>
              <Input id="manual-iccid" value={manualIccid} onChange={(e) => setManualIccid(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Vehicle</Label>
              <VehiclePicker value={manualVehicle} onChange={setManualVehicle} />
            </div>
          </div>
          <Button size="sm" onClick={addManual} disabled={savingKey === "__manual__"}>
            {savingKey === "__manual__" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Save link
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
