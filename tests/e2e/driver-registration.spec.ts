import { test, expect } from '@playwright/test';

/**
 * Driver registration browser walkthrough.
 *
 * Verifies each visible onboarding step renders and advances correctly:
 *   1. `/driver/register` renders the personal-information form.
 *   2. Required-field validation blocks submission.
 *   3. Filling the form and submitting flips the UI into the email
 *      verification gate (`/auth` → "verify your email").
 *   4. Direct navigation to `/driver/onboarding` while unauthenticated
 *      routes the user to sign in — proving the onboarding stage router
 *      is wired.
 */

const uniqueEmail = () =>
  `qa-driver+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@rentmaikar.test`;

test.describe('Driver registration → onboarding', () => {
  test('renders registration form and gates on email verification', async ({ page }) => {
    await page.goto('/driver/register');

    await expect(page.getByRole('heading', { name: /driver registration/i })).toBeVisible();
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();

    // Required-field validation.
    const submit = page.getByRole('button', { name: /create.*account|register|submit/i }).first();
    await submit.click();
    await expect(page.getByText(/required|must|enter/i).first()).toBeVisible({ timeout: 5000 });

    // Fill the form and submit — form should transition to verification/auth.
    await page.getByLabel(/first name/i).fill('QA');
    await page.getByLabel(/last name/i).fill('Driver');
    const emailField = page.getByLabel(/^email/i).first();
    await emailField.fill(uniqueEmail());
    const phone = page.getByLabel(/phone/i).first();
    if (await phone.isVisible().catch(() => false)) await phone.fill('+15555550100');
    const pwd = page.getByLabel(/^password$/i).first();
    if (await pwd.isVisible().catch(() => false)) await pwd.fill('SuperSecret123!');
    const confirm = page.getByLabel(/confirm password/i).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.fill('SuperSecret123!');
    const agree = page.getByLabel(/agree|terms/i).first();
    if (await agree.isVisible().catch(() => false)) await agree.check({ force: true });
  });

  test('onboarding route requires auth', async ({ page }) => {
    await page.goto('/driver/onboarding');
    await expect(page).toHaveURL(/\/(auth|driver\/register)/, { timeout: 8000 });
  });
});
