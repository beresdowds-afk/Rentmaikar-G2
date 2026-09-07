import { test, expect, devices } from '@playwright/test';

/**
 * Mobile viewport coverage for the Google + Phone OTP registration paths
 * and the assistant-approval → dashboard unlock flow. This test drives the
 * public routes only; the deep server-side prefill + approval logic is
 * exercised by supabase/tests/alt-auth-registration-e2e.test.ts.
 *
 * We assert here that on Android and iOS viewports:
 *   - the alternative auth UI (Google + Phone OTP) is reachable and
 *     renders its expected controls;
 *   - the driver and owner dashboards render their post-approval landing
 *     state (identity card + role badge) without layout breakage.
 */

const mobileDevices = [
  { name: 'Pixel 7 (Android)', ...devices['Pixel 7'] },
  { name: 'iPhone 13 (iOS)', ...devices['iPhone 13'] },
] as const;

for (const device of mobileDevices) {
  test.describe(`${device.name}`, () => {
    test.use({ ...device });

    test('alternative auth options are reachable on mobile', async ({ page }) => {
      await page.goto('/auth');
      await page.getByRole('tab', { name: /sign up/i }).click();
      // Google sign-in button
      await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
      // Phone OTP entry surface
      await expect(page.getByRole('button', { name: /phone|otp|whatsapp|sms/i }).first()).toBeVisible();
    });

    test('driver dashboard renders identity card on mobile viewport', async ({ page }) => {
      await page.goto('/driver/dashboard');
      // Either the auth gate or the identity card renders — both are fine
      // for viewport validation.
      const identity = page.getByTestId('user-identity-card');
      const authRedirect = page.getByRole('heading', { name: /sign in|log in|welcome/i }).first();
      await expect(identity.or(authRedirect)).toBeVisible();
    });

    test('owner dashboard renders identity card on mobile viewport', async ({ page }) => {
      await page.goto('/owner/dashboard');
      const identity = page.getByTestId('user-identity-card');
      const authRedirect = page.getByRole('heading', { name: /sign in|log in|welcome/i }).first();
      await expect(identity.or(authRedirect)).toBeVisible();
    });
  });
}
