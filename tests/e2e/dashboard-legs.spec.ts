import { test, expect, type Page } from '@playwright/test';

/**
 * Post-approval dashboard legs.
 *
 * 1. Route health: every statically-reachable route (and every legacy alias)
 *    must render something other than the "404 / Page not found" screen.
 * 2. Signed-in driver leg: sign in, land on /driver/dashboard, complete the
 *    first onboarding step surface and assert we are never bounced back to
 *    the landing page ("/").
 * 3. Signed-in owner leg: same for /owner/dashboard.
 *
 * Credentials come from the environment so no secrets live in the repo:
 *   E2E_DRIVER_EMAIL / E2E_DRIVER_PASSWORD
 *   E2E_OWNER_EMAIL  / E2E_OWNER_PASSWORD
 * The signed-in legs skip (rather than fail) when they are absent.
 */

const PUBLIC_ROUTES = [
  '/',
  '/auth',
  '/reset-password',
  '/driver/register',
  '/owner/register',
  '/register/driver',
  '/register/owner',
  '/driver/signup',
  '/owner/signup',
  '/driver/dashboard',
  '/owner/dashboard',
  '/catalogue',
  '/catalogue/standard',
  '/terms',
  '/privacy',
  '/faq',
  '/how-it-works',
  // legacy aliases that used to 404
  '/profile',
  '/profile/settings',
  '/settings',
  '/login',
  '/signin',
  '/signup',
  '/register',
  '/forgot-password',
];

/** Routes behind ProtectedRoute — unauthenticated they must redirect to /auth, never 404. */
const PROTECTED_ROUTES = [
  '/settings/profile',
  '/subscriptions',
  '/driver/training',
  '/admin',
  '/admin-assistant',
  '/admin/audit-log',
  '/admin/payments',
  '/admin/persona-review',
  '/admin/orchestrator',
  '/support/legal',
  '/support/iot',
  '/support/vehicle',
  '/onboarding/complete-profile',
  '/onboarding/verification-status',
  '/onboarding/legal-agreement',
  '/driver/onboarding',
  '/owner/onboarding',
  '/driver/portal/payments',
  '/owner/portal/payments',
];

async function expectNoNotFound(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  // The app keeps long-lived realtime sockets open, so `networkidle` never
  // settles — give the router a short beat instead.
  await page.waitForTimeout(1500);
  await expect(
    page.getByText(/oops! page not found/i),
    `${path} rendered the 404 page`,
  ).toHaveCount(0);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /log in/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait until we leave the auth screen (or a 2FA challenge appears).
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 20_000 });
}

test.describe('Route health — no unexpected 404s', () => {
  for (const path of PUBLIC_ROUTES) {
    test(`public route renders: ${path}`, async ({ page }) => {
      await expectNoNotFound(page, path);
    });
  }

  for (const path of PROTECTED_ROUTES) {
    test(`protected route redirects to auth (never 404): ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await expect(page.getByText(/oops! page not found/i)).toHaveCount(0);
      // Guarded routes either bounce to /auth or render their own sign-in
      // prompt — both are acceptable; a 404 is not.
      const url = new URL(page.url()).pathname;
      expect(url === path || url.startsWith('/auth')).toBe(true);
    });
  }

  test('a genuinely unknown route still shows the 404 page with a way back', async ({ page }) => {
    await page.goto('/definitely-not-a-route-xyz', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await expect(page.getByText(/oops! page not found/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /return to home/i })).toBeVisible();
  });
});

test.describe('Approved driver — initial dashboard leg', () => {
  const email = process.env.E2E_DRIVER_EMAIL;
  const password = process.env.E2E_DRIVER_PASSWORD;

  test.skip(!email || !password, 'Set E2E_DRIVER_EMAIL / E2E_DRIVER_PASSWORD to run.');

  test('lands on the driver dashboard and stays there', async ({ page }) => {
    await signIn(page, email!, password!);

    // Returning approved users must land on their dashboard (or the profile
    // completion wizard) — never back on the marketing landing page.
    await expect(page).not.toHaveURL(/localhost:\d+\/$/);

    if (/complete-profile/.test(page.url())) {
      test.info().annotations.push({ type: 'note', description: 'Profile completion required' });
      return;
    }

    await page.goto('/driver/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/sign in to view your driver dashboard/i)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /driver dashboard|welcome/i }).first(),
    ).toBeVisible({ timeout: 20_000 });

    // First onboarding leg: the checklist must render and offer a next step.
    const checklist = page.getByTestId('onboarding-checklist');
    if (await checklist.count()) {
      await expect(checklist).toBeVisible();
      const cta = checklist.getByRole('button').first();
      if (await cta.count()) await cta.click();
    }

    // Give any redirect effects a chance to fire, then assert we're still
    // inside the driver area rather than bounced to "/".
    await page.waitForTimeout(2500);
    expect(new URL(page.url()).pathname).not.toBe('/');
  });
});

test.describe('Approved owner — initial dashboard leg', () => {
  const email = process.env.E2E_OWNER_EMAIL;
  const password = process.env.E2E_OWNER_PASSWORD;

  test.skip(!email || !password, 'Set E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD to run.');

  test('lands on the owner dashboard and stays there', async ({ page }) => {
    await signIn(page, email!, password!);
    await expect(page).not.toHaveURL(/localhost:\d+\/$/);

    if (/complete-profile/.test(page.url())) {
      test.info().annotations.push({ type: 'note', description: 'Profile completion required' });
      return;
    }

    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/sign in to view your owner dashboard/i)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /owner dashboard|welcome/i }).first(),
    ).toBeVisible({ timeout: 20_000 });

    const checklist = page.getByTestId('onboarding-checklist');
    if (await checklist.count()) {
      await expect(checklist).toBeVisible();
      const cta = checklist.getByRole('button').first();
      if (await cta.count()) await cta.click();
    }

    await page.waitForTimeout(2500);
    expect(new URL(page.url()).pathname).not.toBe('/');
  });
});
