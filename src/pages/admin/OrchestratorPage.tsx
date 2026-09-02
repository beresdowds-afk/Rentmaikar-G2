import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield } from "lucide-react";
import orchestrator from "@/services/residentOrchestrator";
import pluginManager from "@/plugins/pluginManager";
import { receiveTraccarEvent } from "@/services/traccarBridge";
import { receiveMQTTMessage } from "@/services/mqttBridge";
import type { VehicleState, AnalyticsEvent } from "@/services/resident-ochestrator/types";
import { useAuth } from "@/contexts/AuthContext";
import TelemetryHealthCard from "@/components/admin/TelemetryHealthCard";
import AdminAuditLogViewer from "@/components/admin/AdminAuditLogViewer";
import OrchestratorE2ETestPanel from "@/components/admin/OrchestratorE2ETestPanel";

export default function OrchestratorPage() {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [states, setStates] = useState<VehicleState[]>(orchestrator.getAllStates());
  const [analytics, setAnalytics] = useState<AnalyticsEvent[]>(orchestrator.getRecentAnalytics());
  const [plugins, setPlugins] = useState(pluginManager.getPlugins());

  useEffect(() => {
    const unsub = orchestrator.subscribe(() => {
      setStates(orchestrator.getAllStates());
      setAnalytics(orchestrator.getRecentAnalytics());
      setPlugins(pluginManager.getPlugins());
    });
    return unsub;
  }, []);

  const togglePlugin = async (id: string, enable: boolean) => {
    if (!isAdmin) return;
    if (enable) await pluginManager.activate(id);
    else await pluginManager.deactivate(id);
    setPlugins(pluginManager.getPlugins());
  };

  const injectDemoTraccar = () => {
    receiveTraccarEvent({
      deviceId: "demo-vehicle-1",
      type: "position",
      latitude: 6.5244,
      longitude: 3.3792,
      speed: 135,
      ignition: true,
      fixTime: new Date().toISOString(),
    });
  };

  const injectDemoMQTT = () => {
    receiveMQTTMessage("rentmaikar/vehicle/demo-vehicle-1/telemetry", {
      battery: 12,
      fuel: 40,
      temperature: 108,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">Resident Orchestrator</h1>
          <p className="text-muted-foreground">
            Unified view of Traccar + MQTT vehicle telemetry, analytics events, and installed plugins.
          </p>
        </div>
        {!isAdmin && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Shield className="h-3 w-3" /> Read-only (admin required for controls)
          </Badge>
        )}
      </div>

      <TelemetryHealthCard />

      {isAdmin && (
        <>
          <div className="flex gap-2">
            <Button variant="outline" onClick={injectDemoTraccar}>
              Inject demo Traccar event
            </Button>
            <Button variant="outline" onClick={injectDemoMQTT}>
              Inject demo MQTT event
            </Button>
          </div>
          <OrchestratorE2ETestPanel />
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Live vehicle state ({states.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {states.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No telemetry yet. Data appears once Traccar or MQTT events flow in.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Speed</TableHead>
                  <TableHead>Ignition</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Fuel</TableHead>
                  <TableHead>Temp</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {states.map((s) => (
                  <TableRow key={s.vehicleId}>
                    <TableCell className="font-mono">{s.vehicleId}</TableCell>
                    <TableCell>{s.speed ?? "—"}</TableCell>
                    <TableCell>{s.ignition === undefined ? "—" : s.ignition ? "on" : "off"}</TableCell>
                    <TableCell>{s.battery ?? "—"}</TableCell>
                    <TableCell>{s.fuel ?? "—"}</TableCell>
                    <TableCell>{s.temperature ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.lastUpdate).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent analytics events</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="space-y-2">
              {analytics.slice(0, 20).map((e, i) => (
                <div key={i} className="flex items-center gap-3 text-sm border rounded p-2">
                  <Badge variant="secondary">{e.category}</Badge>
                  <span className="font-mono">{e.vehicleId}</span>
                  <code className="text-xs text-muted-foreground">{JSON.stringify(e.data)}</code>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plugins</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {plugins.map((p) => (
              <div key={p.id} className="flex items-center justify-between border rounded p-3">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {p.id} · {p.callCount} events processed
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.enabled ? "default" : "outline"}>
                    {p.enabled ? "active" : "disabled"}
                  </Badge>
                  <Switch
                    checked={p.enabled}
                    disabled={!isAdmin}
                    onCheckedChange={(v) => togglePlugin(p.id, v)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isAdmin && <AdminAuditLogViewer />}
    </div>
  );
}
