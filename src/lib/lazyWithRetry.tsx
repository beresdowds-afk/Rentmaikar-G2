import React, { Component, ComponentType, lazy, LazyExoticComponent, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, WifiOff, Wifi, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isStaleBundleError, hardReload } from "./bundle-recovery";

export interface LazyRetryOptions {
  retries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  chunkName?: string;
}

/**
 * Retries a dynamic import with exponential backoff on network/chunk failure.
 */
export async function executeWithRetry<T>(
  factory: () => Promise<T>,
  options: LazyRetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    initialDelayMs = 800,
    backoffFactor = 1.5,
    chunkName = "AdminDashboard",
  } = options;

  let attempt = 0;

  const run = async (): Promise<T> => {
    try {
      return await factory();
    } catch (error: any) {
      attempt++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNetworkOrChunk =
        isStaleBundleError(error) ||
        /fetch|network|dynamically imported|Loading chunk|Failed to load/i.test(errorMessage) ||
        (typeof navigator !== "undefined" && !navigator.onLine);

      if (attempt <= retries && isNetworkOrChunk) {
        const delay = Math.round(initialDelayMs * Math.pow(backoffFactor, attempt - 1));
        console.warn(
          `[lazyWithRetry:${chunkName}] Fetch failed (attempt ${attempt}/${retries}). Retrying in ${delay}ms...`,
          errorMessage
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return run();
      }

      // Check if one-time bundle recovery reload is appropriate
      const sessionKey = `rmk_chunk_recovery_${chunkName}`;
      if (isStaleBundleError(error) && typeof sessionStorage !== "undefined" && !sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, "1");
        console.warn(`[lazyWithRetry:${chunkName}] Stale chunk detected after retries. Triggering cache-evicted hard reload.`);
        void hardReload();
      }

      throw error;
    }
  };

  return run();
}

/**
 * Enhanced lazy loader with granular exponential-backoff retries.
 * Automatically retries failed chunk fetches during transient network fluctuations.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  options: LazyRetryOptions = {}
): LazyExoticComponent<T> {
  return lazy(() => executeWithRetry(factory, options));
}

interface AdminChunkErrorBoundaryProps {
  children: ReactNode;
  chunkName?: string;
  fallback?: ReactNode;
}

interface AdminChunkErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isOnline: boolean;
  retryKey: number;
}

/**
 * Isolated error boundary for the AdminDashboard chunk to guarantee that
 * chunk loading failures or network drops never produce a blank screen.
 */
export class AdminChunkErrorBoundary extends Component<
  AdminChunkErrorBoundaryProps,
  AdminChunkErrorBoundaryState
> {
  private onlineHandler: () => void;
  private offlineHandler: () => void;

  constructor(props: AdminChunkErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      retryKey: 0,
    };

    this.onlineHandler = () => this.setState({ isOnline: true });
    this.offlineHandler = () => this.setState({ isOnline: false });
  }

  componentDidMount() {
    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.onlineHandler);
    window.removeEventListener("offline", this.offlineHandler);
  }

  static getDerivedStateFromError(error: Error): Partial<AdminChunkErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[AdminChunkErrorBoundary:${this.props.chunkName || "AdminDashboard"}] Chunk load failure caught:`,
      error,
      errorInfo
    );
  }

  handleManualRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryKey: prev.retryKey + 1,
    }));
  };

  handleHardRefresh = () => {
    void hardReload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const chunkLabel = this.props.chunkName || "Admin Dashboard";
      const isNetworkIssue =
        !this.state.isOnline ||
        (this.state.error && isStaleBundleError(this.state.error)) ||
        (this.state.error && /network|fetch|chunk/i.test(this.state.error.message));

      return (
        <div className="min-h-[70vh] flex items-center justify-center p-4 sm:p-8 bg-background">
          <Card className="max-w-lg w-full p-6 sm:p-8 border-border shadow-lg space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                {this.state.isOnline ? (
                  <ShieldAlert className="w-6 h-6" />
                ) : (
                  <WifiOff className="w-6 h-6" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold font-display text-foreground">
                  {isNetworkIssue
                    ? `${chunkLabel} Network Interruption`
                    : `Unable to Load ${chunkLabel}`}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      this.state.isOnline
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {this.state.isOnline ? (
                      <>
                        <Wifi className="w-3 h-3" /> Network Connected
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3 h-3" /> Offline / Disconnected
                      </>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">• Fail-safe active</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {this.state.isOnline
                ? `A transient network fluctuation or cached script update interrupted loading the ${chunkLabel} module. Your administrative session remains completely safe.`
                : `Your device appears to be offline. Please verify your internet connection before retrying to load the administrative interface.`}
            </p>

            {this.state.error && (
              <div className="p-3 bg-muted/60 rounded-md text-xs font-mono text-muted-foreground overflow-auto max-h-28 border border-border/50">
                {this.state.error.message || "Failed to load dynamic chunk"}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <Button
                variant="default"
                onClick={this.handleManualRetry}
                className="gap-2 flex-1"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Loading
              </Button>
              <Button
                variant="outline"
                onClick={this.handleHardRefresh}
                className="gap-2"
                title="Evict cached bundle scripts and hard reload"
              >
                Refresh App
              </Button>
              <Button
                variant="ghost"
                onClick={this.handleGoHome}
                className="gap-2"
              >
                <Home className="w-4 h-4" />
                Home
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
