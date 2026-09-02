/**
 * Production Resilient Network Client
 * Provides exponential backoff retries, jitter, and timeout handling for external integrations.
 */

export interface FetchWithRetryOptions extends RequestInit {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  retryOnStatus?: number[];
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 300,
    maxDelayMs = 4000,
    timeoutMs = 12000,
    retryOnStatus = [408, 429, 500, 502, 503, 504],
    ...fetchOptions
  } = options;

  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok || attempt === maxRetries || !retryOnStatus.includes(response.status)) {
        return response;
      }
    } catch (err: unknown) {
      clearTimeout(timer);
      if (attempt === maxRetries) {
        throw err;
      }
    }

    attempt++;
    const jitter = Math.random() * 200;
    const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, maxDelayMs);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(`[ResilientFetch] Exhausted all ${maxRetries} retries for: ${url}`);
}
