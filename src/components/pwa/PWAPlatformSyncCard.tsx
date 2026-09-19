import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  Layers,
  Radio,
  RefreshCw,
  Send,
  Trash2,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { usePWAPlatformSync } from "@/hooks/usePWAPlatformSync";
import { toast } from "sonner";

export const PWAPlatformSyncCard: React.FC = () => {
  const {
    isSyncing,
    isRunning,
    isOnline,
    latencyMs,
    lastSyncedAt,
    platformVersion,
    pendingMutationsCount,
    failedMutationsCount,
    workerType,
    ticksEmitted,
    lastDelta,
    eventLog,
    syncNow,
    queueMutation,
    clearQueue,
    retryFailed,
  } = usePWAPlatformSync();

  const [testActionLoading, setTestActionLoading] = useState(false);

  const handleTestMutation = async () => {
    setTestActionLoading(true);
    try {
      const id = await queueMutation("driver_vehicle_checkin", {
        vehicleId: "v-test-sync",
        odometer: 14250,
        fuelLevelPercent: 88,
        status: "inspected_and_ready",
        submittedAt: new Date().toISOString(),
      });
      toast.success("Offline mutation queued & dispatched", {
        description: `Action assigned ID: ${id}. Synced to RentMaikar platform.`,
      });
    } catch {
      toast.error("Failed to queue mutation");
    } finally {
      setTestActionLoading(false);
    }
  };

  const getLatencyBadge = (ms: number | null) => {
    if (ms === null) return <Badge variant="outline">Probing...</Badge>;
    if (ms < 150) {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1 font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {ms} ms
        </Badge>
      );
    }
    if (ms < 500) {
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 font-mono">
          {ms} ms
        </Badge>
      );
    }
    return (
      <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 gap-1 font-mono">
        {ms} ms
      </Badge>
    );
  };

  return (
    <Card className="border-border/60 shadow-sm" id="pwa-platform-sync-card">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary animate-pulse" />
              RentMaikar Real-Time PWA Platform Sync Worker
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              Isolated background Web Worker orchestrating live data delta streaming, store-and-forward mutations, and cross-window coordination.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                <Wifi className="h-3 w-3" />
                Online
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <WifiOff className="h-3 w-3" />
                Offline Mode
              </Badge>
            )}
            <Badge variant="secondary" className="gap-1 border font-medium">
              <Cpu className="h-3 w-3 text-primary" />
              {workerType === "dedicated-worker" ? "Dedicated Web Worker" : "Fallback Scheduler"}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Metrics Overview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Platform Latency
            </span>
            <div className="pt-0.5">{getLatencyBadge(latencyMs)}</div>
          </div>

          <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Last Synced
            </span>
            <div className="text-sm font-semibold text-foreground truncate">
              {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : "Pending"}
            </div>
          </div>

          <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-primary" />
              Offline Mutation Queue
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {pendingMutationsCount} pending
              </span>
              {failedMutationsCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1 py-0">
                  {failedMutationsCount} err
                </Badge>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Platform Version
            </span>
            <div className="text-sm font-semibold text-foreground truncate">
              {platformVersion || "2026.09.v1"}
            </div>
          </div>
        </div>

        {/* Worker Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs text-muted-foreground">
              Total Worker Ticks: <strong className="text-foreground">{ticksEmitted}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              id="pwa-sync-test-mutation-btn"
              type="button"
              size="sm"
              variant="outline"
              onClick={handleTestMutation}
              disabled={testActionLoading}
              className="text-xs gap-1.5"
            >
              <Send className="h-3.5 w-3.5 text-primary" />
              Test Store & Forward
            </Button>

            {pendingMutationsCount > 0 && (
              <Button
                id="pwa-sync-clear-queue-btn"
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearQueue}
                className="text-xs text-muted-foreground hover:text-destructive gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Clear Queue
              </Button>
            )}

            <Button
              id="pwa-sync-now-btn"
              type="button"
              size="sm"
              variant="default"
              onClick={() => {
                syncNow(true);
                toast.success("Platform sync requested", {
                  description: "Web Worker executed instant delta fetch & queue flush.",
                });
              }}
              disabled={isSyncing}
              className="text-xs gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          </div>
        </div>

        {/* Active Delta Status */}
        {lastDelta && (
          <div className="rounded-lg border p-3.5 bg-background space-y-2 text-xs">
            <div className="flex items-center justify-between font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Active Platform Synchronization Delta
              </span>
              <span className="text-muted-foreground font-mono">
                Server Epoch: {lastDelta.epoch}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-muted-foreground">
              <div>
                Regions: <strong className="text-foreground">{lastDelta.activeRegions?.join(", ") || "Global"}</strong>
              </div>
              <div>
                Telemetry Pipeline: <strong className="text-foreground">{lastDelta.telemetryActive ? "Active" : "Idle"}</strong>
              </div>
              <div>
                Server Health: <strong className="text-foreground">{lastDelta.serverLoad || "Nominal"}</strong>
              </div>
              <div>
                Announcements: <strong className="text-foreground">{lastDelta.systemAnnouncements ?? 0} active</strong>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostic Activity Stream */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Live Sync Diagnostic Event Stream
            </span>
            <span className="text-[11px] text-muted-foreground">Auto-updating off-thread</span>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 max-h-48 overflow-y-auto space-y-1.5 font-mono text-xs">
            {eventLog.length === 0 ? (
              <div className="text-muted-foreground text-center py-4">
                Listening for real-time worker synchronization events...
              </div>
            ) : (
              eventLog.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-2 py-0.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 uppercase ${
                        log.type === "delta"
                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : log.type === "mutation-applied"
                          ? "border-blue-500/40 text-blue-600 dark:text-blue-400"
                          : log.type === "mutation-failed"
                          ? "border-destructive text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {log.type}
                    </Badge>
                    <span className="text-foreground truncate">{log.summary}</span>
                  </div>
                  {log.latencyMs !== undefined && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {log.latencyMs}ms
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
