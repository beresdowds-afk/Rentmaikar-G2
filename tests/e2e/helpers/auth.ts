import type { Page } from "@playwright/test";

export type E2eRole = "DRIVER" | "OWNER";

export function hasE2eCredentials(role: E2eRole): boolean {
  return Boolean(
    process.env[`E2E_${role}_EMAIL`] && process.env[`E2E_${role}_PASSWORD`],
  );
}

export async function signInAs(page: Page, role: E2eRole): Promise<void> {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`E2E_${role}_EMAIL and E2E_${role}_PASSWORD are required.`);
  }

  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /log in/i }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 20_000,
  });
}
