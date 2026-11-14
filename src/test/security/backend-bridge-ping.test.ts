import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backendBridge } from "../../lib/backend-bridge";

describe("BackendBridge.ping resilience & watchdog safety", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("falls back to primary or same-origin /api/bridge/ping when staging ping fetch fails", async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calledUrls.push(url);
      if (url.includes("staging.rentmaikar.com")) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(
        JSON.stringify({ status: "ok", pong: true, serverTimestamp: new Date().toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const latency = await backendBridge.ping();
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(calledUrls.some((u) => u.includes("staging.rentmaikar.com/api/bridge/ping"))).toBe(true);
    expect(calledUrls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not emit unhandled rejections from the heartbeat watchdog when all ping targets fail", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      globalThis.fetch = vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch;

      // Simulate stale heartbeat > 45s ago so watchdog triggers
      (backendBridge as any).lastHeartbeat = new Date(Date.now() - 60_000).toISOString();
      (backendBridge as any).connectionState = "DIRECT";
      (backendBridge as any).startHeartbeatWatchdog();

      await vi.advanceTimersByTimeAsync(21_000);
      await Promise.resolve();

      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
