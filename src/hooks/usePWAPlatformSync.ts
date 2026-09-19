import { useEffect, useState, useCallback } from "react";
import { pwaWorkerManager, type PwaWorkerState, type AnySyncTick } from "@/pwa/pwa-worker-manager";
import { useQueryClient } from "@tanstack/react-query";

export interface SyncLogEntry {
  id: string;
  timestamp: Date;
  type: "tick" | "delta" | "mutation-applied" | "mutation-failed" | "network" | "version";
  summary: string;
  latencyMs?: number;
}

export function usePWAPlatformSync() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PwaWorkerState>(() => pwaWorkerManager.getState());
  const [isSyncing, setIsSyncing] = useState(false);
  const [eventLog, setEventLog] = useState<SyncLogEntry[]>([]);

  // Register query invalidator on mount
  useEffect(() => {
    pwaWorkerManager.registerQueryInvalidator((keys) => {
      keys.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: [key] });
      });
    });
  }, [queryClient]);

  const addLog = useCallback((type: SyncLogEntry["type"], summary: string, latencyMs?: number) => {
    setEventLog((prev) => [
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date(),
        type,
        summary,
        latencyMs,
      },
      ...prev.slice(0, 49), // Keep last 50 entries
    ]);
  }, []);

  useEffect(() => {
    // Synchronize initial state
    setState(pwaWorkerManager.getState());

    const unsubscribe = pwaWorkerManager.subscribe((tick: AnySyncTick) => {
      setState(pwaWorkerManager.getState());

      if (tick.type === "heartbeat") {
        setIsSyncing(false);
      } else if (tick.type === "sync:platform-delta") {
        setIsSyncing(false);
        addLog(
          "delta",
          `Platform delta synced (${tick.delta.activeRegions.length} regions, load: ${tick.delta.serverLoad || "nominal"})`,
          tick.latencyMs
        );
      } else if (tick.type === "sync:mutation-applied") {
        addLog("mutation-applied", `Action '${tick.action}' applied to RentMaikar platform.`);
      } else if (tick.type === "sync:mutation-failed") {
        addLog("mutation-failed", `Mutation failed: ${tick.error}`);
      } else if (tick.type === "sync:network-change") {
        addLog("network", tick.isOnline ? "PWA reconnected to platform." : "PWA entered offline mode.");
      } else if (tick.type === "sync:version-change") {
        addLog("version", `New platform version: ${tick.platformVersion}`);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [addLog]);

  const syncNow = useCallback((forceFull: boolean = false) => {
    setIsSyncing(true);
    addLog("tick", "Triggering manual platform sync probe...");
    pwaWorkerManager.triggerImmediateSync(forceFull);
    setTimeout(() => setIsSyncing(false), 2000);
  }, [addLog]);

  const queueMutation = useCallback(
    async (action: string, payload: Record<string, any>) => {
      const id = await pwaWorkerManager.queueMutation(action, payload);
      addLog("mutation-applied", `Queued mutation '${action}' (${id})`);
      return id;
    },
    [addLog]
  );

  const clearQueue = useCallback(() => {
    pwaWorkerManager.clearQueue();
    addLog("mutation-applied", "Cleared offline mutation queue.");
  }, [addLog]);

  const retryFailed = useCallback(() => {
    pwaWorkerManager.retryFailedMutations();
    addLog("mutation-applied", "Retrying failed offline mutations...");
  }, [addLog]);

  return {
    isSyncing,
    isRunning: state.isRunning,
    isOnline: state.isOnline,
    latencyMs: state.latencyMs,
    lastSyncedAt: state.lastSyncedAt ? new Date(state.lastSyncedAt) : null,
    lastHeartbeatAt: state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt) : null,
    platformVersion: state.platformVersion,
    pendingMutationsCount: state.pendingMutationsCount,
    failedMutationsCount: state.failedMutationsCount,
    workerType: state.workerType,
    ticksEmitted: state.ticksEmitted,
    uptimeMs: state.uptimeMs,
    lastDelta: state.lastDelta,
    eventLog,
    syncNow,
    queueMutation,
    clearQueue,
    retryFailed,
  };
}
