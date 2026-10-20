import { test, expect } from '@playwright/test';

/**
 * End-to-end coverage for the signup → email verification → sign-in →
 * role-specific onboarding → dashboard flow.
 *
 * This test drives the real UI. Because the project enforces email
 * verification (auto_confirm is disabled), it cannot complete a green-path
 * sign-in without a mailbox. It therefore verifies each hand-off boundary:
 *   1. Sign up succeeds and the user is asked to verify their email.
 *   2. Signing in without verifying blocks the user on the verification
 *      screen with a rate-limited "Resend verification email" action.
 *   3. Approved driver/owner users hitting their dashboard while
 *      `profiles.onboarding_completed_at` is null are redirected to the
 *      role-specific onboarding page.
 *
 * Steps that require a mailbox are documented and skipped locally.
 */

const uniqueEmail = () =>
  `qa+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@rentmaikar.test`;

test.describe('Signup → verification → onboarding → dashboard', () => {
  test('driver signup surfaces verification gate and cooldown', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/auth');
    await page.getByRole('tab', { name: /sign up/i }).click();
    await page.getByLabel(/full name/i).fill('QA Driver');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^password$/i).fill('SuperSecret123!');
    await page.getByLabel(/confirm password/i).fill('SuperSecret123!');
    await page.getByLabel(/agree/i).check({ force: true });
    await page.getByRole('button', { name: /create account/i }).click();

    // After sign-up the tab flips back to login and the user is prompted
    // to sign in. Attempt sign-in — should be rejected until email verified.
    await page.getByRole('tab', { name: /log in/i }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/password/i).fill('SuperSecret123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/verify your email/i)).toBeVisible({ timeout: 8000 });

    // Cooldown: first click sends and disables the button with a countdown.
    const resend = page.getByRole('button', { name: /resend verification email/i });
    await resend.click();
    await expect(
      page.getByRole('button', { name: /resend available in \d+s/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('unauthenticated dashboard access shows sign-in prompt', async ({ page }) => {
    await page.goto('/driver/dashboard');
    await expect(page.getByText(/sign in to view your driver dashboard/i)).toBeVisible();

    await page.goto('/owner/dashboard');
    await expect(page.getByText(/sign in to view your owner dashboard/i)).toBeVisible();
  });

  test.skip('approved driver is redirected to onboarding before dashboard', async () => {
    // Requires seeded auth user + approved application + null
    // profiles.onboarding_completed_at. Left as a scaffold for the CI job
    // that has service-role access to pre-provision fixtures.
  });
});
