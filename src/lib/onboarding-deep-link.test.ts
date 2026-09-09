// Regression tests for the onboarding deep-link cold-start resume path.
//
// After an app restart, `installOnboardingDeepLinkListener` must navigate the
// router to the exact path the user was on before termination, using the value
// persisted in localStorage. It must also:
//   - honor the 24h TTL and drop stale entries
//   - clear the stored path after consuming it (single-shot resume)
//   - fall back to a no-op when nothing is stored
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildOnboardingDeepLink,
  consumeStoredDeepLinkPath,
  deepLinkToPath,
  installOnboardingDeepLinkListener,
  rememberOnboardingPath,
} from './onboarding-deep-link';

const KEY = 'rentmaikar:last_deeplink_path';

describe('onboarding-deep-link cold-start resume', () => {
  beforeEach(() => {
    localStorage.clear();
    // Ensure we are treated as the web runtime (not Capacitor).
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  });

  it('rememberOnboardingPath persists a well-formed entry', () => {
    rememberOnboardingPath('/driver/onboarding?step=documents');
    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.path).toBe('/driver/onboarding?step=documents');
    expect(typeof parsed.ts).toBe('number');
  });

  it('ignores non-app paths (must start with "/")', () => {
    rememberOnboardingPath('https://evil.example/steal');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('consumeStoredDeepLinkPath returns and clears fresh entries', () => {
    rememberOnboardingPath('/owner/onboarding?step=verification');
    const path = consumeStoredDeepLinkPath();
    expect(path).toBe('/owner/onboarding?step=verification');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('drops entries older than 24h', () => {
    const stale = { path: '/driver/onboarding?step=documents', ts: Date.now() - 25 * 60 * 60 * 1000 };
    localStorage.setItem(KEY, JSON.stringify(stale));
    expect(consumeStoredDeepLinkPath()).toBeNull();
  });

  it('web restart: installer navigates to the persisted resume path', async () => {
    rememberOnboardingPath('/driver/onboarding?step=verification');
    const navigate = vi.fn();
    const cleanup = await installOnboardingDeepLinkListener(navigate);
    // navigation is queued via queueMicrotask — flush.
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledWith('/driver/onboarding?step=verification');
    // one-shot: subsequent installer call must not re-navigate.
    navigate.mockClear();
    const cleanup2 = await installOnboardingDeepLinkListener(navigate);
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
    cleanup();
    cleanup2();
  });

  it('web restart with no stored path is a silent no-op', async () => {
    const navigate = vi.fn();
    const cleanup = await installOnboardingDeepLinkListener(navigate);
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
    cleanup();
  });

  it('deepLinkToPath converts native scheme -> in-app pathname', () => {
    expect(deepLinkToPath('rentmaikar://onboarding?step=documents&role=driver'))
      .toBe('/onboarding-redirect?step=documents&role=driver');
  });

  it('buildOnboardingDeepLink returns web + native pair per step', () => {
    const { web, native } = buildOnboardingDeepLink('driver', 'documents');
    expect(web).toBe('/driver/onboarding?step=documents');
    expect(native).toBe('rentmaikar://onboarding?step=documents&role=driver');
    expect(buildOnboardingDeepLink('owner', 'root').web).toBe('/owner/onboarding');
    expect(buildOnboardingDeepLink(null, 'email').web).toBe('/verify-email');
  });
});
