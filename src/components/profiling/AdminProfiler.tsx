import React, { Profiler, ProfilerOnRenderCallback } from "react";
import { reportError } from "@/lib/error-monitor";

/**
 * Default render duration threshold (in milliseconds) above which
 * a render pass is categorized as a performance outlier and logged.
 */
const DEFAULT_MOUNT_THRESHOLD_MS = 120;
const DEFAULT_UPDATE_THRESHOLD_MS = 75;

export interface AdminProfilerProps {
  id: string;
  children: React.ReactNode;
  mountThresholdMs?: number;
  updateThresholdMs?: number;
}

/**
 * Profiler onRender callback that measures component render durations and
 * dispatches telemetry logs for slow rendering outliers.
 */
export const onAdminProfilerRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  const threshold = phase === "mount" ? DEFAULT_MOUNT_THRESHOLD_MS : DEFAULT_UPDATE_THRESHOLD_MS;

  if (actualDuration > threshold) {
    const formattedActual = Math.round(actualDuration * 10) / 10;
    const formattedBase = Math.round(baseDuration * 10) / 10;

    // Log outlier to error monitoring service
    reportError(
      `[Profiler Outlier] ${id} (${phase}): rendered in ${formattedActual}ms (base: ${formattedBase}ms, threshold: ${threshold}ms)`,
      "low",
      "React.Profiler",
      {
        componentId: id,
        phase,
        actualDuration: formattedActual,
        baseDuration: formattedBase,
        thresholdMs: threshold,
        startTime: Math.round(startTime),
        commitTime: Math.round(commitTime),
        path: typeof window !== "undefined" ? window.location.pathname : "",
      }
    );

    if (import.meta.env.DEV) {
      console.warn(
        `[AdminProfiler] Render outlier detected in <${id}>: ${formattedActual}ms (${phase}) exceeds ${threshold}ms threshold`,
        { actualDuration, baseDuration, startTime, commitTime }
      );
    }
  }
};

/**
 * Wraps complex administrative dashboard components in React.Profiler
 * to monitor rendering execution time and alert on performance regressions.
 */
export const AdminProfiler: React.FC<AdminProfilerProps> = ({
  id,
  children,
}) => {
  return (
    <Profiler id={id} onRender={onAdminProfilerRender}>
      {children}
    </Profiler>
  );
};

export default AdminProfiler;
