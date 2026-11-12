import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";

interface OperationContext {
  active: boolean;
}

export interface ActiveDatabaseOperation {
  id: number;
  name: string;
  startedAt: string;
}

export class DatabaseShutdownError extends Error {
  readonly code = "DATABASE_SHUTTING_DOWN";
  readonly statusCode = 503;

  constructor() {
    super("Database work is unavailable while the service is shutting down");
    this.name = "DatabaseShutdownError";
  }
}

export class DatabaseLifecycle {
  private readonly context = new AsyncLocalStorage<OperationContext>();
  private readonly active = new Map<number, ActiveDatabaseOperation>();
  private readonly idleWaiters = new Set<() => void>();
  private nextId = 1;
  private shuttingDown = false;

  beginShutdown(): boolean {
    if (this.shuttingDown) return false;
    this.shuttingDown = true;
    return true;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  assertAccessAllowed(): void {
    if (this.shuttingDown && !this.context.getStore()?.active) {
      throw new DatabaseShutdownError();
    }
  }

  beginOperation(name: string): () => void {
    this.assertAccessAllowed();
    const id = this.nextId++;
    this.active.set(id, { id, name, startedAt: new Date().toISOString() });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active.delete(id);
      if (this.active.size === 0) {
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
      }
    };
  }

  runRequestScope(name: string, callback: () => void): () => void {
    const releaseOperation = this.beginOperation(name);
    const operationContext = { active: true };
    try {
      this.context.run(operationContext, callback);
    } catch (error) {
      operationContext.active = false;
      releaseOperation();
      throw error;
    }

    return () => {
      if (!operationContext.active) return;
      operationContext.active = false;
      releaseOperation();
    };
  }

  async runOperation<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const releaseOperation = this.beginOperation(name);
    const operationContext = { active: true };
    try {
      return await this.context.run(operationContext, callback);
    } finally {
      operationContext.active = false;
      releaseOperation();
    }
  }

  async waitForIdle(): Promise<void> {
    if (this.active.size === 0) return;
    await new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }

  getActiveOperations(): ActiveDatabaseOperation[] {
    return [...this.active.values()];
  }
}

export const databaseLifecycle = new DatabaseLifecycle();

export function manageDatabasePool(pool: Pool, name: string, lifecycle = databaseLifecycle): Pool {
  return new Proxy(pool, {
    get(target, property) {
      if (property === "query") {
        const query = Reflect.get(target, property, target);
        return (...args: unknown[]) => {
          const releaseOperation = lifecycle.beginOperation(`${name} query`);
          const queryArgs = [...args];
          const callbackIndex = queryArgs.length - 1;
          const callback = queryArgs[callbackIndex];
          if (typeof callback === "function") {
            queryArgs[callbackIndex] = (...callbackArgs: unknown[]) => {
              try {
                Reflect.apply(callback, undefined, callbackArgs);
              } finally {
                releaseOperation();
              }
            };
          }

          try {
            const result = Reflect.apply(query, target, queryArgs);
            if (typeof callback === "function") return result;
            if (
              typeof result === "object" &&
              result !== null &&
              "then" in result &&
              typeof result.then === "function"
            ) {
              return Promise.resolve(result).finally(releaseOperation);
            }
            releaseOperation();
            return result;
          } catch (error) {
            releaseOperation();
            throw error;
          }
        };
      }

      if (property === "connect") {
        const connect = Reflect.get(target, property, target);
        return (...args: unknown[]) => {
          const releaseOperation = lifecycle.beginOperation(`${name} checked-out client`);
          const connectArgs = [...args];
          const callbackIndex = connectArgs.length - 1;
          const callback = connectArgs[callbackIndex];
          if (typeof callback === "function") {
            connectArgs[callbackIndex] = (...callbackArgs: unknown[]) => {
              if (callbackArgs[0]) {
                releaseOperation();
              } else {
                const client = callbackArgs[1];
                if (client && typeof client === "object" && "release" in client) {
                  const poolClient = client as PoolClient;
                  const originalRelease = poolClient.release.bind(poolClient);
                  poolClient.release = (...releaseArgs: Parameters<PoolClient["release"]>) => {
                    try {
                      return originalRelease(...releaseArgs);
                    } finally {
                      releaseOperation();
                    }
                  };
                } else {
                  releaseOperation();
                }

                const done = callbackArgs[2];
                if (typeof done === "function") {
                  let released = false;
                  callbackArgs[2] = (...releaseArgs: unknown[]) => {
                    try {
                      return Reflect.apply(done, undefined, releaseArgs);
                    } finally {
                      if (!released) {
                        released = true;
                        releaseOperation();
                      }
                    }
                  };
                }
              }
              return Reflect.apply(callback, undefined, callbackArgs);
            };

            try {
              return Reflect.apply(connect, target, connectArgs);
            } catch (error) {
              releaseOperation();
              throw error;
            }
          }

          try {
            return Promise.resolve(Reflect.apply(connect, target, connectArgs)).then(
              (client: PoolClient) => {
                const originalRelease = client.release.bind(client);
                let released = false;
                client.release = (...releaseArgs: Parameters<PoolClient["release"]>) => {
                  try {
                    return originalRelease(...releaseArgs);
                  } finally {
                    if (!released) {
                      released = true;
                      releaseOperation();
                    }
                  }
                };
                return client;
              },
              (error: unknown) => {
                releaseOperation();
                throw error;
              },
            );
          } catch (error) {
            releaseOperation();
            throw error;
          }
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
