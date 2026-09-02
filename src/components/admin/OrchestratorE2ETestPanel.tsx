import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, PlayCircle } from "lucide-react";
import orchestrator from "@/services/residentOrchestrator";
import pluginManager from "@/plugins/pluginManager";
import { receiveTraccarEvent } from "@/services/traccarBridge";
import { receiveMQTTMessage } from "@/services/mqttBridge";
import { supabase } from "@/integrations/supabase/client";

type Result = { name: string; status: "pending" | "pass" | "fail"; detail?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function OrchestratorE2ETestPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  const push = (r: Result) => setResults((prev) => [...prev, r]);
  const update = (i: number, patch: Partial<Result>) =>
    setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const runE2E = async () => {
    setRunning(true);
    setResults([]);
    const vehicleId = `e2e-test-${Date.now()}`;

    // 1. Traccar
    push({ name: "Traccar bridge → orchestrator state", status: "pending" });
    receiveTraccarEvent({
      deviceId: vehicleId,
      type: "position",
      latitude: 6.5,
      longitude: 3.3,
      speed: 140,
      ignition: true,
      fixTime: new Date().toISOString(),
    });
    await sleep(200);
    const state1 = orchestrator.getVehicleState(vehicleId);
    update(0, state1?.speed === 140
      ? { status: "pass", detail: `speed=${state1.speed}` }
      : { status: "fail", detail: "state not updated" });

    // 2. MQTT
    push({ name: "MQTT bridge → orchestrator state", status: "pending" });
    receiveMQTTMessage(`rentmaikar/vehicle/${vehicleId}/telemetry`, {
      battery: 10, temperature: 110,
    });
    await sleep(200);
    const state2 = orchestrator.getVehicleState(vehicleId);
    update(1, state2?.battery === 10
      ? { status: "pass", detail: `battery=${state2.battery} temp=${state2.temperature}` }
      : { status: "fail", detail: "MQTT state not updated" });

    // 3. Plugin fan-out
    push({ name: "pluginManager.process invoked", status: "pending" });
    const plugins = pluginManager.getPlugins();
    const active = plugins.filter((p) => p.enabled);
    if (active.length === 0) {
      update(2, { status: "fail", detail: "no active plugins to observe" });
    } else {
      const baseline = active[0].callCount;
      receiveTraccarEvent({
        deviceId: vehicleId, type: "position", speed: 50, ignition: true,
        fixTime: new Date().toISOString(),
      });
      await sleep(200);
      const after = pluginManager.getCallCount(active[0].id);
      update(2, after > baseline
        ? { status: "pass", detail: `${active[0].id}: ${baseline}→${after}` }
        : { status: "fail", detail: `${active[0].id}: no increment` });
    }

    // 4. vehicle_analytics_events row
    push({ name: "vehicle_analytics_events row written", status: "pending" });
    await sleep(1500);
    const { data, error } = await supabase
      .from("vehicle_analytics_events" as never)
      .select("id, vehicle_id, event_type" as never)
      .eq("vehicle_id" as never, vehicleId as never)
      .limit(5) as { data: Array<{ id: string; event_type: string }> | null; error: unknown };
    update(3, data && data.length > 0
      ? { status: "pass", detail: `${data.length} row(s): ${data.map((r) => r.event_type).join(", ")}` }
      : { status: "fail", detail: error ? String((error as Error).message) : "no rows found" });

    setRunning(false);
  };

  const runToggleTest = async () => {
    setRunning(true);
    setResults([]);
    const plugins = pluginManager.getPlugins();
    if (plugins.length === 0) {
      push({ name: "Plugin toggle test", status: "fail", detail: "no plugins registered" });
      setRunning(false);
      return;
    }
    const target = plugins[0];
    const vehicleId = `toggle-test-${Date.now()}`;

    // disable
    push({ name: `Disable ${target.id} → no processing`, status: "pending" });
    await pluginManager.deactivate(target.id);
    const baseDisabled = pluginManager.getCallCount(target.id);
    receiveTraccarEvent({ deviceId: vehicleId, type: "position", speed: 60, ignition: true, fixTime: new Date().toISOString() });
    await sleep(200);
    const afterDisabled = pluginManager.getCallCount(target.id);
    update(0, afterDisabled === baseDisabled
      ? { status: "pass", detail: `count stayed ${baseDisabled}` }
      : { status: "fail", detail: `count incremented to ${afterDisabled}` });

    // enable
    push({ name: `Enable ${target.id} → processes events`, status: "pending" });
    await pluginManager.activate(target.id);
    const baseEnabled = pluginManager.getCallCount(target.id);
    receiveTraccarEvent({ deviceId: vehicleId, type: "position", speed: 70, ignition: true, fixTime: new Date().toISOString() });
    await sleep(200);
    const afterEnabled = pluginManager.getCallCount(target.id);
    update(1, afterEnabled > baseEnabled
      ? { status: "pass", detail: `${baseEnabled}→${afterEnabled}` }
      : { status: "fail", detail: `no increment` });

    setRunning(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PlayCircle className="h-4 w-4" />
          Telemetry E2E & plugin toggle tests
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button onClick={runE2E} disabled={running} size="sm">
            {running ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
            Run E2E (Traccar → MQTT → Plugin → DB)
          </Button>
          <Button onClick={runToggleTest} disabled={running} size="sm" variant="outline">
            Run plugin toggle test
          </Button>
        </div>
        {results.length > 0 && (
          <div className="space-y-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm border rounded p-2">
                {r.status === "pending" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {r.status === "pass" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {r.status === "fail" && <XCircle className="h-4 w-4 text-destructive" />}
                <span className="flex-1">{r.name}</span>
                <Badge variant={r.status === "pass" ? "default" : r.status === "fail" ? "destructive" : "outline"}>
                  {r.status}
                </Badge>
                {r.detail && <span className="text-xs text-muted-foreground">{r.detail}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
