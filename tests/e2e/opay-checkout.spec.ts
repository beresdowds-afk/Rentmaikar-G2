import { test, expect, Page } from "@playwright/test";

const RENTAL_URL = process.env.E2E_RENTAL_URL ?? "/driver/dashboard";
const PAYMENT_ID = process.env.E2E_PAYMENT_ID ?? "test-payment-id";

async function stubOpay(page: Page, opts: { outcome: "success" | "failure" }) {
  await page.route("**/functions/v1/get-psp-config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paystack: { configured: true, publicKey: "pk_test_e2e" },
        opay: { configured: true },
        paypal: { configured: false },
      }),
    }),
  );
  await page.route("**/functions/v1/create-opay-order", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reference: "op_ref_" + opts.outcome, cashier_url: "about:blank" }),
    }),
  );
  await page.route("**/functions/v1/verify-opay-order", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: opts.outcome === "success" ? "completed" : "failed",
        payment_id: PAYMENT_ID,
        failure_reason: opts.outcome === "success" ? null : "cancelled by user",
      }),
    }),
  );
  // Prevent the real cashier popup from opening.
  await page.addInitScript(() => {
    // @ts-expect-error test-only
    window.open = () => ({ closed: false });
  });
}

test.describe("Opay checkout", () => {
  test("successful payment updates status panel and shows Receipt", async ({ page }) => {
    await stubOpay(page, { outcome: "success" });
    await page.goto(RENTAL_URL);
    await page.getByTestId("payment-method-picker").waitFor();
    await page.getByRole("tab", { name: /opay/i }).click();
    await page.getByTestId("opay-pay-button").click();

    await expect(page.getByTestId(`view-receipt-${PAYMENT_ID}`)).toBeVisible({ timeout: 15_000 });
  });

  test("failed payment shows Retry", async ({ page }) => {
    await stubOpay(page, { outcome: "failure" });
    await page.goto(RENTAL_URL);
    await page.getByTestId("payment-method-picker").waitFor();
    await page.getByRole("tab", { name: /opay/i }).click();
    await page.getByTestId("opay-pay-button").click();

    await expect(page.getByTestId(`retry-payment-${PAYMENT_ID}`)).toBeVisible({ timeout: 15_000 });
  });
});
