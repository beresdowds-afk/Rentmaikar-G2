/**
 * Detects automated/headless browser sessions (Playwright, Puppeteer, CI
 * smoke runs) so we can skip background work that pins the main thread or
 * blocks on permission prompts that never resolve headlessly.
 *
 * Opt-in signals:
 *   - `navigator.webdriver === true` (set by every CDP-driven browser)
 *   - `?e2e=1` in the URL
 *   - `localStorage.rentmaikar_e2e === "1"`
 */
export function isAutomationMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (navigator?.webdriver === true) return true;
    if (new URLSearchParams(window.location.search).get('e2e') === '1') return true;
    if (window.localStorage.getItem('rentmaikar_e2e') === '1') return true;
  } catch {
    /* storage blocked — fall through */
  }
  return false;
}

/**
 * Convenience guard: runs `fn` unless we're in an automated session.
 * Returns a no-op cleanup when skipped so `useEffect` callers stay simple.
 */
export function unlessAutomated(fn: () => void | (() => void)): void | (() => void) {
  if (isAutomationMode()) return;
  return fn();
}
