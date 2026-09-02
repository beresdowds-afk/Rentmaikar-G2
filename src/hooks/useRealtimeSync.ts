import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRegion } from "@/contexts/RegionContext";
import { useRealtimeSound, shouldChime } from "@/hooks/useRealtimeSound";
import { toast } from "sonner";
import { isNewBuildAvailable, primeBuildId } from "@/lib/app-version";
import type { LiveSyncCommand, LiveSyncTick } from "@/workers/live-sync.worker";
import {
  isDataSaverActive,
  loadLiveSyncSettings,
  resolveEffectiveIntervals,
  subscribeLiveSyncSettings,
  watchLowBattery,
} from "@/lib/live-sync-settings";


/**
 * Global realtime sync worker. Subscribes to a curated set of tables and
 * invalidates matching react-query caches whenever a row changes so that PWA
 * installs and native mobile builds mirror the live website state.
 *
 * Realtime alone is not enough for installed apps: a PWA can be suspended for
 * hours, miss every websocket frame, and resume with stale data. The worker
 * therefore layers three recovery paths on top of the subscription:
 *   1. websocket postgres_changes  → instant invalidation while connected
 *   2. visibility/focus/online     → full refetch when the app is resumed
 *   3. periodic heartbeat          → refetch when realtime is silently down
 *
 * Only tables that were added to `supabase_realtime` in the accompanying
 * migration will emit events. Silent no-op otherwise.
 */
/** `alert: true` marks a table whose changes are worth an audible cue. */
const TABLES: Array<{ table: string; keys: string[]; alert?: boolean }> = [
  { table: "driver_proxy_billing_accounts", keys: ["proxy-billing", "proxy-accounts"] },
  { table: "proxy_billing_audit_log", keys: ["proxy-audit"] },
  { table: "push_devices", keys: ["push-devices"] },
  { table: "inbox_messages", keys: ["inbox", "inbox-messages"], alert: true },
  { table: "inbox_conversations", keys: ["inbox", "inbox-conversations"] },
  { table: "unified_message_log", keys: ["unified-messages"] },
  { table: "invoices", keys: ["invoices", "billing"], alert: true },
  { table: "receipts", keys: ["receipts", "billing"] },
  { table: "payments", keys: ["payments", "billing"], alert: true },
  { table: "rentals", keys: ["rentals"] },
  { table: "legal_agreements", keys: ["legal-agreements", "agreements"] },
  { table: "vehicle_incidents", keys: ["vehicle-incidents", "incidents"], alert: true },
  { table: "region_definitions", keys: ["allowed-regions", "regions"] },
  { table: "contact_settings", keys: ["contact-settings", "regions"] },
  { table: "platform_company_info", keys: ["company-info", "regions"] },
  { table: "profiles", keys: ["profile", "my-region"] },
  // Platform content & feature rollout — keeps installed apps feature-aligned
  // with the website the moment an admin flips a switch.
  { table: "platform_features", keys: ["platform-features", "features"] },
  { table: "platform_feature_overrides", keys: ["platform-features", "feature-overrides"] },
  { table: "platform_kv_settings", keys: ["platform-settings", "kv-settings"] },
  { table: "subscription_plans", keys: ["subscription-plans", "plans"] },
  { table: "faq_items", keys: ["faq", "faq-items"] },
  { table: "faq_categories", keys: ["faq", "faq-categories"] },
  { table: "tour_step_configs", keys: ["tour-steps", "tour-config"] },
  { table: "region_localized_content", keys: ["regions", "localized-content"] },
  { table: "vehicles", keys: ["vehicles", "catalogue", "owner-vehicles", "public-vehicles", "public-vehicle", "admin-vehicles"] },
  { table: "admin_notifications", keys: ["admin-notifications"], alert: true },
];

/** Broadcast channel name used to fan a refresh out to every open tab/window. */
const SYNC_BROADCAST = "rentmaikar-live-sync";


export function useRealtimeSync(enabled: boolean = true) {
  const qc = useQueryClient();
  const { country } = useRegion();
  const { play } = useRealtimeSound();

  useEffect(() => {
    if (!enabled) return;

    let lastEventAt = Date.now();

    const invalidate = (keys: string[]) => {
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    };

    // Full refetches are expensive and visibly re-render the whole tree, so a
    // rapid burst of focus/visibility/online events must not stack up.
    let lastFullRefreshAt = 0;
    const MIN_FULL_REFRESH_GAP_MS = 15_000;

    const refreshAll = () => {
      const now = Date.now();
      if (now - lastFullRefreshAt < MIN_FULL_REFRESH_GAP_MS) return;
      lastFullRefreshAt = now;
      lastEventAt = now;
      qc.invalidateQueries();
    };


    // 1. Realtime subscription
    const channel = supabase.channel("global-sync");
    for (const { table, keys, alert } of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        () => {
          lastEventAt = Date.now();
          invalidate(keys);
          // Audible cue only for meaningful tables, and only when the user
          // opted in for the active region (see sound-settings defaults).
          if (alert && shouldChime(country)) play();
        },
      );
    }
    channel.subscribe();


    // 2. Resume paths — an installed PWA regains focus / connectivity.
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    const onOnline = () => refreshAll();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);

    // 3. Cross-window fan-out so multiple installs/tabs stay in step.
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(SYNC_BROADCAST);
      bc.onmessage = (event) => {
        if (event.data?.type === "refresh") qc.invalidateQueries();
      };
    }

    // 4. Scheduler worker — off-main-thread timers that survive background
    //    throttling in installed PWAs. Intervals come from the user's live-sync
    //    settings and adapt to data-saver / low-battery conditions. Falls back
    //    to setInterval when the environment has no module-worker support.
    let worker: Worker | null = null;
    let fallbackTimer: number | null = null;
    let updateNotified = false;

    let settings = loadLiveSyncSettings();
    let lowBattery = false;
    let effective = resolveEffectiveIntervals(settings, {
      dataSaver: isDataSaverActive(),
      lowBattery,
    });

    const onHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastEventAt < effective.heartbeatMs) return;
      refreshAll();
    };

    const onVersionCheck = async () => {
      if (updateNotified) return;
      if (!(await isNewBuildAvailable())) return;
      updateNotified = true;
      toast("A new version of Rentmaikar is available", {
        description: "Reload to get the latest features and fixes.",
        duration: Infinity,
        action: { label: "Reload", onClick: () => window.location.reload() },
      });
    };

    void primeBuildId();

    const postToWorker = (cmd: LiveSyncCommand) => worker?.postMessage(cmd);

    /** Recomputes intervals and pushes them to the worker (or fallback timer). */
    const applySchedule = () => {
      effective = resolveEffectiveIntervals(settings, {
        dataSaver: isDataSaverActive(),
        lowBattery,
      });
      const hidden = settings.pauseWhenHidden && document.visibilityState !== "visible";
      if (worker) {
        postToWorker({
          type: "configure",
          heartbeatMs: effective.heartbeatMs,
          versionCheckMs: effective.versionCheckMs,
        });
        postToWorker({ type: hidden ? "pause" : "resume" });
      } else if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = hidden
          ? null
          : window.setInterval(() => {
              onHeartbeat();
              void onVersionCheck();
            }, effective.heartbeatMs);
      }
    };

    try {
      worker = new Worker(new URL("../workers/live-sync.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<LiveSyncTick>) => {
        if (event.data?.type === "heartbeat") onHeartbeat();
        else if (event.data?.type === "version-check") void onVersionCheck();
      };
      postToWorker({
        type: "start",
        heartbeatMs: effective.heartbeatMs,
        versionCheckMs: effective.versionCheckMs,
      });
    } catch {
      worker = null;
      fallbackTimer = window.setInterval(() => {
        onHeartbeat();
        void onVersionCheck();
      }, effective.heartbeatMs);
    }

    // Pause/resume with visibility, and react to setting or condition changes.
    const onVisibilityForSchedule = () => applySchedule();
    document.addEventListener("visibilitychange", onVisibilityForSchedule);

    const unsubscribeSettings = subscribeLiveSyncSettings((next) => {
      settings = next;
      applySchedule();
    });
    const unwatchBattery = watchLowBattery((low) => {
      lowBattery = low;
      applySchedule();
    });
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    const onConnectionChange = () => applySchedule();
    connection?.addEventListener?.("change", onConnectionChange);

    applySchedule();

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onVisibilityForSchedule);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
      connection?.removeEventListener?.("change", onConnectionChange);
      unsubscribeSettings();
      unwatchBattery();
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
      if (worker) {
        worker.postMessage({ type: "stop" } as LiveSyncCommand);
        worker.terminate();
      }
      bc?.close();
      bc = null;
    };

  }, [enabled, qc, country, play]);
}

/** Ask every other open window/tab (and installed PWA instance) to refresh. */
export function broadcastLiveSync() {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const bc = new BroadcastChannel(SYNC_BROADCAST);
    bc.postMessage({ type: "refresh", at: Date.now() });
    bc.close();
  } catch {
    /* unsupported */
  }
}
