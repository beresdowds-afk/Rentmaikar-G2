import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, Play, CheckCircle2, AlertTriangle, Cpu } from "lucide-react";
import { toast } from "sonner";

interface ProvisioningState {
  id: string;
  vehicle_id: string;
  device_id: string | null;
  sim_id: string | null;
  stage: string;
  test_status: string;
  last_error: string | null;
  attempts: number;
  tested_at: string | null;
  ready_at: string | null;
  updated_at: string;
}

interface VehicleRow {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  pickup_city: string | null;
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  sims_linked: number;
  devices_enabled: number;
  vehicles_linked: number;
  vehicles_tested: number;
  vehicles_ready: number;
  status: string;
}

const stageVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ready: "default",
  provisioned: "secondary",
  awaiting_device: "outline",
  test_failed: "destructive",
  pending: "outline",
};

export function IoTProvisioningPanel() {
  const [states, setStates] = useState<ProvisioningState[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, VehicleRow>>({});
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: stateRows }, { data: runRows }, { data: control }] = await Promise.all([
      supabase
        .from("iot_provisioning_state")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("iot_provisioning_runs")
        .select("id, started_at, finished_at, sims_linked, devices_enabled, vehicles_linked, vehicles_tested, vehicles_ready, status")
        .order("started_at", { ascending: false })
        .limit(10),
      supabase.from("iot_provisioning_control").select("paused, last_run_at").eq("id", true).maybeSingle(),
    ]);

    const list = (stateRows as ProvisioningState[]) || [];
    setStates(list);
    setRuns((runRows as RunRow[]) || []);
    setPaused(!!control?.paused);
    setLastRunAt(control?.last_run_at ?? null);

    if (list.length) {
      const { data: vRows } = await supabase
        .from("vehicles")
        .select("id, make, model, year, license_plate, pickup_city")
        .in("id", list.map((s) => s.vehicle_id));
      const map: Record<string, VehicleRow> = {};
      for (const v of (vRows as VehicleRow[]) || []) map[v.id] = v;
      setVehicles(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runWorker = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("iot-auto-provision", { body: {} });
      if (error) throw error;
      if (data?.skipped) {
        toast.info(`Run skipped: ${data.skipped}`);
      } else {
        toast.success(
          `SIMs linked ${data?.sims_linked ?? 0} · devices enabled ${data?.devices_enabled ?? 0} · vehicles provisioned ${data?.vehicles_linked ?? 0} · ready ${data?.vehicles_ready ?? 0}`,
        );
      }
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Provisioning run failed");
    } finally {
      setRunning(false);
    }
  };

  const togglePaused = async (next: boolean) => {
    const { error } = await supabase
      .from("iot_provisioning_control")
      .update({ paused: next, pause_reason: next ? "Paused by admin" : null })
      .eq("id", true);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPaused(next);
    toast.success(next ? "Automatic provisioning paused" : "Automatic provisioning resumed");
  };

  const ready = states.filter((s) => s.stage === "ready");
  const inFlight = states.filter((s) => s.stage !== "ready");

  const renderRows = (rows: ProvisioningState[]) =>
    rows.map((s) => {
      const v = vehicles[s.vehicle_id];
      return (
        <TableRow key={s.id}>
          <TableCell className="font-medium">
            {v ? `${v.year} ${v.make} ${v.model}` : s.vehicle_id.slice(0, 8)}
            <div className="text-xs text-muted-foreground">{v?.license_plate}</div>
          </TableCell>
          <TableCell>{v?.pickup_city || "—"}</TableCell>
          <TableCell>
            <Badge variant={stageVariant[s.stage] ?? "outline"}>{s.stage.replace(/_/g, " ")}</Badge>
          </TableCell>
          <TableCell>
            <Badge variant={s.test_status === "passed" ? "default" : s.test_status === "failed" ? "destructive" : "outline"}>
              {s.test_status.replace(/_/g, " ")}
            </Badge>
          </TableCell>
          <TableCell className="text-xs text-muted-foreground max-w-[280px]">
            {s.last_error || (s.ready_at ? `Ready ${new Date(s.ready_at).toLocaleString()}` : "—")}
          </TableCell>
        </TableRow>
      );
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" /> Automatic IoT Provisioning
            </CardTitle>
            <CardDescription>
              Links provisioned SIM cards to available tracking devices, enables those devices, attaches them to
              published vehicles, self-tests each vehicle and lists the ones ready for owner/driver matching.
              {lastRunAt ? ` Last run ${new Date(lastRunAt).toLocaleString()}.` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <Switch id="prov-paused" checked={!paused} onCheckedChange={(v) => togglePaused(!v)} />
              <Label htmlFor="prov-paused" className="text-sm">
                {paused ? "Paused" : "Active"}
              </Label>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={runWorker} disabled={running || paused}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Run now
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Ready for matching" value={ready.length} tone="ready" />
          <Stat label="In provisioning" value={inFlight.filter((s) => s.stage === "provisioned").length} />
          <Stat label="Awaiting device" value={inFlight.filter((s) => s.stage === "awaiting_device").length} />
          <Stat label="Test failed" value={inFlight.filter((s) => s.stage === "test_failed").length} tone="warn" />
        </CardContent>
      </Card>

      {paused && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Automatic provisioning is paused. Scheduled runs are skipped until it is switched back on.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Provisioned & tested — ready for owner/driver matching
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : ready.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicles have completed provisioning yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Pickup city</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{renderRows(ready)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">In progress & blocked</CardTitle>
        </CardHeader>
        <CardContent>
          {inFlight.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing pending.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Pickup city</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{renderRows(inFlight)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent worker runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>SIMs</TableHead>
                  <TableHead>Devices</TableHead>
                  <TableHead>Vehicles</TableHead>
                  <TableHead>Tested</TableHead>
                  <TableHead>Ready</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                    <TableCell>{r.sims_linked}</TableCell>
                    <TableCell>{r.devices_enabled}</TableCell>
                    <TableCell>{r.vehicles_linked}</TableCell>
                    <TableCell>{r.vehicles_tested}</TableCell>
                    <TableCell>{r.vehicles_ready}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ready" | "warn" }) {
  return (
    <div className="rounded-lg border p-4">
      <div
        className={`text-2xl font-semibold ${
          tone === "ready" ? "text-primary" : tone === "warn" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
