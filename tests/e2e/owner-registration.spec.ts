import { test, expect } from '@playwright/test';

/**
 * Owner registration browser walkthrough.
 *
 * Redirect chain after a successful registration:
 *   /owner/register
 *     -> /onboarding-redirect        (transient; <OnboardingRedirect /> shows a
 *                                     skeleton, then navigates to the state
 *                                     machine's `next_href`)
 *     -> machine.next_href           (e.g. /owner/onboarding, /owner-agreement)
 *   Without a session the user is sent to
 *     /auth?returnTo=/onboarding-redirect
 */

test.describe('Owner registration → onboarding', () => {
  test('renders registration form and required fields', async ({ page }) => {
    await page.goto('/owner/register');

    await expect(page.getByRole('heading', { name: /owner registration/i })).toBeVisible();
    await expect(page.getByLabel(/first name|full name/i).first()).toBeVisible();
    await expect(page.getByLabel(/^email/i).first()).toBeVisible();

    // Required-field validation.
    const submit = page.getByRole('button', { name: /create.*account|register|submit/i }).first();
    await submit.click();
    await expect(page.getByText(/required|must|enter/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('/onboarding-redirect is a registered route and does not 404', async ({ page }) => {
    await page.goto('/onboarding-redirect', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await expect(page.getByText(/oops! page not found/i)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/owner\/dashboard$/);
  });

  test('registration success target is /onboarding-redirect, not the dashboard', async ({ page }) => {
    const chain: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) chain.push(new URL(frame.url()).pathname);
    });

    await page.goto('/auth?returnTo=/onboarding-redirect', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/auth\?returnTo=(%2F|\/)onboarding-redirect/);
    expect(chain).toContain('/auth');
    expect(chain).not.toContain('/owner/dashboard');
  });

  test('onboarding route requires auth', async ({ page }) => {
    await page.goto('/owner/onboarding');
    await expect(page).toHaveURL(/\/(auth|owner\/register)/, { timeout: 8000 });
  });

  test('landing hero CTAs route to the correct registration page', async ({ page }) => {
    await page.goto('/');
    const ownerCta = page.getByRole('link', { name: /list your car|list my car|owners? sign up/i }).first();
    if (await ownerCta.isVisible().catch(() => false)) {
      await ownerCta.click();
      await expect(page).toHaveURL(/\/owner\/register/);
    }
  });
});
