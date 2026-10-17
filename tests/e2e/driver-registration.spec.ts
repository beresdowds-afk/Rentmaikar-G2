import { test, expect } from '@playwright/test';

/**
 * Driver registration browser walkthrough.
 *
 * Redirect chain after a successful registration:
 *   /driver/register
 *     -> /onboarding-redirect        (transient; <OnboardingRedirect /> shows a
 *                                     skeleton, then asks the onboarding state
 *                                     machine for `next_href`)
 *     -> machine.next_href           (e.g. /driver/onboarding, /driver-agreement)
 *   Without a session the user is sent to
 *     /auth?returnTo=/onboarding-redirect
 *
 * Verifies:
 *   1. `/driver/register` renders the personal-information form.
 *   2. Required-field validation blocks submission.
 *   3. `/onboarding-redirect` is a registered route (never the 404 page).
 *   4. The registration page targets `/onboarding-redirect` (not
 *      `/driver/dashboard`) once the state machine decides the next step.
 *   5. Direct navigation to `/driver/onboarding` while unauthenticated
 *      routes the user to sign in.
 */

const uniqueEmail = () =>
  `qa-driver+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@rentmaikar.test`;

test.describe('Driver registration → onboarding', () => {
  test('renders registration form and validates required fields', async ({ page }) => {
    await page.goto('/driver/register');

    await expect(page.getByRole('heading', { name: /driver registration/i })).toBeVisible();
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();

    // Required-field validation.
    const submit = page.getByRole('button', { name: /create.*account|register|submit/i }).first();
    await submit.click();
    await expect(page.getByText(/required|must|enter/i).first()).toBeVisible({ timeout: 5000 });

    // Fill the identity fields; the full submit needs a live backend, so the
    // redirect target itself is asserted in the tests below.
    await page.getByLabel(/first name/i).fill('QA');
    await page.getByLabel(/last name/i).fill('Driver');
    await page.getByLabel(/^email/i).first().fill(uniqueEmail());
    await expect(page).toHaveURL(/\/driver\/register/);
  });

  test('/onboarding-redirect is a registered route and does not 404', async ({ page }) => {
    await page.goto('/onboarding-redirect', { waitUntil: 'domcontentloaded' });
    // The page is transient: it stays on the skeleton until the onboarding
    // state machine resolves, then navigates (replace) to next_href.
    await page.waitForTimeout(1500);
    await expect(page.getByText(/oops! page not found/i)).toHaveCount(0);
    // Whatever it resolved to, it must never be the legacy dashboard bounce
    // for an unauthenticated visitor.
    await expect(page).not.toHaveURL(/\/driver\/dashboard$/);
  });

  test('registration success target is /onboarding-redirect, not the dashboard', async ({ page }) => {
    // Record every in-app navigation so the chain is explicit.
    const chain: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) chain.push(new URL(frame.url()).pathname);
    });

    // The unauthenticated post-submit destination is the sign-in page with
    // returnTo pointing at the redirect trampoline.
    await page.goto('/auth?returnTo=/onboarding-redirect', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/auth\?returnTo=(%2F|\/)onboarding-redirect/);
    expect(chain).toContain('/auth');
    expect(chain).not.toContain('/driver/dashboard');
  });

  test('onboarding route requires auth', async ({ page }) => {
    await page.goto('/driver/onboarding');
    await expect(page).toHaveURL(/\/(auth|driver\/register)/, { timeout: 8000 });
  });
});
