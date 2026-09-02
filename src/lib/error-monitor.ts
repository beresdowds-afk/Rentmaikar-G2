/**
 * Client-side error monitoring and logging service.
 * Captures unhandled errors, promise rejections, and manual reports.
 * Logs to Supabase for centralized tracking.
 */

import { supabase } from "@/integrations/supabase/client";
import { isAutomationMode } from "@/lib/test-mode";


export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export interface ErrorReport {
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  context?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const ERROR_BUFFER: ErrorReport[] = [];
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUFFER_SIZE = 20;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function createReport(
  error: Error | string,
  severity: ErrorSeverity = "medium",
  context?: string,
  metadata?: Record<string, unknown>
): ErrorReport {
  const err = typeof error === "string" ? new Error(error) : error;
  return {
    message: err.message || String(error),
    stack: err.stack?.slice(0, 2000),
    severity,
    context,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

async function flushErrors() {
  if (ERROR_BUFFER.length === 0) return;

  const batch = ERROR_BUFFER.splice(0, MAX_BUFFER_SIZE);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const enriched = batch.map((report) => ({
      ...report,
      userId: user?.id || "anonymous",
    }));

    // NOTE: client errors are NOT written to admin_audit_log — that table is
    // admin-only (RLS) and normal users' inserts were failing on every flush.
    for (const report of enriched) {
      console.warn("[ErrorMonitor]", report.severity, report.context ?? "", report.message, {
        url: report.url,
        userId: report.userId,
        metadata: report.metadata,
      });
    }
  } catch {
    // Silently fail — don't cause more errors from error reporting
    console.warn("[ErrorMonitor] Failed to flush error reports");
  }
}

/** Report an error manually */
export function reportError(
  error: Error | string,
  severity: ErrorSeverity = "medium",
  context?: string,
  metadata?: Record<string, unknown>
) {
  const report = createReport(error, severity, context, metadata);
  ERROR_BUFFER.push(report);

  // Console output for development
  if (import.meta.env.DEV) {
    if (severity === "low") {
      console.debug(`[Telemetry] ${report.message}`, report.metadata || {});
    } else {
      console.group(`[ErrorMonitor] ${severity.toUpperCase()}`);
      console.error(report.message);
      if (report.context) console.info("Context:", report.context);
      if (report.metadata) console.info("Metadata:", report.metadata);
      console.groupEnd();
    }
  }

  // Flush immediately for critical errors
  if (severity === "critical" || ERROR_BUFFER.length >= MAX_BUFFER_SIZE) {
    flushErrors();
  }
}

/** Initialize global error handlers */
export function initErrorMonitoring() {
  // Automated/headless runs: skip the long-task observer and periodic flush —
  // both keep the main thread and network busy, which stalls Playwright's
  // waitForLoadState("networkidle") and screenshot capture.
  if (isAutomationMode()) return;
  // Unhandled errors

  window.addEventListener("error", (event) => {
    reportError(
      event.error || event.message,
      "high",
      "window.onerror",
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }
    );
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
    reportError(error, "high", "unhandledrejection");
  });

  // Performance: long tasks (>50ms) - tracked as non-blocking telemetry
  if (typeof window !== "undefined" && "PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 350 && import.meta.env.DEV) {
            console.debug(
              `[Performance] Long task detected: ${Math.round(entry.duration)}ms`,
              { duration: entry.duration, startTime: entry.startTime }
            );
          }
        }
      });
      // Defer observing until idle to prevent capturing browser module parsing
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => {
          try {
            observer.observe({ entryTypes: ["longtask"] });
          } catch {
            // Ignored if unsupported
          }
        });
      } else {
        setTimeout(() => {
          try {
            observer.observe({ entryTypes: ["longtask"] });
          } catch {
            // Ignored if unsupported
          }
        }, 1500);
      }
    } catch {
      // longtask not supported in all browsers
    }
  }

  // Periodic flush
  flushTimer = setInterval(flushErrors, FLUSH_INTERVAL_MS);

  // Flush on page unload
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushErrors();
    }
  });

  console.info("[ErrorMonitor] Initialized");
}

/** Cleanup monitoring (for testing) */
export function destroyErrorMonitoring() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushErrors();
}
