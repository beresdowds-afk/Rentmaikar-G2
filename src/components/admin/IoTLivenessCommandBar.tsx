import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio, Play, CheckCircle2, Cpu, Car, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  runIoTLivenessTest,
  autoEnableSims,
  autoEnableVehiclesAndPublish,
  runFullIoTOrchestration,
  LivenessTestResult,
} from "@/lib/iot-liveness";

interface IoTLivenessCommandBarProps {
  onRefresh?: () => void;
  compact?: boolean;
}

export const IoTLivenessCommandBar: React.FC<IoTLivenessCommandBarProps> = ({
  onRefresh,
  compact = false,
}) => {
  const [testingLiveness, setTestingLiveness] = useState(false);
  const [enablingSims, setEnablingSims] = useState(false);
  const [enablingVehicles, setEnablingVehicles] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<LivenessTestResult | null>(null);

  const handleLivenessTest = async () => {
    setTestingLiveness(true);
    try {
      const res = await runIoTLivenessTest();
      setLastTestResult(res);
      toast.success("Real-Time Liveness Test Completed", {
        description: `SIMs: ${res.sims.active} active / ${res.sims.inactive} inactive · Devices: ${res.devices.active} active / ${res.devices.inactive} inactive · Vehicles: ${res.vehicles.active} active / ${res.vehicles.inactive} inactive`,
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error("Liveness test failed", { description: err.message });
    } finally {
      setTestingLiveness(false);
    }
  };

  const handleAutoEnableSims = async () => {
    setEnablingSims(true);
    try {
      const res = await autoEnableSims();
      if (res.enabled_count > 0) {
        toast.success(`Auto-Enabled ${res.enabled_count} Device(s)`, {
          description: `Paired available SIMs and activated telemetry. Logged to admin dashboard.`,
        });
      } else {
        toast.info("No unassigned devices or available SIMs to pair", {
          description: "All active devices already have paired SIMs.",
        });
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error("Auto SIM enabling failed", { description: err.message });
    } finally {
      setEnablingSims(false);
    }
  };

  const handleAutoEnableVehicles = async () => {
    setEnablingVehicles(true);
    try {
      const res = await autoEnableVehiclesAndPublish();
      if (res.vehicles_published > 0 || res.devices_provisioned > 0) {
        toast.success(`Vehicle Auto-Enabling Complete`, {
          description: `Provisioned ${res.devices_provisioned} device(s) & automatically published ${res.vehicles_published} vehicle(s) with proper pickup locations to the public catalogue.`,
        });
      } else {
        toast.info("Vehicles already up to date", {
          description: "All vehicles with pickup locations have provisioned devices and are published.",
        });
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error("Auto vehicle enabling failed", { description: err.message });
    } finally {
      setEnablingVehicles(false);
    }
  };

  const handleFullOrchestration = async () => {
    setOrchestrating(true);
    try {
      const res = await runFullIoTOrchestration();
      setLastTestResult(res.liveness_test);
      toast.success("Full IoT Pipeline Executed Successfully", {
        description: `Auto-enabled ${res.sim_auto_enable.enabled_count} SIMs · Tested ${res.liveness_test.devices.total} devices · Auto-published ${res.vehicle_provision_and_publish.vehicles_published} vehicles to public catalogue.`,
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error("Full orchestration failed", { description: err.message });
    } finally {
      setOrchestrating(false);
    }
  };

  return (
    <Card className="border bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight flex items-center gap-1.5">
                <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
                Real-Time IoT Liveness & Auto-Enabling Engine
              </span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider text-emerald-600 border-emerald-500/30 bg-emerald-500/5">
                Live Status Sync
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Evaluates live ping/telemetry to flag active or inactive status across SIMs, devices, and vehicles.
              Auto-enables available hardware and publishes verified vehicles to the Public Catalogue.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLivenessTest}
              disabled={testingLiveness || orchestrating}
              className="h-8 text-xs gap-1.5"
            >
              {testingLiveness ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5 text-emerald-500" />}
              Run Liveness Test
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoEnableSims}
              disabled={enablingSims || orchestrating}
              className="h-8 text-xs gap-1.5"
            >
              {enablingSims ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5 text-blue-500" />}
              Auto-Enable Devices
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoEnableVehicles}
              disabled={enablingVehicles || orchestrating}
              className="h-8 text-xs gap-1.5"
            >
              {enablingVehicles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Car className="h-3.5 w-3.5 text-purple-500" />}
              Publish Ready Vehicles
            </Button>

            <Button
              size="sm"
              onClick={handleFullOrchestration}
              disabled={orchestrating || testingLiveness || enablingSims || enablingVehicles}
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {orchestrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Run Full Orchestration
            </Button>
          </div>
        </div>

        {lastTestResult && !compact && (
          <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              Last Test ({new Date(lastTestResult.timestamp).toLocaleTimeString()}):
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                SIMs: <strong className="text-foreground">{lastTestResult.sims.active} active</strong> / {lastTestResult.sims.inactive} inactive
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                Devices: <strong className="text-foreground">{lastTestResult.devices.active} active</strong> / {lastTestResult.devices.inactive} inactive
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                Vehicles: <strong className="text-foreground">{lastTestResult.vehicles.active} active</strong> / {lastTestResult.vehicles.inactive} inactive
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
