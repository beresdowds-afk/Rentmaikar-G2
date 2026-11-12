import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import { afterEach, describe, it } from "node:test";
import { closeDbPool, getDbPool } from "../dbPool";
import { createGracefulShutdownCoordinator } from "../gracefulShutdown";

const servers: http.Server[] = [];

function listen(server: http.Server): Promise<number> {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("Server did not bind a TCP port"));
      else resolve(address.port);
    });
  });
}

function get(port: number): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, agent: false }, resolve);
    request.once("error", reject);
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
});

describe("graceful shutdown coordinator", () => {
  it("drains in-flight HTTP requests and makes repeated signals idempotent", async () => {
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => { markRequestStarted = resolve; });
    const server = http.createServer((_req, res) => {
      markRequestStarted();
      setTimeout(() => res.end("complete"), 30);
    });
    const port = await listen(server);
    const responsePromise = get(port);
    await requestStarted;

    let markedShuttingDown = false;
    let resourcesClosed = 0;
    const signals = new EventEmitter();
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => { markedShuttingDown = true; },
      closeEventStreams: () => undefined,
      stopBackgroundWork: async () => undefined,
      resources: [{ name: "test pool", close: async () => { resourcesClosed += 1; } }],
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    const unrelated = () => undefined;
    signals.on("SIGTERM", unrelated);
    signals.on("SIGINT", unrelated);
    coordinator.installSignalHandlers(signals);
    coordinator.installSignalHandlers(signals);
    assert.equal(signals.listenerCount("SIGTERM"), 2);
    assert.equal(signals.listenerCount("SIGINT"), 2);

    signals.emit("SIGTERM");
    const shutdown = coordinator.shutdown("SIGTERM");
    signals.emit("SIGINT");
    const response = await responsePromise;
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve) => response.once("end", resolve));
    const outcome = await shutdown;

    assert.equal(Buffer.concat(chunks).toString(), "complete");
    assert.equal(markedShuttingDown, true);
    assert.equal(resourcesClosed, 1);
    assert.equal(outcome.httpDrain, "succeeded");
    assert.equal(outcome.backgroundWork, "succeeded");
    assert.deepEqual(outcome.resources, [{ name: "test pool", status: "succeeded" }]);
    assert.equal(outcome.forcedTermination, false);
    assert.deepEqual(signals.listeners("SIGTERM"), [unrelated]);
    assert.deepEqual(signals.listeners("SIGINT"), [unrelated]);
    coordinator.installSignalHandlers(signals);
    assert.deepEqual(signals.listeners("SIGTERM"), [unrelated]);
    assert.deepEqual(signals.listeners("SIGINT"), [unrelated]);
  });

  it("clears drain and deadline timers after a successful shutdown", { timeout: 2000 }, async (t) => {
    const server = http.createServer();
    await listen(server);
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const timers = new Map<number, NodeJS.Timeout>();
    const cleared = new Set<NodeJS.Timeout>();
    t.mock.method(globalThis, "setTimeout", ((callback: () => void, delay: number) => {
      const timer = realSetTimeout(callback, delay);
      timers.set(delay, timer);
      return timer;
    }) as typeof setTimeout);
    t.mock.method(globalThis, "clearTimeout", ((timer: NodeJS.Timeout) => {
      cleared.add(timer);
      return realClearTimeout(timer);
    }) as typeof clearTimeout);
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: async () => undefined,
      resources: [],
      drainTimeoutMs: 6500,
      hardTimeoutMs: 8000,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

    const outcome = await coordinator.shutdown("SIGTERM");
    assert.equal(outcome.httpDrain, "succeeded");
    for (const delay of [6500, 8000]) {
      const timer = timers.get(delay);
      assert.ok(timer, `expected a ${delay}ms timer`);
      assert.ok(cleared.has(timer), `expected the ${delay}ms timer to be cleared`);
    }
  });

  it("clears the escalation timer when cleanup settles during the hard deadline", { timeout: 2000 }, async (t) => {
    const server = http.createServer();
    await listen(server);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const timers = new Map<number, NodeJS.Timeout>();
    const cleared = new Set<NodeJS.Timeout>();
    t.mock.method(globalThis, "setTimeout", ((callback: () => void, delay: number) => {
      const timer = realSetTimeout(callback, delay);
      timers.set(delay, timer);
      return timer;
    }) as typeof setTimeout);
    t.mock.method(globalThis, "clearTimeout", ((timer: NodeJS.Timeout) => {
      cleared.add(timer);
      return realClearTimeout(timer);
    }) as typeof clearTimeout);
    let finishBackground!: () => void;
    const background = new Promise<void>((resolve) => { finishBackground = resolve; });
    t.mock.method(server, "closeAllConnections", () => { finishBackground(); });
    const signals = new EventEmitter();
    let forcedExitCode: number | undefined;
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: () => background,
      resources: [],
      drainTimeoutMs: 1000,
      hardTimeoutMs: 20,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      setExitCode: () => undefined,
      forceExit: (code) => { forcedExitCode = code; },
    });
    coordinator.installSignalHandlers(signals);
    signals.emit("SIGTERM");
    const shutdown = coordinator.shutdown("SIGINT");
    await new Promise<void>((resolve) => setImmediate(resolve));
    t.mock.timers.tick(20);
    const outcome = await shutdown;

    assert.equal(outcome.hardDeadlineReached, true);
    assert.equal(forcedExitCode, 1);
    const escalationTimer = timers.get(250);
    assert.ok(escalationTimer);
    assert.ok(cleared.has(escalationTimer));
    assert.equal(signals.listenerCount("SIGTERM"), 0);
    assert.equal(signals.listenerCount("SIGINT"), 0);
  });

  it("bounds shutdown when the hard deadline expires before HTTP drain", { timeout: 2000 }, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const server = http.createServer();
    server.close = (() => server) as typeof server.close;
    server.closeAllConnections = () => undefined;
    let exitCode: number | undefined;
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: () => new Promise<void>(() => undefined),
      resources: [],
      drainTimeoutMs: 5000,
      hardTimeoutMs: 10,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      setExitCode: () => undefined,
      forceExit: (code) => { exitCode = code; },
    });
    const shutdown = coordinator.shutdown("SIGTERM");
    await new Promise<void>((resolve) => setImmediate(resolve));
    t.mock.timers.tick(10);
    await new Promise<void>((resolve) => setImmediate(resolve));
    t.mock.timers.tick(250);
    const outcome = await shutdown;
    assert.equal(exitCode, 1);
    assert.equal(outcome.httpDrain, "failed");
    assert.equal(outcome.forcedTermination, true);
  });

  it("handles rejected cleanup after a signal without unhandled rejections", { timeout: 2000 }, async () => {
    const server = http.createServer();
    await listen(server);
    const signals = new EventEmitter();
    const errors: unknown[][] = [];
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: async () => { throw new Error("background failed"); },
      resources: [{ name: "pool", close: async () => { throw new Error("pool failed"); } }],
      logger: { info: () => undefined, warn: () => undefined, error: (...args) => { errors.push(args); } },
      setExitCode: () => undefined,
    });
    coordinator.installSignalHandlers(signals);
    signals.emit("SIGTERM");
    signals.emit("SIGINT");
    const outcome = await coordinator.shutdown("SIGTERM");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(outcome.backgroundWork, "failed");
    assert.equal(outcome.resources[0].status, "failed");
    assert.equal(errors.length, 2);
    assert.equal(signals.listenerCount("SIGTERM"), 0);
    assert.equal(signals.listenerCount("SIGINT"), 0);
  });

  it("shares shutdown even when a signal arrives during admission closure", { timeout: 2000 }, async () => {
    const server = http.createServer();
    await listen(server);
    const signals = new EventEmitter();
    let admissionCalls = 0;
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => { admissionCalls += 1; signals.emit("SIGINT"); },
      closeEventStreams: () => undefined,
      stopBackgroundWork: async () => undefined,
      resources: [],
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    coordinator.installSignalHandlers(signals);
    signals.emit("SIGTERM");
    await coordinator.shutdown("SIGTERM");
    assert.equal(admissionCalls, 1);
    assert.equal(signals.listenerCount("SIGTERM"), 0);
    assert.equal(signals.listenerCount("SIGINT"), 0);
  });

  it("handles unexpected signal-triggered shutdown rejection", { timeout: 2000 }, async (t) => {
    const server = http.createServer();
    const signals = new EventEmitter();
    const priorExitCode = process.exitCode;
    const logged: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: async () => undefined,
      resources: [],
      logger: {
        info: (message) => { if (String(message).includes("Received")) throw new Error("logger failure"); },
        warn: () => undefined,
        error: () => undefined,
      },
    });

    try {
      coordinator.installSignalHandlers(signals);
      signals.emit("SIGTERM");
      await assert.rejects(coordinator.shutdown("SIGTERM"), /logger failure/);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(process.exitCode, 1);
      assert.ok(logged.some((args) => String(args[0]).includes("Shutdown failed unexpectedly")));
      assert.equal(signals.listenerCount("SIGTERM"), 0);
      assert.equal(signals.listenerCount("SIGINT"), 0);
    } finally {
      process.exitCode = priorExitCode;
    }
  });

  it("handles an exception from the hard-deadline termination callback", { timeout: 2000 }, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const server = http.createServer();
    const priorExitCode = process.exitCode;
    const errors: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
    let attempts = 0;
    const signals = new EventEmitter();
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: () => new Promise<void>(() => undefined),
      resources: [],
      drainTimeoutMs: 1000,
      hardTimeoutMs: 10,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      setExitCode: () => undefined,
      forceExit: () => { attempts += 1; throw new Error("exit callback failed"); },
    });
    try {
      coordinator.installSignalHandlers(signals);
      const shutdown = coordinator.shutdown("SIGTERM");
      await new Promise<void>((resolve) => setImmediate(resolve));
      t.mock.timers.tick(10);
      await new Promise<void>((resolve) => setImmediate(resolve));
      t.mock.timers.tick(250);
      const outcome = await shutdown;
      assert.equal(outcome.forcedTermination, true);
      assert.equal(attempts, 1);
      assert.equal(process.exitCode, 1);
      assert.ok(errors.some((args) => String(args[0]).includes("Hard-deadline escalation failed")));
      assert.equal(signals.listenerCount("SIGTERM"), 0);
      assert.equal(signals.listenerCount("SIGINT"), 0);
    } finally {
      process.exitCode = priorExitCode;
    }
  });

  it("ends active SSE responses before database resources are closed", async () => {
    let streamResponse: http.ServerResponse | undefined;
    let streamEnded = false;
    let serverStreamFinished = false;
    let resourcesClosed = false;
    const server = http.createServer((_req, res) => {
      streamResponse = res;
      res.once("finish", () => { serverStreamFinished = true; });
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("event: connected\n\n");
    });
    const port = await listen(server);
    const clientResponse = await get(port);
    const initialEvent = new Promise<string>((resolve) => {
      clientResponse.once("data", (chunk: Buffer) => resolve(chunk.toString()));
    });
    const ended = new Promise<void>((resolve) => clientResponse.once("end", resolve));
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => {
        streamResponse?.end();
        streamEnded = true;
      },
      stopBackgroundWork: async () => undefined,
      resources: [{
        name: "test pool",
        close: async () => {
          assert.equal(serverStreamFinished, true);
          resourcesClosed = true;
        },
      }],
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

    assert.match(await initialEvent, /event: connected/);
    await coordinator.shutdown("SIGTERM");
    await ended;
    assert.equal(streamEnded, true);
    assert.equal(resourcesClosed, true);
  });

  it("closes active sockets and reports work interrupted at the drain deadline", async () => {
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => { markRequestStarted = resolve; });
    const server = http.createServer(() => markRequestStarted());
    const port = await listen(server);
    const responsePromise = get(port).catch(() => undefined);
    await requestStarted;
    let backgroundStopped = false;
    let exitCode = 0;
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: async () => { backgroundStopped = true; },
      resources: [],
      drainTimeoutMs: 20,
      hardTimeoutMs: 500,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      setExitCode: (code) => { exitCode = code; },
      forceExit: () => undefined,
    });

    const outcome = await coordinator.shutdown("SIGTERM");
    await responsePromise;
    assert.equal(backgroundStopped, true);
    assert.equal(exitCode, 1);
    assert.equal(outcome.httpDrain, "failed");
  });

  it("forces exit at the hard deadline when a cleanup operation does not settle", async () => {
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => { markRequestStarted = resolve; });
    const server = http.createServer(() => markRequestStarted());
    const port = await listen(server);
    const responsePromise = get(port).catch(() => undefined);
    await requestStarted;
    let forcedExitCode: number | undefined;
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: async () => undefined,
      resources: [{ name: "stuck resource", close: () => new Promise<void>(() => undefined) }],
      drainTimeoutMs: 10,
      hardTimeoutMs: 40,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      setExitCode: () => undefined,
      forceExit: (code) => { forcedExitCode = code; },
    });

    const outcome = await coordinator.shutdown("SIGTERM");
    await responsePromise;
    assert.equal(forcedExitCode, 1);
    assert.equal(outcome.hardDeadlineReached, true);
    assert.equal(outcome.forcedTermination, true);
    assert.deepEqual(outcome.resources, [{ name: "stuck resource", status: "pending" }]);
  });

  it("reports cleanup failures while still attempting every resource", async () => {
    const server = http.createServer();
    await listen(server);
    const backgroundError = new Error("OCR termination failed");
    const resourceError = new Error("pool close failed");
    const errors: unknown[][] = [];
    const info: unknown[][] = [];
    let exitCode = 0;
    let backgroundCalls = 0;
    let otherResourceClosed = false;
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: async () => { backgroundCalls += 1; throw backgroundError; },
      resources: [
        { name: "failed pool", close: async () => { throw resourceError; } },
        { name: "other pool", close: async () => { otherResourceClosed = true; } },
      ],
      logger: {
        info: (...args) => { info.push(args); },
        warn: () => undefined,
        error: (...args) => { errors.push(args); },
      },
      setExitCode: (code) => { exitCode = code; },
    });

    const first = coordinator.shutdown("SIGTERM");
    const second = coordinator.shutdown("SIGINT");
    assert.equal(first, second);
    const outcome = await first;

    assert.equal(backgroundCalls, 1);
    assert.equal(otherResourceClosed, true);
    assert.equal(exitCode, 1);
    assert.equal(outcome.httpDrain, "succeeded");
    assert.equal(outcome.backgroundWork, "failed");
    assert.deepEqual(outcome.resources, [
      { name: "failed pool", status: "failed" },
      { name: "other pool", status: "succeeded" },
    ]);
    assert.ok(errors.some((args) => String(args[0]).includes("Background work") && args[1] === backgroundError));
    assert.ok(errors.some((args) => String(args[0]).includes("failed pool") && args[1] === resourceError));
    assert.ok(!info.some((args) => String(args[0]).includes("Graceful shutdown complete")));
  });

  it("reports admission and event-stream cleanup errors instead of claiming success", async () => {
    const server = http.createServer();
    await listen(server);
    const info: unknown[][] = [];
    let exitCode = 0;
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => { throw new Error("admission failed"); },
      closeEventStreams: () => { throw new Error("stream close failed"); },
      stopBackgroundWork: async () => undefined,
      resources: [],
      logger: { info: (...args) => { info.push(args); }, warn: () => undefined, error: () => undefined },
      setExitCode: (code) => { exitCode = code; },
    });

    const outcome = await coordinator.shutdown("SIGTERM");
    assert.equal(outcome.admission, "failed");
    assert.equal(outcome.eventStreams, "failed");
    assert.equal(exitCode, 1);
    assert.ok(!info.some((args) => String(args[0]).includes("Graceful shutdown complete")));
  });

  it("reports unfinished background work when the hard deadline forces termination", async () => {
    const server = http.createServer();
    await listen(server);
    const errors: unknown[][] = [];
    let resourceClosed = false;
    let forcedExitCode: number | undefined;
    const coordinator = createGracefulShutdownCoordinator({
      server,
      markShuttingDown: () => undefined,
      closeEventStreams: () => undefined,
      stopBackgroundWork: () => new Promise<void>(() => undefined),
      resources: [{ name: "independent pool", close: async () => { resourceClosed = true; } }],
      drainTimeoutMs: 10,
      hardTimeoutMs: 30,
      logger: { info: () => undefined, warn: () => undefined, error: (...args) => { errors.push(args); } },
      setExitCode: () => undefined,
      forceExit: (code) => { forcedExitCode = code; },
    });

    const outcome = await coordinator.shutdown("SIGTERM");
    assert.equal(resourceClosed, true);
    assert.equal(outcome.backgroundWork, "pending");
    assert.equal(outcome.forcedTermination, true);
    assert.equal(forcedExitCode, 1);
    assert.ok(errors.some((args) => String(args[0]).includes("Background cleanup incomplete")));
  });

  it("closes an initialized application database pool without connecting externally", async () => {
    const priorHost = process.env.SUPABASE_DB_HOST;
    const priorPort = process.env.SUPABASE_DB_PORT;
    process.env.SUPABASE_DB_HOST = "127.0.0.1";
    process.env.SUPABASE_DB_PORT = "1";
    try {
      const pool = getDbPool();
      await closeDbPool();
      await assert.rejects(pool.connect(), /Cannot use a pool after calling end/i);
    } finally {
      if (priorHost === undefined) delete process.env.SUPABASE_DB_HOST;
      else process.env.SUPABASE_DB_HOST = priorHost;
      if (priorPort === undefined) delete process.env.SUPABASE_DB_PORT;
      else process.env.SUPABASE_DB_PORT = priorPort;
    }
  });
});
