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
  Loader2, RefreshCw, Radio, ShieldCheck, ShieldAlert, Download, Play, Pause,
  Signal, Search, Database, KeyRound, Eye, PlugZap, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { IoTAuditTrailPanel } from "./IoTAuditTrailPanel";
import { VehiclePicker } from "./VehiclePicker";
import { HologramDevicesPanel } from "./HologramDevicesPanel";
import { DeviceIdentityPanel } from "./DeviceIdentityPanel";
import { HologramAccountPanel } from "./HologramAccountPanel";
import { HologramOnboardWizard } from "./HologramOnboardWizard";
import { HologramSyncActivityPanel } from "./HologramSyncActivityPanel";


interface SimCard {
  id: string;
  iccid: string;
  msisdn: string | null;
  imsi: string | null;
  provider: string;
  provider_sim_id: string | null;
  status: string;
  plan_name: string | null;
  data_usage_mb: number | null;
  data_limit_mb: number | null;
  last_session_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  vehicle_id: string | null;
  device_id: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

type StatusResp = {
  ok?: boolean;
  configured?: boolean;
  message?: string;
  probe?: { ok?: boolean; status?: number };
};

const StatusPill = ({ status }: { status: string }) => {
  const s = (status || "unknown").toLowerCase();
  const variant =
    s === "live" || s === "active" ? "default"
      : s === "paused" || s === "suspended" ? "secondary"
        : s === "deactivated" ? "destructive" : "outline";
  return <Badge variant={variant as never}>{s}</Badge>;
};

export function HologramDashboard() {
  const [sims, setSims] = useState<SimCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [planId, setPlanId] = useState<string>("");
  const [limitMb, setLimitMb] = useState<string>("");

  const [selected, setSelected] = useState<SimCard | null>(null);
  const [linkVehicle, setLinkVehicle] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<Record<string, { state: string | null; usage_mb: number | null; at: string }>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("iot_sim_cards")
      .select("*")
      .eq("provider", "hologram")
      .order("created_at", { ascending: false })
      .limit(500);
    setSims((data as SimCard[]) || []);
    setLoading(false);
  };

  const refreshStatus = async () => {
    const { data, error } = await supabase.functions.invoke("hologram-admin", {
      body: { action: "status" },
    });
    if (error) return setStatus({ ok: false, configured: false, message: error.message });
    setStatus(data as StatusResp);
  };

  useEffect(() => { load(); refreshStatus(); }, []);

  const run = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("hologram-admin", {
        body: { action, ...body },
      });
      if (error) throw new Error(error.message);
      const res = data as { ok?: boolean; imported?: number; updated?: number; state?: string | null; usage_mb?: number | null };
      if (res?.ok === false) throw new Error(JSON.stringify(res));
      if (action === "import_sims") toast.success(`Imported ${res?.imported ?? 0} SIMs`);
      else if (action === "sync_usage") toast.success(`Synced usage for ${res?.updated ?? 0} SIMs`);
      else if (action === "test_connection") toast.success("Hologram API reachable");
      else if (action === "sync_one_usage" && body.sim_id) {
        setLastSyncResult(prev => ({
          ...prev,
          [String(body.sim_id)]: { state: res?.state ?? null, usage_mb: res?.usage_mb ?? null, at: new Date().toISOString() },
        }));
        toast.success("Usage synced for SIM");
      } else if (action === "link_sim") toast.success("SIM linked");
      else if (action === "unlink_sim") toast.success("SIM unlinked");
      else toast.success("Action complete");
      await load();
      if (selected) {
        const { data: fresh } = await supabase.from("iot_sim_cards").select("*").eq("id", selected.id).maybeSingle();
        if (fresh) setSelected(fresh as SimCard);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const stats = useMemo(() => {
    const total = sims.length;
    const live = sims.filter(s => ["live", "active"].includes((s.status || "").toLowerCase())).length;
    const paused = sims.filter(s => ["paused", "suspended"].includes((s.status || "").toLowerCase())).length;
    const usageMb = sims.reduce((a, s) => a + (s.data_usage_mb || 0), 0);
    const linked = sims.filter(s => s.vehicle_id).length;
    return { total, live, paused, linked, usageMb };
  }, [sims]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sims;
    return sims.filter(s =>
      [s.iccid, s.msisdn, s.imsi, s.provider_sim_id, s.plan_name, s.status]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  }, [sims, query]);

  const configured = status?.configured === true;

  const openDetails = (s: SimCard) => {
    setSelected(s);
    setLinkVehicle(s.vehicle_id);
  };

  const exportSim = (s: SimCard, format: "csv" | "json") => {
    const row = {
      iccid: s.iccid,
      msisdn: s.msisdn,
      imsi: s.imsi,
      provider_sim_id: s.provider_sim_id,
      status: s.status,
      plan_name: s.plan_name,
      data_usage_mb: s.data_usage_mb,
      data_limit_mb: s.data_limit_mb,
      last_session_at: s.last_session_at,
      activated_at: s.activated_at,
      suspended_at: s.suspended_at,
      vehicle_id: s.vehicle_id,
      device_id: s.device_id,
      last_sync_state: s.provider_sim_id ? lastSyncResult[s.provider_sim_id]?.state ?? null : null,
      last_sync_usage_mb: s.provider_sim_id ? lastSyncResult[s.provider_sim_id]?.usage_mb ?? null : null,
      last_sync_at: s.provider_sim_id ? lastSyncResult[s.provider_sim_id]?.at ?? null : null,
      updated_at: s.updated_at,
    };
    let blob: Blob;
    let ext: string;
    if (format === "csv") {
      const keys = Object.keys(row);
      const escape = (v: unknown) => {
        if (v === null || v === undefined) return "";
        const str = String(v).replace(/"/g, '""');
        return /[",\n]/.test(str) ? `"${str}"` : str;
      };
      const csv = keys.join(",") + "\n" + keys.map(k => escape((row as Record<string, unknown>)[k])).join(",");
      blob = new Blob([csv], { type: "text/csv" });
      ext = "csv";
    } else {
      blob = new Blob([JSON.stringify(row, null, 2)], { type: "application/json" });
      ext = "json";
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hologram-sim-${s.iccid || s.id}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported SIM as ${ext.toUpperCase()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary" />
            Hologram eUICC IoT SIM Cards
          </h2>
          <p className="text-muted-foreground">
            Manage Hyper eUICC connectivity — import, activate/suspend, link to vehicles and monitor
            data usage across the Rentmaikar fleet.
          </p>
        </div>
        <Button variant="outline" onClick={() => { load(); refreshStatus(); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Alert variant={configured ? "default" : "destructive"}>
        {configured ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        <AlertTitle>{configured ? "Hologram API connected" : "Hologram API not configured"}</AlertTitle>
        <AlertDescription className="text-sm">
          {status?.message ||
            (configured
              ? "Secrets are present. Live provisioning, usage sync and lifecycle actions are enabled."
              : "Add HOLOGRAM_API_KEY and HOLOGRAM_ORG_ID as backend secrets, then click Refresh.")}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Total SIMs</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Live</p>
          <p className="text-2xl font-bold text-green-600">{stats.live}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Paused</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.paused}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Linked to Vehicles</p>
          <p className="text-2xl font-bold">{stats.linked}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Usage (MB)</p>
          <p className="text-2xl font-bold">{stats.usageMb.toFixed(1)}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="sims" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sims">SIM Inventory</TabsTrigger>
          <TabsTrigger value="onboard">Onboard</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="identity">Device Identity</TabsTrigger>
          <TabsTrigger value="account">Account &amp; Plans</TabsTrigger>
          <TabsTrigger value="ops">Operations</TabsTrigger>
          <TabsTrigger value="sync">Sync Activity</TabsTrigger>
          <TabsTrigger value="setup">API Setup</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="onboard">
          <HologramOnboardWizard onOnboarded={load} />
        </TabsContent>

        <TabsContent value="sync">
          <HologramSyncActivityPanel />
        </TabsContent>

        <TabsContent value="identity">

          <DeviceIdentityPanel />
        </TabsContent>




        <TabsContent value="sims" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search ICCID, MSISDN, plan…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              size="sm" variant="outline"
              disabled={!configured || busy === "sync_usage"}
              onClick={() => run("sync_usage")}
              className="gap-2"
            >
              {busy === "sync_usage" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Signal className="h-4 w-4" />}
              Sync usage
            </Button>
            <Button
              size="sm"
              disabled={!configured || busy === "import_sims"}
              onClick={() => run("import_sims")}
              className="gap-2"
            >
              {busy === "import_sims" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Bulk import
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  No Hologram SIMs recorded. Use <strong>Bulk import</strong> to pull your inventory.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ICCID</TableHead>
                      <TableHead>MSISDN</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Usage (MB)</TableHead>
                      <TableHead>Last Session</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(s => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => openDetails(s)}>
                        <TableCell className="font-mono text-xs">{s.iccid}</TableCell>
                        <TableCell>{s.msisdn || "—"}</TableCell>
                        <TableCell>{s.plan_name || "—"}</TableCell>
                        <TableCell><StatusPill status={s.status} /></TableCell>
                        <TableCell>
                          {(s.data_usage_mb ?? 0).toFixed(1)}
                          {s.data_limit_mb ? ` / ${s.data_limit_mb}` : ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.last_session_at ? new Date(s.last_session_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.vehicle_id ? <Badge variant="outline">Linked</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => openDetails(s)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            disabled={!configured || !s.provider_sim_id || !planId || busy === "activate_sim"}
                            onClick={() => run("activate_sim", { sim_id: s.provider_sim_id, plan_id: Number(planId) })}
                            title={planId ? "Activate SIM" : "Enter a plan ID in Operations first"}
                          ><Play className="h-3.5 w-3.5" /></Button>
                          <Button
                            size="sm" variant="ghost"
                            disabled={!configured || !s.provider_sim_id || busy === "suspend_sim"}
                            onClick={() => run("suspend_sim", { sim_id: s.provider_sim_id })}
                            title="Suspend SIM"
                          ><Pause className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <HologramDevicesPanel />
        </TabsContent>

        <TabsContent value="account">
          <HologramAccountPanel />
        </TabsContent>



        <TabsContent value="ops" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bulk operations</CardTitle>
              <CardDescription>Pull the Hologram inventory and refresh usage counters.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button disabled={!configured || busy === "import_sims"} onClick={() => run("import_sims")} className="gap-2">
                {busy === "import_sims" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Import from Hologram
              </Button>
              <Button variant="outline" disabled={!configured || busy === "sync_usage"} onClick={() => run("sync_usage")} className="gap-2">
                {busy === "sync_usage" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Signal className="h-4 w-4" />}
                Sync usage now
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activation plan</CardTitle>
              <CardDescription>Hologram data plan ID applied when you activate an individual SIM.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                type="number" inputMode="numeric" placeholder="Plan ID (e.g. 73)"
                value={planId} onChange={(e) => setPlanId(e.target.value)}
                className="max-w-xs"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Integration status & keys</CardTitle>
              <CardDescription>
                Backend secrets are managed in Project Settings → Secrets. This panel checks the
                connection and lets you send a live probe.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <code>HOLOGRAM_API_KEY</code>
                  <Badge variant={configured ? "default" : "destructive"}>
                    {configured ? "configured" : "missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <code>HOLOGRAM_ORG_ID</code>
                  <Badge variant={configured ? "default" : "destructive"}>
                    {configured ? "configured" : "missing"}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" onClick={() => run("test_connection")}
                  disabled={!configured || busy === "test_connection"} className="gap-2"
                >
                  {busy === "test_connection" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                  Test connection
                </Button>
                <Button size="sm" variant="outline" onClick={refreshStatus} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Re-check status
                </Button>
                <a
                  href="https://dashboard.hologram.io/account/api"
                  target="_blank" rel="noreferrer"
                  className="text-xs text-muted-foreground underline self-center"
                >
                  Get your Hologram API key →
                </a>
              </div>
              <div className="text-xs text-muted-foreground">
                Base URL: <code>https://dashboard.hologram.io/api/1</code>. Auth: Basic (<code>apikey:$KEY</code>).
                Endpoints used: <code>/links/cellular</code>, <code>/links/cellular/{"{id}"}/state</code>,
                <code> /links/cellular/{"{id}"}/usage</code>.
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Data flow</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Imports write to <code>iot_sim_cards</code> (provider = hologram, unique on ICCID).
              Linking a SIM stores <code>vehicle_id</code> / <code>device_id</code> on the row so
              downstream telemetry can be attributed. Every change is written to <code>iot_audit_log</code>.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <IoTAuditTrailPanel actionPrefix="hologram_" title="Hologram audit trail" />
        </TabsContent>
      </Tabs>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Radio className="h-4 w-4" /> SIM {selected.iccid}
                </SheetTitle>
                <SheetDescription>
                  Provider ID <code>{selected.provider_sim_id || "—"}</code>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <StatusPill status={selected.status} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p>{selected.plan_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">MSISDN</p>
                    <p>{selected.msisdn || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">IMSI</p>
                    <p className="font-mono text-xs">{selected.imsi || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Usage</p>
                    <p>{(selected.data_usage_mb ?? 0).toFixed(2)} MB
                      {selected.data_limit_mb ? ` / ${selected.data_limit_mb}` : ""}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last session</p>
                    <p className="text-xs">{selected.last_session_at ? new Date(selected.last_session_at).toLocaleString() : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Activated</p>
                    <p className="text-xs">{selected.activated_at ? new Date(selected.activated_at).toLocaleString() : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last update</p>
                    <p className="text-xs">{selected.updated_at ? new Date(selected.updated_at).toLocaleString() : "—"}</p>
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5" /> Vehicle mapping
                  </p>
                  <VehiclePicker value={linkVehicle} onChange={setLinkVehicle} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => run("link_sim", { sim_row_id: selected.id, vehicle_id: linkVehicle })}
                      disabled={busy === "link_sim" || linkVehicle === selected.vehicle_id}
                      className="gap-2"
                    >
                      {busy === "link_sim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Save link
                    </Button>
                    {selected.vehicle_id && (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => run("unlink_sim", { sim_row_id: selected.id })}
                        disabled={busy === "unlink_sim"}
                      >Unlink</Button>
                    )}
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-medium">Usage sync</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm" variant="outline" className="gap-2"
                      disabled={!configured || !selected.provider_sim_id || busy === "sync_one_usage"}
                      onClick={() => run("sync_one_usage", { sim_id: selected.provider_sim_id })}
                    >
                      {busy === "sync_one_usage" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Signal className="h-3.5 w-3.5" />}
                      Sync usage for this SIM
                    </Button>
                    <Button
                      size="sm" variant="outline" className="gap-2"
                      onClick={() => exportSim(selected, "csv")}
                    >
                      <Download className="h-3.5 w-3.5" /> Export CSV
                    </Button>
                    <Button
                      size="sm" variant="outline" className="gap-2"
                      onClick={() => exportSim(selected, "json")}
                    >
                      <Download className="h-3.5 w-3.5" /> Export JSON
                    </Button>
                  </div>
                  {selected.provider_sim_id && lastSyncResult[selected.provider_sim_id] && (
                    <p className="text-xs text-muted-foreground">
                      Last result: state <code>{lastSyncResult[selected.provider_sim_id].state ?? "—"}</code>,
                      usage <code>{lastSyncResult[selected.provider_sim_id].usage_mb ?? "—"}</code> MB
                      at {new Date(lastSyncResult[selected.provider_sim_id].at).toLocaleTimeString()}
                    </p>
                  )}
                </div>

                <div className="rounded-md border p-3 space-y-3">
                  <p className="text-xs font-medium">Lifecycle &amp; plan</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm" variant="outline"
                      disabled={!configured || !selected.provider_sim_id || busy === "resume_sim"}
                      onClick={() => run("resume_sim", { sim_id: selected.provider_sim_id })}
                    >Resume</Button>
                    <Button
                      size="sm" variant="outline"
                      disabled={!configured || !selected.provider_sim_id || busy === "suspend_sim"}
                      onClick={() => run("suspend_sim", { sim_id: selected.provider_sim_id })}
                    >Suspend</Button>
                    <Button
                      size="sm" variant="outline"
                      disabled={!configured || !selected.provider_sim_id || !planId || busy === "change_plan"}
                      onClick={() => run("change_plan", { sim_id: selected.provider_sim_id, plan_id: Number(planId) })}
                      title={planId ? "Change plan" : "Set a plan ID in Operations first"}
                    >Change plan</Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" inputMode="numeric" placeholder="Monthly limit (MB)"
                      value={limitMb} onChange={(e) => setLimitMb(e.target.value)} className="max-w-[180px]"
                    />
                    <Button
                      size="sm" variant="outline"
                      disabled={!configured || !selected.provider_sim_id || limitMb === "" || busy === "set_data_limit"}
                      onClick={() => run("set_data_limit", {
                        sim_id: selected.provider_sim_id,
                        limit_bytes: Math.round(Number(limitMb) * 1_000_000),
                      })}
                    >Set data limit</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">0 MB removes the cap (unlimited).</p>
                </div>



                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <details className="rounded-md border p-3">
                    <summary className="text-xs font-medium cursor-pointer">Raw provider payload</summary>
                    <pre className="text-[11px] mt-2 overflow-x-auto">
{JSON.stringify(selected.metadata, null, 2)}
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
