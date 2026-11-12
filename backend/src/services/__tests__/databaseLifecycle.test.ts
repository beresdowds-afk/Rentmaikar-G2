import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool, PoolClient } from "pg";
import {
  DatabaseLifecycle,
  DatabaseShutdownError,
  databaseLifecycle,
  manageDatabasePool,
} from "../databaseLifecycle";
import { closeDbPool, getDbPool } from "../dbPool";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("database shutdown lifecycle", () => {
  it("drains an admitted operation and permits its nested database work", async () => {
    const lifecycle = new DatabaseLifecycle();
    const entered = deferred();
    const continueOperation = deferred();
    let nestedOperationRan = false;

    const operation = lifecycle.runOperation("in-flight request", async () => {
      entered.resolve();
      await continueOperation.promise;
      await lifecycle.runOperation("in-flight query", async () => {
        nestedOperationRan = true;
      });
    });

    await entered.promise;
    assert.equal(lifecycle.beginShutdown(), true);
    assert.equal(lifecycle.beginShutdown(), false);
    assert.throws(() => lifecycle.beginOperation("new work"), DatabaseShutdownError);

    let drained = false;
    const drain = lifecycle.waitForIdle().then(() => { drained = true; });
    await Promise.resolve();
    assert.equal(drained, false);

    continueOperation.resolve();
    await operation;
    await drain;
    assert.equal(nestedOperationRan, true);
    assert.deepEqual(lifecycle.getActiveOperations(), []);
  });

  it("rejects detached work after its initiating operation scope ends", async () => {
    const lifecycle = new DatabaseLifecycle();
    const continueDetachedWork = deferred();
    const detachedStarted = deferred();
    let detachedResult: Promise<void> | undefined;

    await lifecycle.runOperation("request", async () => {
      detachedResult = Promise.resolve().then(async () => {
        detachedStarted.resolve();
        await continueDetachedWork.promise;
        await lifecycle.runOperation("detached database work", async () => undefined);
      });
    });

    await detachedStarted.promise;
    lifecycle.beginShutdown();
    continueDetachedWork.resolve();
    await assert.rejects(detachedResult, DatabaseShutdownError);
    await lifecycle.waitForIdle();
  });

  it("tracks checked-out clients until release and blocks new checkouts", async () => {
    const lifecycle = new DatabaseLifecycle();
    let releaseCount = 0;
    const client = {
      release: () => { releaseCount += 1; },
    } as unknown as PoolClient;
    const pool = {
      connect: async () => client,
      query: async () => ({ rows: [] }),
    } as unknown as Pool;
    const managedPool = manageDatabasePool(pool, "test", lifecycle);
    const checkedOutClient = await managedPool.connect();

    lifecycle.beginShutdown();
    assert.throws(() => managedPool.connect(), DatabaseShutdownError);
    assert.equal(lifecycle.getActiveOperations().length, 1);

    let drained = false;
    const drain = lifecycle.waitForIdle().then(() => { drained = true; });
    await Promise.resolve();
    assert.equal(drained, false);

    checkedOutClient.release();
    await drain;
    assert.equal(releaseCount, 1);
  });

  it("tracks active pool queries and rejects new queries after shutdown begins", async () => {
    const lifecycle = new DatabaseLifecycle();
    const finishQuery = deferred<{ rows: unknown[] }>();
    let queryCount = 0;
    const pool = {
      query: () => {
        queryCount += 1;
        return finishQuery.promise;
      },
    } as unknown as Pool;
    const managedPool = manageDatabasePool(pool, "test", lifecycle);
    const query = managedPool.query("SELECT 1");

    lifecycle.beginShutdown();
    assert.throws(() => managedPool.query("SELECT 2"), DatabaseShutdownError);
    assert.equal(queryCount, 1);

    let drained = false;
    const drain = lifecycle.waitForIdle().then(() => { drained = true; });
    await Promise.resolve();
    assert.equal(drained, false);

    finishQuery.resolve({ rows: [] });
    await query;
    await drain;
    assert.deepEqual(lifecycle.getActiveOperations(), []);
  });

  it("prevents the application pool from being recreated after shutdown starts", async () => {
    const pool = getDbPool();
    assert.equal(databaseLifecycle.beginShutdown(), true);
    assert.throws(() => getDbPool(), DatabaseShutdownError);
    assert.throws(() => pool.query("SELECT 1"), DatabaseShutdownError);

    await Promise.all([closeDbPool(), closeDbPool()]);
    assert.deepEqual(databaseLifecycle.getActiveOperations(), []);
  });
});
