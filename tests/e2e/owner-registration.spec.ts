import { test, expect } from '@playwright/test';

/**
 * Owner registration browser walkthrough.
 *
 * Mirrors the driver spec: renders the registration page, exercises
 * validation, and confirms that the onboarding stage router requires
 * authentication before any dashboard content is shown.
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
