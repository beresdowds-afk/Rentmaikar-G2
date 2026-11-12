import type { Server } from "node:http";
import { databaseLifecycle } from "./databaseLifecycle";

export type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface ShutdownResource {
  name: string;
  close: () => Promise<void>;
}

interface ShutdownLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface ShutdownSignalSource {
  on: (signal: ShutdownSignal, listener: () => void) => unknown;
  off: (signal: ShutdownSignal, listener: () => void) => unknown;
}

export interface GracefulShutdownOptions {
  server: Server;
  markShuttingDown: () => void;
  closeEventStreams: () => void;
  stopBackgroundWork: () => Promise<void>;
  resources: ShutdownResource[];
  drainTimeoutMs?: number;
  hardTimeoutMs?: number;
  logger?: ShutdownLogger;
  setExitCode?: (code: number) => void;
  forceExit?: (code: number) => void;
}

type CleanupStatus = "pending" | "succeeded" | "failed";

export interface ShutdownOutcome {
  admission: CleanupStatus;
  eventStreams: CleanupStatus;
  httpDrain: "pending" | "succeeded" | "failed";
  backgroundWork: CleanupStatus;
  resources: { name: string; status: CleanupStatus }[];
  hardDeadlineReached: boolean;
  forcedTermination: boolean;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      server.close((error) => {
        if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
          reject(error);
        } else {
          resolve();
        }
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") resolve();
      else reject(error);
    }
  });
}

export function createGracefulShutdownCoordinator(options: GracefulShutdownOptions) {
  const logger = options.logger ?? console;
  const drainTimeoutMs = options.drainTimeoutMs ?? 6_500;
  const hardTimeoutMs = options.hardTimeoutMs ?? 8_000;
  const setExitCode = options.setExitCode ?? ((code) => { process.exitCode = code; });
  const forceExit = options.forceExit ?? ((code) => process.exit(code));
  const outcome: ShutdownOutcome = {
    admission: "pending",
    eventStreams: "pending",
    httpDrain: "pending",
    backgroundWork: "pending",
    resources: options.resources.map(({ name }) => ({ name, status: "pending" })),
    hardDeadlineReached: false,
    forcedTermination: false,
  };
  let shutdownPromise: Promise<ShutdownOutcome> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  let backgroundStopPromise: Promise<void> | undefined;
  let handlersInstalled = false;
  let signalSource: ShutdownSignalSource | undefined;
  let signalHandlers: Record<ShutdownSignal, () => void> | undefined;
  let resolveHardDeadline!: () => void;
  const hardDeadline = new Promise<void>((resolve) => {
    resolveHardDeadline = resolve;
  });

  const stopBackgroundWork = () => {
    if (!backgroundStopPromise) {
      backgroundStopPromise = Promise.resolve()
        .then(options.stopBackgroundWork)
        .then(() => {
          outcome.backgroundWork = "succeeded";
          logger.info("[Shutdown] Background work cleanup completed");
        })
        .catch((error) => {
          outcome.backgroundWork = "failed";
          setExitCode(1);
          logger.error("[Shutdown] Background work cleanup failed:", error);
        });
    }
    return backgroundStopPromise;
  };

  const cleanupResources = () => {
    if (!cleanupPromise) {
      cleanupPromise = Promise.all(options.resources.map(async ({ name, close }, index) => {
        try {
          await close();
          outcome.resources[index].status = "succeeded";
          logger.info(`[Shutdown] Closed ${name}`);
        } catch (error) {
          outcome.resources[index].status = "failed";
          setExitCode(1);
          logger.error(`[Shutdown] Failed to close ${name}:`, error);
        }
      })).then(() => undefined);
    }
    return cleanupPromise;
  };

  const shutdown = (signal: ShutdownSignal): Promise<ShutdownOutcome> => {
    if (shutdownPromise) {
      logger.info(`[Shutdown] Ignoring repeated ${signal}; shutdown is already in progress`);
      return shutdownPromise;
    }

    shutdownPromise = Promise.resolve().then(async () => {
      let hardDeadlineTimer: NodeJS.Timeout | undefined;
      let drainTimer: NodeJS.Timeout | undefined;
      try {
        logger.info(`[Shutdown] Received ${signal}; beginning graceful shutdown`);
        try {
          options.markShuttingDown();
          outcome.admission = "succeeded";
        } catch (error) {
          outcome.admission = "failed";
          setExitCode(1);
          logger.error("[Shutdown] Failed to stop new application work:", error);
        }

        const forceAtDeadline = async () => {
          outcome.hardDeadlineReached = true;
          setExitCode(1);
          logger.error(`[Shutdown] ${hardTimeoutMs}ms hard deadline reached; cleanup and active work may be interrupted`);
          const activeOperations = databaseLifecycle.getActiveOperations();
          if (activeOperations.length > 0) {
            logger.error("[Shutdown] Database operations incomplete at deadline:", activeOperations);
          }
          const pendingResources = outcome.resources.filter(({ status }) => status === "pending").map(({ name }) => name);
          if (pendingResources.length > 0) {
            logger.error("[Shutdown] Resource cleanup incomplete at deadline:", pendingResources);
          }
          if (outcome.backgroundWork === "pending") {
            logger.error("[Shutdown] Background cleanup incomplete at deadline");
          }
          try {
            options.server.closeAllConnections?.();
          } catch (error) {
            logger.error("[Shutdown] Failed to force-close HTTP connections:", error);
          }
          void stopBackgroundWork();
          void cleanupResources();
          let graceTimer: NodeJS.Timeout | undefined;
          try {
            await Promise.race([
              Promise.all([stopBackgroundWork(), cleanupResources()]),
              new Promise<void>((resolve) => { graceTimer = setTimeout(resolve, 250); }),
            ]);
          } finally {
            if (graceTimer) clearTimeout(graceTimer);
          }
          outcome.forcedTermination = true;
          logger.error("[Shutdown] Forcing process termination; unfinished cleanup will be interrupted");
          forceExit(1);
        };
        hardDeadlineTimer = setTimeout(() => {
          void forceAtDeadline().catch((error) => {
            const terminationAttempted = outcome.forcedTermination;
            outcome.forcedTermination = true;
            process.exitCode = 1;
            console.error("[Shutdown] Hard-deadline escalation failed:", error);
            if (!terminationAttempted) {
              try {
                forceExit(1);
              } catch (exitError) {
                console.error("[Shutdown] Forced termination failed:", exitError);
              }
            }
          }).finally(resolveHardDeadline);
        }, hardTimeoutMs);

        let serverClosed: Promise<void>;
        try {
          serverClosed = closeServer(options.server);
        } catch (error) {
          serverClosed = Promise.reject(error);
        }

        try {
          options.closeEventStreams();
          outcome.eventStreams = "succeeded";
        } catch (error) {
          outcome.eventStreams = "failed";
          setExitCode(1);
          logger.error("[Shutdown] Failed to close active event streams:", error);
        }

        const drainResult = await Promise.race([
          serverClosed.then(
            () => "drained" as const,
            (error) => {
              setExitCode(1);
              logger.error("[Shutdown] HTTP server close failed:", error);
              return "close-failed" as const;
            },
          ),
          new Promise<boolean>((resolve) => {
            drainTimer = setTimeout(() => resolve(false), drainTimeoutMs);
          }),
          hardDeadline.then(() => "hard-deadline" as const),
        ]);
        if (drainTimer) clearTimeout(drainTimer);

        if (drainResult === "drained") {
          outcome.httpDrain = "succeeded";
          logger.info("[Shutdown] HTTP requests and streams drained");
        } else {
          outcome.httpDrain = "failed";
          setExitCode(1);
          if (drainResult === false) {
            logger.warn(`[Shutdown] ${drainTimeoutMs}ms drain deadline reached; remaining requests may be interrupted`);
          } else {
            logger.warn("[Shutdown] HTTP server did not close cleanly; remaining requests may be interrupted");
          }
          try {
            options.server.closeAllConnections?.();
          } catch (error) {
            logger.error("[Shutdown] Failed to force-close HTTP connections:", error);
          }
        }

        const cleanups = Promise.all([stopBackgroundWork(), cleanupResources()]);
        await Promise.race([cleanups, hardDeadline]);
        if (outcome.hardDeadlineReached) await hardDeadline;

        if (
          outcome.admission === "succeeded" &&
          outcome.eventStreams === "succeeded" &&
          outcome.httpDrain === "succeeded" &&
          outcome.backgroundWork === "succeeded" &&
          outcome.resources.every(({ status }) => status === "succeeded") &&
          !outcome.hardDeadlineReached
        ) {
          logger.info("[Shutdown] Graceful shutdown complete");
        } else {
          setExitCode(1);
          logger.warn("[Shutdown] Shutdown incomplete or failed:", outcome);
        }
        return outcome;
      } finally {
        if (drainTimer) clearTimeout(drainTimer);
        if (hardDeadlineTimer) clearTimeout(hardDeadlineTimer);
        if (signalSource && signalHandlers) {
          signalSource.off("SIGTERM", signalHandlers.SIGTERM);
          signalSource.off("SIGINT", signalHandlers.SIGINT);
        }
      }
    });

    return shutdownPromise;
  };

  const installSignalHandlers = (source: ShutdownSignalSource = process) => {
    if (handlersInstalled || shutdownPromise) return;
    handlersInstalled = true;
    signalSource = source;
    const handleSignal = (signal: ShutdownSignal) => () => {
      void Promise.resolve().then(() => shutdown(signal)).catch((error) => {
        process.exitCode = 1;
        console.error("[Shutdown] Shutdown failed unexpectedly:", error);
      });
    };
    signalHandlers = { SIGTERM: handleSignal("SIGTERM"), SIGINT: handleSignal("SIGINT") };
    source.on("SIGTERM", signalHandlers.SIGTERM);
    source.on("SIGINT", signalHandlers.SIGINT);
  };

  return { shutdown, installSignalHandlers };
}
