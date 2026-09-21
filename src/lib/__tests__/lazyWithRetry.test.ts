import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeWithRetry, lazyWithRetry } from "../lazyWithRetry";

describe("lazyWithRetry & executeWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("successfully loads module on the first attempt", async () => {
    const mockComponent = () => null;
    const factory = vi.fn().mockResolvedValue({ default: mockComponent });

    const result = await executeWithRetry(factory, {
      retries: 2,
      initialDelayMs: 10,
      chunkName: "TestComponent",
    });

    expect(result).toEqual({ default: mockComponent });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("retries on transient network/fetch failure and resolves on subsequent attempt", async () => {
    const mockComponent = () => null;
    let attempts = 0;
    const factory = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(new TypeError("Failed to fetch dynamically imported module"));
      }
      return Promise.resolve({ default: mockComponent });
    });

    const result = await executeWithRetry(factory, {
      retries: 3,
      initialDelayMs: 10,
      backoffFactor: 1.1,
      chunkName: "TestRetryComponent",
    });

    expect(result).toEqual({ default: mockComponent });
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it("throws error after retries are exhausted", async () => {
    const factory = vi.fn().mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));

    await expect(
      executeWithRetry(factory, {
        retries: 2,
        initialDelayMs: 10,
        backoffFactor: 1.1,
        chunkName: "FailingComponent",
      })
    ).rejects.toThrow("Failed to fetch dynamically imported module");

    // Initial attempt + 2 retries = 3 calls
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it("creates a lazy exotic component with lazyWithRetry", () => {
    const mockComponent = () => null;
    const factory = () => Promise.resolve({ default: mockComponent });
    const LazyComp = lazyWithRetry(factory, { chunkName: "AdminDashboard" });
    expect(LazyComp).toBeDefined();
    expect(typeof LazyComp).toBe("object");
  });
});
