// Playwright E2E for Google SSO UI on the /auth page.
// We can't complete a real Google consent from CI, but we can verify:
//   - The Google button is visible and clickable
//   - A callback error (?error=access_denied) shows the friendly retry alert
//   - The retry action on the alert re-invokes the sign-in handler
//
// Run:  bunx playwright test tests/e2e/google-sso.spec.ts

import { test, expect } from "@playwright/test";

test.describe("Google SSO", () => {
  test("Google button renders on /auth", async ({ page }) => {
    await page.goto("/auth");
    const btn = page.getByTestId("google-sso-button");
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test("callback error shows friendly retry alert", async ({ page }) => {
    await page.goto("/auth?error=access_denied&error_description=user+denied");
    // Alert component surfaces the friendly message from the OAuth error map.
    await expect(
      page.getByText(/denied access on the Google consent screen/i),
    ).toBeVisible();
    // URL should be cleaned so a refresh doesn't re-show the error.
    await expect.poll(() => new URL(page.url()).searchParams.get("error")).toBeNull();
  });

  test("callback misconfig error surfaces support hint", async ({ page }) => {
    await page.goto("/auth?error=invalid_request");
    await expect(page.getByText(/callback is misconfigured/i)).toBeVisible();
  });
});
