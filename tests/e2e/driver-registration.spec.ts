import { test, expect } from '@playwright/test';

/**
 * Driver registration browser walkthrough.
 *
 * Verifies the registration form renders and rejects an incomplete submission:
 *   1. `/driver/register` renders the personal-information form.
 *   2. Required-field validation blocks submission.
 *   3. Direct navigation to `/driver/onboarding` while unauthenticated
 *      routes the user to sign in — proving the onboarding stage router
 *      is wired.
 */

test.describe('Driver registration → onboarding', () => {
  test('renders registration form and blocks incomplete submission', async ({ page }) => {
    await page.goto('/driver/register');

    await expect(page.getByRole('heading', { name: /driver registration/i })).toBeVisible();
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();

    // Required-field validation.
    const submit = page.getByRole('button', { name: /create.*account|register|submit/i }).first();
    await submit.click();
    await expect(page.getByText(/required|must|enter/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('onboarding route requires auth', async ({ page }) => {
    await page.goto('/driver/onboarding');
    await expect(page).toHaveURL(/\/(auth|driver\/register)/, { timeout: 8000 });
  });
});
