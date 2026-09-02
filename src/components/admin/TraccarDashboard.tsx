import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Loader2, RefreshCw, Satellite, ShieldCheck, ShieldAlert, Download, Ban,
  Power, MapPin, Search, KeyRound, Database, Send, Link2, Eye, PlugZap,
} from "lucide-react";
import { toast } from "sonner";
import { IngestionMonitor } from "./IngestionMonitor";
import { IoTAuditTrailPanel } from "./IoTAuditTrailPanel";
import { VehiclePicker } from "./VehiclePicker";
import { TraccarSyncActivityPanel } from "./TraccarSyncActivityPanel";
import { TraccarCredentialsPanel } from "./TraccarCredentialsPanel";
import { TraccarDevicePortsPanel } from "./TraccarDevicePortsPanel";


interface Device {
  id: string;
  serial_number: string;
  provider: string;
  device_model: string | null;
  status: string;
  last_ping: string | null;
  latitude: number | null;
  longitude: number | null;
  telemetry_enabled: boolean;
  is_linked: boolean | null;
  vehicle_id: string | null;
  health_details: Record<string, unknown> | null;
}

type StatusResp = {
  ok?: boolean;
  configured?: boolean;
  base_url?: string | null;
  message?: string;
  ping?: { ok?: boolean; body?: { name?: string } };
};

export function TraccarDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cmdDevice, setCmdDevice] = useState<string>("");
  const [cmd, setCmd] = useState<string>("engineStop");
  const [selected, setSelected] = useState<Device | null>(null);
  const [linkVehicle, setLinkVehicle] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("iot_devices")
      .select("id, serial_number, provider, device_model, status, last_ping, latitude, longitude, telemetry_enabled, is_linked, vehicle_id, health_details")
      .eq("provider", "traccar")
      .order("last_ping", { ascending: false, nullsFirst: false })
      .limit(500);
    setDevices((data as Device[]) || []);
    setLoading(false);
  };

  const refreshStatus = async () => {
    const { data, error } = await supabase.functions.invoke("traccar-admin", {
      body: { action: "status" },
    });
    if (error) return setStatus({ ok: false, configured: false, message: error.message });
    setStatus(data as StatusResp);
  };

  useEffect(() => { load(); refreshStatus(); }, []);

  const run = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("traccar-admin", {
        body: { action, ...body },
      });
      if (error) throw new Error(error.message);
      const res = data as {
        ok?: boolean;
        devices_synced?: number;
        positions_received?: number;
        configured?: boolean;
        queued?: boolean;
        delivery?: string;
        error?: string;
        message?: string;
        supported_commands?: string[];
        ping?: { ok?: boolean };
        diagnosis?: { title?: string; detail?: string; code?: string };
      };
      if (res?.ok === false) {
        if (res.error === "unsupported_command") {
          toast.error(res.message ?? "Command not supported by this device", {
            description: res.supported_commands?.length
              ? `Supported: ${res.supported_commands.join(", ")}`
              : undefined,
          });
          return;
        }
        throw new Error(
          res.diagnosis ? `${res.diagnosis.title} — ${res.diagnosis.detail}` : JSON.stringify(res),
        );
      }
      if (action === "test_connection" && (res?.configured === false || res?.ping?.ok !== true)) {
        toast.error(res?.diagnosis?.title ?? "Traccar connection failed", {
          description: res?.diagnosis?.detail,
        });
        await refreshStatus();
        return;
      }
      if (action === "sync") toast.success(`Synced ${res?.devices_synced ?? 0} devices (${res?.positions_received ?? 0} positions)`);
      else if (action === "send_command") {
        if (res?.queued) {
          toast.success("Command queued", {
            description: "Device is offline — Traccar will deliver it on the next connection.",
          });
        } else {
          toast.success("Command delivered to device");
        }
      }
      else if (action === "test_connection") toast.success("Traccar reachable");


      else if (action === "link_device") toast.success("Device linked");
      else if (action === "unlink_device") toast.success("Device unlinked");
      else toast.success("Action complete");
      await load();
      if (selected) {
        const { data: fresh } = await supabase
          .from("iot_devices")
          .select("id, serial_number, provider, device_model, status, last_ping, latitude, longitude, telemetry_enabled, is_linked, vehicle_id, health_details")
          .eq("id", selected.id)
          .maybeSingle();
        if (fresh) setSelected(fresh as Device);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status === "active").length;
    const offline = devices.filter(d => d.status !== "active").length;
    const linked = devices.filter(d => d.vehicle_id).length;
    const withGps = devices.filter(d => d.latitude !== null && d.longitude !== null).length;
    return { total, online, offline, linked, withGps };
  }, [devices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(d =>
      [d.serial_number, d.device_model, d.status].filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q)));
  }, [devices, query]);

  const configured = status?.configured === true;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Satellite className="h-6 w-6 text-primary" />
            Traccar Tracking Dashboard
          </h2>
          <p className="text-muted-foreground">
            GPS telemetry, geofence-ready positions and remote engine commands wired directly
            to the Rentmaikar fleet.
          </p>
        </div>
        <Button variant="outline" onClick={() => { load(); refreshStatus(); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Alert variant={configured ? "default" : "destructive"}>
        {configured ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        <AlertTitle>
          {configured
            ? `Traccar connected${status?.ping?.body?.name ? ` — ${status.ping.body.name}` : ""}`
            : "Traccar not configured"}
        </AlertTitle>
        <AlertDescription className="text-sm">
          {status?.message ||
            (configured
              ? `Base URL: ${status?.base_url}. Devices and positions can be synced on demand.`
              : "Add TRACCAR_BASE_URL and either TRACCAR_TOKEN or TRACCAR_EMAIL + TRACCAR_PASSWORD, then click Refresh.")}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Devices</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Online</p>
          <p className="text-2xl font-bold text-green-600">{stats.online}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Offline</p>
          <p className="text-2xl font-bold text-red-500">{stats.offline}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">GPS Fixed</p>
          <p className="text-2xl font-bold">{stats.withGps}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Linked to Vehicles</p>
          <p className="text-2xl font-bold">{stats.linked}</p>
        </CardContent></Card>
      </div>

      <IngestionMonitor
        provider="traccar"
        functionName="traccar-admin"
        syncAction="sync"
        disabled={!configured}
        onSynced={load}
        enableVehicleScope
      />

      <Tabs defaultValue="devices" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="commands">Remote Commands</TabsTrigger>
          <TabsTrigger value="sync">Sync Activity</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="ports">Device Ports</TabsTrigger>
          <TabsTrigger value="setup">API Setup</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
          <TraccarSyncActivityPanel />
        </TabsContent>

        <TabsContent value="credentials" className="space-y-4">
          <TraccarCredentialsPanel />
        </TabsContent>

        <TabsContent value="ports" className="space-y-4">
          <TraccarDevicePortsPanel />
        </TabsContent>


        <TabsContent value="devices" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search unique ID / model…"
                value={query} onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              size="sm" disabled={!configured || busy === "sync"} onClick={() => run("sync")}
              className="gap-2"
            >
              {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Sync from Traccar
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  No Traccar devices yet. Configure the API in Setup, then click <strong>Sync from Traccar</strong>.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unique ID</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Ping</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(d => (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer"
                        onClick={() => { setSelected(d); setLinkVehicle(d.vehicle_id); }}
                      >
                        <TableCell className="font-mono text-xs">{d.serial_number}</TableCell>
                        <TableCell>{d.device_model || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={d.status === "active" ? "default" : "secondary"}>{d.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {d.last_ping ? new Date(d.last_ping).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {d.latitude !== null && d.longitude !== null ? (
                            <a
                              className="inline-flex items-center gap-1 underline"
                              target="_blank" rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              href={`https://www.google.com/maps?q=${d.latitude},${d.longitude}`}
                            >
                              <MapPin className="h-3 w-3" />
                              {d.latitude.toFixed(4)}, {d.longitude.toFixed(4)}
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {d.vehicle_id ? <Badge variant="outline">Linked</Badge> : <span className="text-xs text-muted-foreground">Unlinked</span>}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => { setSelected(d); setLinkVehicle(d.vehicle_id); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commands" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Power className="h-4 w-4" /> Send remote command</CardTitle>
              <CardDescription>
                Rentmaikar safety rule: immobilization only when the vehicle is stationary
                (speed = 0 and ignition off). Commands here are dispatched through the Traccar API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Traccar device ID</label>
                  <Input
                    type="number" placeholder="e.g. 42"
                    value={cmdDevice} onChange={(e) => setCmdDevice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Command type</label>
                  <Input
                    placeholder="engineStop / engineResume / custom"
                    value={cmd} onChange={(e) => setCmd(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={!configured || !cmdDevice || !cmd || busy === "send_command"}
                    onClick={() => run("send_command", { device_id: Number(cmdDevice), command: cmd })}
                    className="gap-2 w-full"
                  >
                    {busy === "send_command" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send
                  </Button>
                </div>
              </div>
              <Alert>
                <Ban className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Use <code>engineStop</code> to immobilize and <code>engineResume</code> to release. Custom command
                  names must match a Traccar-supported protocol type for the device.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Required secrets</CardTitle>
              <CardDescription>Configure these backend secrets to enable Traccar.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div><code>TRACCAR_BASE_URL</code> — e.g. <code>https://demo.traccar.org</code> or your self-hosted URL</div>
              <div><code>TRACCAR_TOKEN</code> — recommended: personal API token (Bearer auth)</div>
              <div className="text-muted-foreground">— or —</div>
              <div><code>TRACCAR_EMAIL</code> + <code>TRACCAR_PASSWORD</code> — Basic auth fallback</div>
              <div className="text-muted-foreground text-xs pt-2">
                Endpoints used: <code>/api/server</code>, <code>/api/devices</code>, <code>/api/positions</code>,
                <code> /api/commands/send</code>.
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PlugZap className="h-4 w-4" /> Test connection</CardTitle>
              <CardDescription>Send a live probe to the Traccar server using the configured credentials.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                size="sm" disabled={!configured || busy === "test_connection"}
                onClick={() => run("test_connection")} className="gap-2"
              >
                {busy === "test_connection" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Test connection
              </Button>
              <Button size="sm" variant="outline" onClick={refreshStatus} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Re-check status
              </Button>
              <a
                href="https://www.traccar.org/api-reference/" target="_blank" rel="noreferrer"
                className="text-xs text-muted-foreground underline self-center"
              >
                Traccar API reference →
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Data flow</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Sync writes devices to <code>iot_devices</code> (provider = traccar, unique on serial_number)
              and appends each latest position to <code>mqtt_telemetry_logs</code> enriched with the linked
              <code> vehicle_id</code> (topic <code>traccar/{"{uniqueId}"}/position</code>) so the IoT Monitoring
              Hub, driver behaviour rules and geofence engine consume Traccar the same as any other provider.
              Every engine command is recorded in <code>iot_audit_log</code>.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <IoTAuditTrailPanel actionPrefix="traccar_" title="Traccar audit trail" />
        </TabsContent>
      </Tabs>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Satellite className="h-4 w-4" /> Device {selected.serial_number}
                </SheetTitle>
                <SheetDescription>
                  {selected.device_model || "Traccar device"} · status <code>{selected.status}</code>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Last ping</p>
                    <p className="text-xs">{selected.last_ping ? new Date(selected.last_ping).toLocaleString() : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Position</p>
                    <p className="text-xs">
                      {selected.latitude !== null && selected.longitude !== null
                        ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telemetry</p>
                    <p className="text-xs">{selected.telemetry_enabled ? "enabled" : "disabled"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Traccar ID</p>
                    <p className="text-xs font-mono">
                      {(selected.health_details as { traccar_device_id?: number } | null)?.traccar_device_id ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5" /> Link device to vehicle
                  </p>
                  <VehiclePicker value={linkVehicle} onChange={setLinkVehicle} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => run("link_device", { device_row_id: selected.id, vehicle_id: linkVehicle })}
                      disabled={busy === "link_device" || linkVehicle === selected.vehicle_id}
                      className="gap-2"
                    >
                      {busy === "link_device" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Save link
                    </Button>
                    {selected.vehicle_id && (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => run("unlink_device", { device_row_id: selected.id })}
                        disabled={busy === "unlink_device"}
                      >Unlink</Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Once linked, subsequent Traccar positions are written to
                    <code> mqtt_telemetry_logs</code> tagged with this vehicle.
                  </p>
                </div>

                {selected.health_details && (
                  <details className="rounded-md border p-3">
                    <summary className="text-xs font-medium cursor-pointer">Raw health details</summary>
                    <pre className="text-[11px] mt-2 overflow-x-auto">
{JSON.stringify(selected.health_details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
