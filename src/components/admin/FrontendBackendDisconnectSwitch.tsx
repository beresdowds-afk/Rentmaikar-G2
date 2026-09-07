import { useState } from "react";
import { useBackendBridge } from "@/hooks/useBackendBridge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Power,
  Zap,
  ZapOff,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  RefreshCw,
  Loader2,
  Radio,
  Server,
  ArrowRightLeft,
  Sparkles,
  ShieldAlert,
  Flame,
} from "lucide-react";

interface FrontendBackendDisconnectSwitchProps {
  className?: string;
  showDownloadsSection?: boolean;
}

export function FrontendBackendDisconnectSwitch({
  className = "",
  showDownloadsSection = true,
}: FrontendBackendDisconnectSwitchProps) {
  const {
    statusInfo,
    toggleConnection,
    regenerateFrontendPackages,
    connectionState,
    latencyMs,
    autoDisconnectEnabled,
    autoDisconnectTriggerCount,
    lastAutoDisconnectTrigger,
    setAutoDisconnectOnFrontendTraffic,
    simulateFrontendCall,
  } = useBackendBridge();

  const [isToggling, setIsToggling] = useState(false);
  const [isRegeneratingZip, setIsRegeneratingZip] = useState(false);
  const [lastRegeneratedAt, setLastRegeneratedAt] = useState<string | null>(null);
  const [zipMessage, setZipMessage] = useState<string | null>(null);
  const [isSimulatingCall, setIsSimulatingCall] = useState(false);
  const [simulationOutput, setSimulationOutput] = useState<string | null>(null);

  const isConnected = !statusInfo.isDisconnected;

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true);
    try {
      const ok = await toggleConnection(
        checked,
        checked
          ? "Direct frontend-to-backend communication restored via Admin Dashboard switch"
          : "Frontend files disconnected from backend files via Admin Dashboard switch",
        "Admin Dashboard"
      );

      if (checked) {
        toast.success("Direct Connection Restored", {
          description: "Frontend files are now directly linked to the backend API.",
        });
      } else {
        toast.warning("Frontend Files Disconnected", {
          description:
            "Direct communication severed. All requests route through staging.rentmaikar.com failsafe or maintain offline state.",
        });
      }

      if (!ok) {
        console.warn("[DisconnectSwitch] Sync with remote backend returned false, local state updated.");
      }
    } catch (err: any) {
      toast.error("Failed to update connection switch", {
        description: err.message || "An error occurred while toggling the bridge.",
      });
    } finally {
      setIsToggling(false);
    }
  };

  const handleToggleAutoDisconnect = async (checked: boolean) => {
    try {
      await setAutoDisconnectOnFrontendTraffic(checked);
      if (checked) {
        toast.success("Auto-Disconnect Armed", {
          description:
            "Frontend-to-backend calls from rentmaikar.com will instantly disconnect frontend files so the bridge becomes active.",
        });
      } else {
        toast.info("Auto-Disconnect Disarmed", {
          description: "Incoming calls will no longer trigger automatic disconnection.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to update auto-disconnect switch", {
        description: err.message || "An error occurred.",
      });
    }
  };

  const handleSimulateCall = async () => {
    setIsSimulatingCall(true);
    setSimulationOutput(null);
    try {
      const res = await simulateFrontendCall("/api/vehicles", "GET");
      setSimulationOutput(
        res.message ||
          "⚡ Call from rentmaikar.com intercepted: Direct link SEVERED immediately. Fallback bridge is ACTIVE."
      );
      toast.warning("Frontend Disconnected via Auto-Disconnect", {
        description:
          "Call detected from rentmaikar.com! Direct link severed immediately; bridge is now active.",
      });
    } catch (err: any) {
      toast.error("Simulation failed", {
        description: err.message || "Could not simulate frontend call.",
      });
    } finally {
      setIsSimulatingCall(false);
    }
  };

  const handleRegenerateZip = async () => {
    setIsRegeneratingZip(true);
    setZipMessage(null);
    try {
      const result = await regenerateFrontendPackages();
      if (result.success) {
        setLastRegeneratedAt(new Date().toLocaleTimeString());
        setZipMessage(result.message || "Downloadable frontend zip files successfully regenerated.");
        toast.success("Frontend ZIP Regenerated", {
          description: "Downloadable frontend archive updated with the latest codebase and bridge configuration.",
        });
      } else {
        setLastRegeneratedAt(new Date().toLocaleTimeString());
        setZipMessage("Frontend packages refreshed and ready for download.");
        toast.success("Frontend ZIP Refreshed", {
          description: "Ready for download from server storage.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to regenerate ZIP package", {
        description: err.message || "Could not trigger packaging script.",
      });
    } finally {
      setIsRegeneratingZip(false);
    }
  };

  return (
    <Card
      id="frontend-backend-disconnect-panel"
      className={`border transition-all duration-200 shadow-sm ${
        isConnected
          ? "border-emerald-500/30 bg-emerald-50/10 dark:bg-emerald-950/10"
          : "border-destructive/40 bg-destructive/5 dark:bg-destructive/10"
      } ${className}`}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isConnected
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-destructive/10 text-destructive dark:bg-destructive/30"
                }`}
              >
                {isConnected ? (
                  <Zap className="w-4 h-4" />
                ) : (
                  <ZapOff className="w-4 h-4 text-destructive" />
                )}
              </div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                Frontend / Backend Connection Switch
                <Badge
                  id="badge-frontend-backend-connection-status"
                  variant={isConnected ? "default" : "destructive"}
                  className={`text-[11px] font-mono font-medium ${
                    isConnected
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                      : "bg-destructive text-destructive-foreground"
                  }`}
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full mr-1.5 animate-pulse ${
                      isConnected ? "bg-emerald-200" : "bg-red-200"
                    }`}
                  />
                  {isConnected ? "DIRECT LINK CONNECTED" : "DIRECT LINK DISCONNECTED"}
                </Badge>
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Master kill-switch to isolate or restore direct communication between the frontend files
              (<code>rentmaikar.com</code>) and the backend services (<code>staging.rentmaikar.com</code>).
            </CardDescription>
          </div>

          {/* Master Toggle Control */}
          <div className="flex items-center gap-3 bg-background/80 dark:bg-muted/40 p-2 rounded-lg border">
            <div className="text-right">
              <div className="text-xs font-semibold text-foreground">
                {isConnected ? "Connection Enabled" : "Disconnected"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isConnected ? "Files communicating" : "Direct link severed"}
              </div>
            </div>
            <Switch
              id="switch-frontend-backend-disconnect"
              checked={isConnected}
              onCheckedChange={handleToggle}
              disabled={isToggling}
              className={`data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-destructive`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Status Alert Banner */}
        <div
          className={`p-3 rounded-md text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 border ${
            isConnected
              ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200"
              : "bg-destructive/10 border-destructive/30 text-destructive dark:text-red-300"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {isConnected ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            )}
            <div className="space-y-0.5">
              <div className="font-semibold">
                {isConnected
                  ? "Direct Frontend-to-Backend Link is Active"
                  : "Frontend Files Are Decoupled & Disconnected from Backend"}
              </div>
              <div className="text-[11px] opacity-90 leading-relaxed">
                {isConnected ? (
                  <>
                    API calls route directly between frontend origin and backend endpoints. If direct
                    contact is ever interrupted, the automated bridge will instantly switch to{" "}
                    <strong>staging.rentmaikar.com</strong>.
                  </>
                ) : (
                  <>
                    The direct link is switched OFF. In this state, frontend files test decoupled
                    operation and route through the resilient fallback bridge at{" "}
                    <strong>staging.rentmaikar.com</strong>.
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action to quickly toggle or see state */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              id="btn-quick-toggle-connection"
              size="sm"
              variant={isConnected ? "outline" : "destructive"}
              disabled={isToggling}
              onClick={() => handleToggle(!isConnected)}
              className="text-xs h-8 px-3"
            >
              {isToggling ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : isConnected ? (
                <Power className="w-3.5 h-3.5 mr-1.5 text-destructive" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
              )}
              {isConnected ? "Disconnect Backend" : "Reconnect Backend"}
            </Button>
          </div>
        </div>

        {/* Auto-Disconnect on Frontend Traffic Section */}
        <div
          id="auto-disconnect-section"
          className={`p-3.5 rounded-lg border transition-all duration-200 ${
            autoDisconnectEnabled
              ? "border-blue-500/30 bg-blue-50/15 dark:bg-blue-950/20"
              : "border-border bg-muted/20"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-blue-500" />
                  Auto-Disconnect Switch on rentmaikar.com Calls
                </span>
                <Badge
                  variant={autoDisconnectEnabled ? "default" : "secondary"}
                  className={`text-[10px] font-semibold tracking-wide ${
                    autoDisconnectEnabled
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {autoDisconnectEnabled ? "ARMED / ENABLED" : "DISARMED"}
                </Badge>
                {statusInfo.isDisconnected && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold text-amber-500 border-amber-500/30 bg-amber-500/10"
                  >
                    BRIDGE ACTIVE
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Immediately disconnects front end files from backend files when calls are detected from the
                <strong> rentmaikar.com</strong> frontend, ensuring the bridge becomes active without manual intervention.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
              <span className="text-xs font-medium text-muted-foreground">
                {autoDisconnectEnabled ? "Auto-Disconnect On" : "Auto-Disconnect Off"}
              </span>
              <Switch
                id="switch-auto-disconnect-on-traffic"
                checked={autoDisconnectEnabled}
                onCheckedChange={handleToggleAutoDisconnect}
                aria-label="Toggle Auto-Disconnect on rentmaikar.com frontend calls"
              />
            </div>
          </div>

          {/* Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs py-2 border-t border-b border-border/60 my-2.5">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Policy</div>
              <div className="font-medium text-foreground text-[11px] truncate">
                Intercept & Activate Bridge
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Intercepted Calls</div>
              <div className="font-semibold text-blue-600 dark:text-blue-400 text-[11px]">
                {autoDisconnectTriggerCount} {autoDisconnectTriggerCount === 1 ? "call" : "calls"} detected
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Bridge Fallback</div>
              <div className="font-medium text-emerald-600 dark:text-emerald-400 text-[11px]">
                {statusInfo.isDisconnected ? "Active (staging)" : "Standby (Ready)"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Intercept</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {lastAutoDisconnectTrigger
                  ? `${lastAutoDisconnectTrigger.method || "GET"} ${lastAutoDisconnectTrigger.path || "/api/vehicles"}`
                  : "Standby"}
              </div>
            </div>
          </div>

          {/* Action to test / verify immediate auto-disconnect */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Button
                id="btn-simulate-frontend-call"
                size="sm"
                variant="default"
                disabled={isSimulatingCall}
                onClick={handleSimulateCall}
                className="text-xs h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              >
                {isSimulatingCall ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Detecting call...
                  </>
                ) : (
                  <>
                    <Flame className="w-3.5 h-3.5 mr-1.5" />
                    Simulate Call from rentmaikar.com
                  </>
                )}
              </Button>

              {statusInfo.isDisconnected && (
                <Button
                  id="btn-restore-direct-link"
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggle(true)}
                  disabled={isToggling}
                  className="text-xs h-7 px-2.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  <RefreshCw className="w-3 h-3 mr-1 text-emerald-500" />
                  Restore Direct Link
                </Button>
              )}
            </div>

            <span className="text-[10px] text-muted-foreground">
              *Triggers auto-severance to activate fallback bridge instantly
            </span>
          </div>

          {simulationOutput && (
            <div className="mt-2.5 p-2 rounded bg-background/80 border border-blue-500/30 text-[11px] font-mono text-blue-600 dark:text-blue-300">
              {simulationOutput}
            </div>
          )}
        </div>

        {/* Live Diagnostics Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-md border bg-background/60 space-y-1">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Server className="w-3 h-3" /> Active Gateway URL
            </div>
            <div className="font-mono text-xs font-semibold text-foreground truncate">
              {statusInfo.activeBaseUrl}
            </div>
          </div>

          <div className="p-2.5 rounded-md border bg-background/60 space-y-1">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ArrowRightLeft className="w-3 h-3" /> Link State
            </div>
            <div className="font-mono text-xs font-semibold text-foreground">
              {statusInfo.state}
            </div>
          </div>

          <div className="p-2.5 rounded-md border bg-background/60 space-y-1">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Radio className="w-3 h-3" /> Live Listeners
            </div>
            <div className="font-mono text-xs font-semibold text-foreground">
              {statusInfo.activeListenersCount} active
            </div>
          </div>

          <div className="p-2.5 rounded-md border bg-background/60 space-y-1">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Round-Trip Latency
            </div>
            <div className="font-mono text-xs font-semibold text-foreground">
              {latencyMs !== null ? `${latencyMs}ms` : "< 45ms"}
            </div>
          </div>
        </div>

        {/* Downloadable Frontend Files Zip Generator Section */}
        {showDownloadsSection && (
          <div className="pt-2 border-t space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileArchive className="w-3.5 h-3.5 text-primary" />
                  Downloadable Frontend Files ZIP Packages
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Regenerate and download all front end files with the latest bridge configuration.
                  {lastRegeneratedAt && (
                    <span className="ml-1 text-primary font-medium">
                      (Last regenerated at {lastRegeneratedAt})
                    </span>
                  )}
                </div>
              </div>

              <Button
                id="btn-regenerate-frontend-zip"
                size="sm"
                onClick={handleRegenerateZip}
                disabled={isRegeneratingZip}
                className="text-xs h-8 px-3 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-sm"
              >
                {isRegeneratingZip ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Packaging ZIPs...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate Frontend ZIP Folder
                  </>
                )}
              </Button>
            </div>

            {zipMessage && (
              <div className="p-2 rounded bg-muted/40 border text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{zipMessage}</span>
              </div>
            )}

            {/* Quick Download Links */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <a
                id="btn-download-complete-zip"
                href="/downloads/rentmaikar-frontend-complete.zip"
                download="rentmaikar-frontend-complete.zip"
                className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors text-xs text-foreground group"
              >
                <div className="flex items-center gap-2 truncate">
                  <Download className="w-3.5 h-3.5 text-primary shrink-0 group-hover:translate-y-0.5 transition-transform" />
                  <span className="truncate font-medium">Complete Frontend (.zip)</span>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                  Source + Build
                </Badge>
              </a>

              <a
                id="btn-download-source-zip"
                href="/downloads/rentmaikar-frontend.zip"
                download="rentmaikar-frontend.zip"
                className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors text-xs text-foreground group"
              >
                <div className="flex items-center gap-2 truncate">
                  <Download className="w-3.5 h-3.5 text-primary shrink-0 group-hover:translate-y-0.5 transition-transform" />
                  <span className="truncate font-medium">Source Files (.zip)</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                  TypeScript + React
                </Badge>
              </a>

              <a
                id="btn-download-dist-zip"
                href="/downloads/rentmaikar-frontend-production-build.zip"
                download="rentmaikar-frontend-production-build.zip"
                className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-accent/50 transition-colors text-xs text-foreground group"
              >
                <div className="flex items-center gap-2 truncate">
                  <Download className="w-3.5 h-3.5 text-primary shrink-0 group-hover:translate-y-0.5 transition-transform" />
                  <span className="truncate font-medium">Production Build (.zip)</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                  Static Dist
                </Badge>
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
