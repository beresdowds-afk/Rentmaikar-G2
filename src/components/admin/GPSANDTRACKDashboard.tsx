import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge-invoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Satellite, ShieldAlert, ShieldCheck, Search, Send, Eye, Power, Cpu, ListRestart, Activity, KeyRound, Wrench } from "lucide-react";
import { toast } from "sonner";
import { VehiclePicker } from "./VehiclePicker";
import GPSANDTRACKStatusPanel from "./GPSANDTRACKStatusPanel";
import GPSANDTRACKCredentialsPanel from "./GPSANDTRACKCredentialsPanel";
import GPSANDTRACKFleetAdminPanel from "./GPSANDTRACKFleetAdminPanel";


interface GPSANDTRACKDevice {
  id: string;
  serial: string;
  name: string | null;
  model: string | null;
  status: string | null;
  lastUpdate: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  ignition: boolean | null;
  address: string | null;
}

interface LocalDevice {
  id: string;
  serial_number: string;
  vehicle_id: string | null;
  status: string | null;
  last_ping: string | null;
}

interface Diagnosis {
  code?: string;
  title?: string;
  detail?: string;
  hints?: string[];
}

const COMMANDS = [
  { value: "immobilize", label: "Immobilize engine" },
  { value: "mobilize", label: "Re-enable engine" },
  { value: "locate", label: "Locate now" },
];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export default function GPSANDTRACKDashboard() {
  const [status, setStatus] = useState<{ configured: boolean; authenticated?: boolean; base_url?: string; latency_ms?: number; diagnosis?: Diagnosis } | null>(null);
  const [devices, setDevices] = useState<GPSANDTRACKDevice[]>([]);
  const [localDevices, setLocalDevices] = useState<Record<string, LocalDevice>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<null | "sync" | "sync_devices" | "sync_telemetry" | "refresh_commands">(null);
  const [statusRefresh, setStatusRefresh] = useState(0);

  const [testing, setTesting] = useState(false);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<{ dvd_id: string; device: GPSANDTRACKDevice | null; locations: Record<string, unknown>[]; trips: Record<string, unknown>[]; messages: Record<string, unknown>[]; commands: Record<string, unknown>[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [command, setCommand] = useState("immobilize");
  const [commandTarget, setCommandTarget] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await invokeEdge("sarekon-admin", body);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  }, []);

  const loadLocal = useCallback(async () => {
    const { data } = await supabase
      .from("iot_devices")
      .select("id, serial_number, vehicle_id, status, last_ping")
      .eq("provider", "sarekon");
    const map: Record<string, LocalDevice> = {};
    for (const d of (data as LocalDevice[]) || []) map[d.serial_number] = d;
    setLocalDevices(map);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const d = await call({ action: "status" });
      setStatus({
        configured: d.configured !== false,
        authenticated: Boolean(d.authenticated),
        base_url: d.base_url as string,
        latency_ms: d.latency_ms as number,
        diagnosis: d.diagnosis as Diagnosis,
      });
    } catch (e) {
      setStatus({ configured: false, diagnosis: { title: "Status check failed", detail: (e as Error).message } });
    }
  }, [call]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const d = await call({ action: "list_devices" });
      setDevices((d.devices as GPSANDTRACKDevice[]) || []);
      if (d.ok === false) toast.error((d.diagnosis as Diagnosis)?.title ?? "Could not list GPSANDTRACK devices");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    loadStatus();
    loadLocal();
    loadDevices();
  }, [loadStatus, loadLocal, loadDevices]);

  const test = async () => {
    setTesting(true);
    try {
      const d = await call({ action: "test_connection" });
      const diag = d.diagnosis as Diagnosis;
      if (d.authenticated) toast.success(`GPSANDTRACK reachable (${d.latency_ms}ms)`);
      else toast.error(`${diag?.title ?? "Test failed"} — ${diag?.detail ?? ""}`);
      await loadStatus();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const runSync = async (
    action: "sync" | "sync_devices" | "sync_telemetry" | "refresh_commands",
    label: string,
  ) => {
    setSyncing(action);
    try {
      const d = await call({ action, limit: action === "refresh_commands" ? 50 : undefined });
      if (d.ok === false) {
        toast.error((d.diagnosis as Diagnosis)?.title ?? `${label} failed`);
      } else if (action === "refresh_commands") {
        const rows = (d.commands as Record<string, unknown>[]) || [];
        setHistory(rows);
        toast.success(`Command queue refreshed — ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`);
      } else {
        toast.success(
          `${label}: ${d.devices_synced ?? 0} device(s), ${d.positions_imported ?? 0} position(s) — ` +
            `${d.devices_on_shared_map ?? 0} on the shared fleet map`,
        );
      }
      if (action !== "refresh_commands") await Promise.all([loadLocal(), loadDevices()]);
      setStatusRefresh((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(null);
    }
  };


  const openDetail = async (dvdId: string) => {
    setDetailLoading(true);
    setDetail({ dvd_id: dvdId, device: null, locations: [], trips: [], messages: [], commands: [] });
    try {
      const d = await call({ action: "device_detail", dvd_id: dvdId, limit: 25 });
      setDetail({
        dvd_id: dvdId,
        device: (d.device as GPSANDTRACKDevice) ?? null,
        locations: (d.locations as Record<string, unknown>[]) || [],
        trips: (d.trips as Record<string, unknown>[]) || [],
        messages: (d.messages as Record<string, unknown>[]) || [],
        commands: (d.commands as Record<string, unknown>[]) || [],
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const link = async (serial: string, vehicleId: string | null) => {
    const local = localDevices[serial];
    if (!local) {
      toast.error("Run a sync first so the device exists in the registry.");
      return;
    }
    try {
      const d = await call({
        action: vehicleId ? "link_device" : "unlink_device",
        device_row_id: local.id,
        vehicle_id: vehicleId,
      });
      if (d.ok === false) toast.error((d.message as string) ?? "Link failed");
      else toast.success(vehicleId ? "Device linked to vehicle" : "Device unlinked");
      await loadLocal();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const sendCommand = async () => {
    if (!commandTarget) { toast.error("Pick a device"); return; }
    setSending(true);
    try {
      const local = localDevices[commandTarget];
      const d = await call({
        action: "send_command",
        dvd_id: commandTarget,
        command,
        vehicle_id: local?.vehicle_id ?? undefined,
      });
      if (d.ok) toast.success("Command queued with GPSANDTRACK");
      else toast.error((d.diagnosis as Diagnosis)?.title ?? "Command failed");
      await loadHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const loadHistory = useCallback(async () => {
    try {
      const d = await call({ action: "command_history", limit: 50 });
      setHistory((d.commands as Record<string, unknown>[]) || []);
    } catch {
      /* non-fatal */
    }
  }, [call]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) =>
      [d.serial, d.name, d.model, d.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [devices, query]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Satellite className="h-5 w-5" /> GPSANDTRACK tracking
            </CardTitle>
            <CardDescription>
              {status?.base_url ?? "https://api.sarekon.com/v1"} — devices, positions and commands flow into the same
              registry, live map and telemetry feed as every other provider.
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={test} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span className="ml-2">Test connection</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => runSync("sync_devices", "Device sync")} disabled={!!syncing}>
              {syncing === "sync_devices" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
              <span className="ml-2">Sync devices</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => runSync("sync_telemetry", "Telemetry sync")} disabled={!!syncing}>
              {syncing === "sync_telemetry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Satellite className="h-4 w-4" />}
              <span className="ml-2">Sync telemetry</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => runSync("refresh_commands", "Command queue")} disabled={!!syncing}>
              {syncing === "refresh_commands" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListRestart className="h-4 w-4" />}
              <span className="ml-2">Refresh commands</span>
            </Button>
            <Button size="sm" onClick={() => runSync("sync", "Full sync")} disabled={!!syncing}>
              {syncing === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Sync now</span>
            </Button>
          </div>

        </CardHeader>
        <CardContent>
          {status && !status.configured && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>{status.diagnosis?.title ?? "GPSANDTRACK is not configured"}</AlertTitle>
              <AlertDescription>
                {status.diagnosis?.detail} {status.diagnosis?.hints?.join(" ")}
              </AlertDescription>
            </Alert>
          )}
          {status?.configured && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={status.authenticated ? "default" : "destructive"}>
                {status.authenticated ? "Authenticated" : "Auth failed"}
              </Badge>
              {status.latency_ms !== undefined && (
                <span className="text-muted-foreground">{status.latency_ms}ms</span>
              )}
              <span className="text-muted-foreground">
                {Object.keys(localDevices).length} device(s) in the registry
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="devices">
        <TabsList>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="fleet" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Fleet admin
          </TabsTrigger>
          <TabsTrigger value="status" className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Status
          </TabsTrigger>
          <TabsTrigger value="credentials" className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Credentials
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <GPSANDTRACKStatusPanel refreshKey={statusRefresh} />
        </TabsContent>

        <TabsContent value="fleet">
          <GPSANDTRACKFleetAdminPanel onChanged={() => { loadDevices(); loadLocal(); }} />
        </TabsContent>

        <TabsContent value="credentials">
          <GPSANDTRACKCredentialsPanel onStatusChange={() => { loadStatus(); setStatusRefresh((n) => n + 1); }} />
        </TabsContent>


        <TabsContent value="devices" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search serial, name or model" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={loadDevices} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last update</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {loading ? "Loading devices…" : "No GPSANDTRACK devices returned."}
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((d) => {
                    const local = localDevices[d.serial];
                    return (
                      <TableRow key={d.id || d.serial}>
                        <TableCell>
                          <div className="font-medium">{d.name || d.serial}</div>
                          <div className="text-xs text-muted-foreground">{d.serial}{d.model ? ` · ${d.model}` : ""}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={d.status && /online|active/i.test(d.status) ? "default" : "secondary"}>
                            {d.status ?? "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{fmt(d.lastUpdate)}</TableCell>
                        <TableCell className="text-sm">
                          {d.latitude !== null && d.longitude !== null
                            ? `${Number(d.latitude).toFixed(5)}, ${Number(d.longitude).toFixed(5)}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {local ? (
                            <VehiclePicker value={local.vehicle_id} onChange={(v) => link(d.serial, v)} />
                          ) : (
                            <span className="text-xs text-muted-foreground">Sync to register</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openDetail(d.id || d.serial)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setCommandTarget(d.id || d.serial); toast.info("Selected for command"); }}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commands" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" /> Send command</CardTitle>
              <CardDescription>
                Queued through GPSANDTRACK's command queue and recorded in the IoT audit log.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Select value={commandTarget} onValueChange={setCommandTarget}>
                <SelectTrigger className="max-w-xs"><SelectValue placeholder="Select device" /></SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.id || d.serial} value={d.id || d.serial}>
                      {d.name || d.serial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={command} onValueChange={setCommand}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMANDS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={sendCommand} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="ml-2">Send</span>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Command queue history</CardTitle>
              <Button variant="outline" size="sm" onClick={() => runSync("refresh_commands", "Command queue")} disabled={!!syncing}>
                {syncing === "refresh_commands" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListRestart className="h-4 w-4" />}
                <span className="ml-2">Refresh queue</span>
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Command</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No commands yet.</TableCell></TableRow>
                  )}
                  {history.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>{String(c.command ?? c.name ?? c.type ?? "—")}</TableCell>
                      <TableCell>{String(c.dvd_id ?? c.device_id ?? "—")}</TableCell>
                      <TableCell>{String(c.status ?? c.state ?? "—")}</TableCell>
                      <TableCell>{String(c.created_at ?? c.timestamp ?? c.queued_at ?? "—")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Satellite className="h-4 w-4" /> {detail?.device?.name || detail?.dvd_id}</SheetTitle>
            <SheetDescription>Latest GPSANDTRACK locations, trips and messages for this device.</SheetDescription>
          </SheetHeader>
          {detailLoading && <div className="flex items-center gap-2 py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {detail && !detailLoading && (
            <div className="mt-4 space-y-6 text-sm">
              {(["locations", "trips", "messages", "commands"] as const).map((k) => (
                <div key={k}>
                  <div className="mb-2 font-medium capitalize">{k} ({detail[k].length})</div>
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(detail[k].slice(0, 10), null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
