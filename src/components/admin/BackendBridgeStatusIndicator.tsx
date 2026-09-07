import { useState } from "react";
import { useBackendBridge } from "@/hooks/useBackendBridge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Send,
  Radio,
  Zap,
  ZapOff,
  Globe,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Download,
  FileArchive,
  Loader2,
  Power,
  Sparkles,
} from "lucide-react";

export function BackendBridgeStatusIndicator() {
  const {
    connectionState,
    isFallbackActive,
    isDisconnected,
    statusInfo,
    latencyMs,
    lastHeartbeat,
    recentEvents,
    isSimulatedLoss,
    call,
    respond,
    ping,
    testLink,
    simulateLossOfContact,
    toggleConnection,
    regenerateFrontendPackages,
  } = useBackendBridge();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isRegeneratingZip, setIsRegeneratingZip] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [customAction, setCustomAction] = useState("health");

  const handleRunBidirectionalTest = async () => {
    setIsTesting(true);
    setTestOutput("Initiating bidirectional audit (Call, Listen, Respond)...");
    try {
      const res = await testLink();
      setTestOutput(
        JSON.stringify(
          {
            auditStatus: res.overallHealth,
            callResult: {
              success: res.callSuccess,
              latency: `${res.callLatencyMs}ms`,
              processedBy: res.callProcessedBy,
            },
            listenerResult: {
              active: res.listenActive,
              lastHeartbeatAge: res.lastHeartbeatAgeMs ? `${res.lastHeartbeatAgeMs}ms ago` : "n/a",
            },
            respondResult: {
              success: res.respondSuccess,
              latency: `${res.respondLatencyMs}ms`,
            },
            details: res.details,
          },
          null,
          2
        )
      );
    } catch (err: any) {
      setTestOutput(`Audit failed: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestCall = async () => {
    setIsTesting(true);
    setTestOutput(`Executing call: /bridge/call [action: ${customAction}]...`);
    try {
      const res = await call("/bridge/call", {
        method: "POST",
        body: JSON.stringify({
          action: customAction,
          correlationId: `manual-call-${Date.now()}`,
          clientTimestamp: new Date().toISOString(),
          payload: { source: "Frontend Operator Bridge Test" },
        }),
      });
      setTestOutput(JSON.stringify(res, null, 2));
    } catch (err: any) {
      setTestOutput(`Call failed: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendResponse = async () => {
    setIsTesting(true);
    setTestOutput("Sending frontend response to staging.rentmaikar.com...");
    try {
      const correlationId = `operator-ack-${Date.now()}`;
      const success = await respond(correlationId, "operator_manual_test", {
        message: "Manual response from frontend client",
        view: "BackendBridgeStatusIndicator",
      });
      setTestOutput(
        JSON.stringify(
          {
            success,
            targetUrl: "https://staging.rentmaikar.com/api/bridge/respond",
            correlationId,
            timestamp: new Date().toISOString(),
            status: success ? "Acknowledged by Staging Backend" : "Delivery Error",
          },
          null,
          2
        )
      );
    } catch (err: any) {
      setTestOutput(`Failed to send response: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handlePing = async () => {
    setIsTesting(true);
    try {
      const latency = await ping();
      setTestOutput(`Round-trip ping to staging.rentmaikar.com: ${latency}ms`);
    } catch (err: any) {
      setTestOutput(`Ping failed: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleConnection = async (checked: boolean) => {
    setIsToggling(true);
    try {
      const ok = await toggleConnection(
        checked,
        checked
          ? "Direct connection restored by admin"
          : "Direct connection disconnected by admin switch",
        "Admin Dashboard"
      );
      if (checked) {
        toast.success("Direct Link Reconnected", {
          description: "Front end files are now communicating directly with the backend.",
        });
      } else {
        toast.warning("Direct Link Disconnected", {
          description: "Front end files are disconnected from backend. Routing through staging fallback.",
        });
      }
      if (!ok) {
        console.warn("[BackendBridge] Sync returned false, local state updated.");
      }
    } catch (err: any) {
      toast.error("Toggle error: " + err.message);
    } finally {
      setIsToggling(false);
    }
  };

  const handleRegenerateFrontendZip = async () => {
    setIsRegeneratingZip(true);
    try {
      const res = await regenerateFrontendPackages();
      toast.success("Frontend ZIP Regenerated", {
        description: res.message || "Downloadable frontend packages have been refreshed.",
      });
    } catch (err: any) {
      toast.error("Regeneration error: " + err.message);
    } finally {
      setIsRegeneratingZip(false);
    }
  };

  return (
    <Card id="backend-bridge-status-card" className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">
                Frontend-to-Backend Direct Communication Bridge
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Automatic failover, real-time event listening, and response routing through{" "}
              <span className="font-mono font-medium text-foreground">staging.rentmaikar.com</span>.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct Link Master Switch */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border bg-muted/30">
              <span className="text-[11px] font-medium text-foreground">
                {!statusInfo.isDisconnected ? "Direct Link" : "Disconnected"}
              </span>
              <Switch
                id="switch-bridge-header-status"
                checked={!statusInfo.isDisconnected}
                onCheckedChange={handleToggleConnection}
                disabled={isToggling}
                className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-destructive"
              />
            </div>

            {isFallbackActive ? (
              <Badge
                id="badge-bridge-fallback"
                className="bg-amber-600 hover:bg-amber-600 text-white gap-1.5 py-1 px-2.5 text-xs font-medium"
              >
                <Zap className="h-3.5 w-3.5 animate-pulse" />
                Staging Fallback Active
              </Badge>
            ) : connectionState === "DIRECT" ? (
              <Badge
                id="badge-bridge-direct"
                className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1.5 py-1 px-2.5 text-xs font-medium"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Direct Link Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-500 border-amber-500 gap-1.5 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                {connectionState}
              </Badge>
            )}

            <Button
              id="btn-toggle-bridge-details"
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs h-8"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 mr-1" /> Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 mr-1" /> Diagnostics
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        {/* Topology and active channels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Active Target Base */}
          <div className="p-2.5 rounded-md border bg-muted/20 space-y-1">
            <div className="text-muted-foreground flex items-center gap-1 font-medium">
              <Globe className="h-3.5 w-3.5" /> Active Communication Route
            </div>
            <div className="font-mono text-xs font-semibold truncate text-foreground">
              {statusInfo.activeBaseUrl}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isFallbackActive
                ? "Failsafe mode: Routed via staging.rentmaikar.com"
                : "Primary route: Direct connection"}
            </div>
          </div>

          {/* Real-Time Listener Stream */}
          <div className="p-2.5 rounded-md border bg-muted/20 space-y-1">
            <div className="text-muted-foreground flex items-center gap-1 font-medium">
              <Radio className="h-3.5 w-3.5 text-primary" /> Real-Time Event Listener
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-medium text-foreground">
                Listening to staging.rentmaikar.com
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {lastHeartbeat
                ? `Last pulse: ${new Date(lastHeartbeat).toLocaleTimeString()}`
                : "Waiting for pulse"}
            </div>
          </div>

          {/* Latency & Failover Counter */}
          <div className="p-2.5 rounded-md border bg-muted/20 space-y-1">
            <div className="text-muted-foreground flex items-center gap-1 font-medium">
              <Activity className="h-3.5 w-3.5" /> Round-Trip Latency & Failovers
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium text-foreground">
                {latencyMs !== null ? `${latencyMs}ms` : "< 50ms"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Failovers: <strong className="text-foreground">{statusInfo.lossOfContactCount}</strong>
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Queue: {statusInfo.queuedRequestsCount} requests
            </div>
          </div>
        </div>

        {/* Diagnostic Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              id="btn-toggle-disconnect-files"
              size="sm"
              variant={statusInfo.isDisconnected ? "default" : "destructive"}
              onClick={() => handleToggleConnection(statusInfo.isDisconnected)}
              disabled={isToggling}
              className="text-xs h-7 px-2.5 font-medium"
            >
              {isToggling ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : statusInfo.isDisconnected ? (
                <Zap className="h-3 w-3 mr-1.5" />
              ) : (
                <Power className="h-3 w-3 mr-1.5" />
              )}
              {statusInfo.isDisconnected ? "Reconnect Frontend Files" : "Disconnect Frontend Files"}
            </Button>

            <Button
              id="btn-simulate-loss-of-contact"
              size="sm"
              variant={isSimulatedLoss ? "destructive" : "outline"}
              onClick={() => simulateLossOfContact(!isSimulatedLoss)}
              className="text-xs h-7 px-2.5"
            >
              <Zap className="h-3 w-3 mr-1.5" />
              {isSimulatedLoss ? "Restore Direct Contact" : "Simulate Loss of Contact"}
            </Button>

            <Button
              id="btn-bridge-test-call"
              size="sm"
              variant="outline"
              onClick={handleTestCall}
              disabled={isTesting}
              className="text-xs h-7 px-2.5"
            >
              <Activity className="h-3 w-3 mr-1.5" />
              Test Call via Staging
            </Button>

            <Button
              id="btn-bridge-send-response"
              size="sm"
              variant="outline"
              onClick={handleSendResponse}
              disabled={isTesting}
              className="text-xs h-7 px-2.5"
            >
              <Send className="h-3 w-3 mr-1.5" />
              Send Response to Backend
            </Button>

            <Button
              id="btn-bridge-ping"
              size="sm"
              variant="outline"
              onClick={handlePing}
              disabled={isTesting}
              className="text-xs h-7 px-2.5"
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${isTesting ? "animate-spin" : ""}`} />
              Ping Staging
            </Button>
          </div>

          <Button
            id="btn-bridge-bidirectional-audit"
            size="sm"
            onClick={handleRunBidirectionalTest}
            disabled={isTesting}
            className="text-xs h-7 px-3 bg-primary text-primary-foreground"
          >
            Audit Link (Call/Listen/Respond)
          </Button>
        </div>

        {/* Download Frontend Packages Bar */}
        <div className="p-3 rounded-lg border bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <FileArchive className="h-4 w-4 text-primary" />
              Download Frontend Packages (.zip)
            </div>
            <div className="text-[11px] text-muted-foreground">
              All frontend source files &amp; production build configured for standalone hosting on <span className="font-mono text-foreground font-medium">rentmaikar.com</span>.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              id="btn-regenerate-frontend-packages"
              size="sm"
              variant="outline"
              onClick={handleRegenerateFrontendZip}
              disabled={isRegeneratingZip}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-background border hover:bg-muted text-foreground transition-colors shadow-xs h-auto"
            >
              {isRegeneratingZip ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <RefreshCw className="h-3 w-3 text-primary" />
              )}
              Regenerate ZIP
            </Button>

            <a
              id="btn-download-frontend-source"
              href="/downloads/rentmaikar-frontend.zip"
              download="rentmaikar-frontend.zip"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-background border hover:bg-muted text-foreground transition-colors shadow-xs"
            >
              <Download className="h-3 w-3 text-primary" />
              Source Code (4.2MB)
            </a>

            <a
              id="btn-download-frontend-dist"
              href="/downloads/rentmaikar-frontend-production-build.zip"
              download="rentmaikar-frontend-production-build.zip"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-background border hover:bg-muted text-foreground transition-colors shadow-xs"
            >
              <Download className="h-3 w-3 text-emerald-600" />
              Production Build (4.0MB)
            </a>

            <a
              id="btn-download-frontend-complete"
              href="/downloads/rentmaikar-frontend-complete.zip"
              download="rentmaikar-frontend-complete.zip"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
            >
              <Download className="h-3 w-3" />
              Complete Bundle (8.2MB)
            </a>
          </div>
        </div>

        {/* Expanded Diagnostics Drawer */}
        {isExpanded && (
          <div className="space-y-3 pt-2 border-t text-xs">
            {testOutput && (
              <div className="space-y-1">
                <div className="font-semibold text-muted-foreground">Test Output:</div>
                <pre className="p-2.5 rounded bg-muted/50 font-mono text-[11px] overflow-x-auto max-h-48 border text-foreground">
                  {testOutput}
                </pre>
              </div>
            )}

            <div className="space-y-1">
              <div className="font-semibold text-muted-foreground flex items-center justify-between">
                <span>Recent Event Stream Packets ({recentEvents.length}):</span>
                <span className="text-[10px] text-muted-foreground">Live SSE from staging.rentmaikar.com</span>
              </div>
              <div className="max-h-36 overflow-y-auto border rounded divide-y bg-muted/10 font-mono text-[11px]">
                {recentEvents.length === 0 ? (
                  <div className="p-2 text-muted-foreground text-center">
                    Listening for incoming backend event packets...
                  </div>
                ) : (
                  recentEvents.slice(0, 8).map((evt) => (
                    <div key={evt.id} className="p-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          {evt.type}
                        </Badge>
                        <span className="truncate text-foreground">
                          {evt.data?.message || JSON.stringify(evt.data)}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
