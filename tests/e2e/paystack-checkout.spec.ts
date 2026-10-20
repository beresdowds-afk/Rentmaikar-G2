import { test, expect, Page } from "@playwright/test";

/**
 * These tests exercise the Paystack checkout UI end-to-end with the edge
 * functions mocked. They assume:
 *   - You are on a page that renders <PaymentMethodPicker /> for a rental.
 *   - RENTAL_URL below points to that page (authenticated session assumed).
 *
 * Set RENTAL_URL and PAYMENT_ID via env vars to point at a real driver
 * dashboard route in your environment.
 */
const RENTAL_URL = process.env.E2E_RENTAL_URL ?? "/driver/dashboard";
const PAYMENT_ID = process.env.E2E_PAYMENT_ID ?? "test-payment-id";

async function stubPaystack(page: Page, opts: { outcome: "success" | "failure" | "cancel" }) {
  // 1. Fake the Paystack inline JS. Component appends a <script> tag with
  //    src="https://js.paystack.co/v2/inline.js" then reads window.PaystackPop.
  await page.route("**/js.paystack.co/**", async (route) => {
    const shim = `
      window.PaystackPop = function () {
        return {
          resumeTransaction: function (_code, handlers) {
            setTimeout(function () {
              if (${JSON.stringify(opts.outcome)} === "success") {
                handlers.onSuccess({ reference: "ps_ref_success" });
              } else if (${JSON.stringify(opts.outcome)} === "cancel") {
                handlers.onCancel && handlers.onCancel();
              } else {
                handlers.onSuccess({ reference: "ps_ref_failed" });
              }
            }, 50);
          },
        };
      };
    `;
    await route.fulfill({ status: 200, contentType: "application/javascript", body: shim });
  });

  // 2. Stub the Supabase edge functions.
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
  await page.route("**/functions/v1/create-paystack-transaction", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reference: "ps_ref_" + opts.outcome, access_code: "ac_test" }),
    }),
  );
  await page.route("**/functions/v1/verify-paystack-transaction", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: opts.outcome === "success" ? "completed" : "failed",
        payment_id: PAYMENT_ID,
        failure_reason: opts.outcome === "success" ? null : "insufficient funds",
      }),
    }),
  );
}

test.describe("Paystack checkout", () => {
  test("successful payment shows Completed row and Receipt link", async ({ page }) => {
    await stubPaystack(page, { outcome: "success" });
    await page.goto(RENTAL_URL);
    await page.getByTestId("payment-method-picker").waitFor();
    await page.getByRole("tab", { name: /paystack/i }).click();
    await page.getByTestId("paystack-pay-button").click();

    // Status panel should refetch and show a Receipt link for the completed payment.
    await expect(page.getByTestId(`view-receipt-${PAYMENT_ID}`)).toBeVisible({ timeout: 10_000 });
  });

  test("failed payment shows Failed row and Retry button", async ({ page }) => {
    await stubPaystack(page, { outcome: "failure" });
    await page.goto(RENTAL_URL);
    await page.getByTestId("payment-method-picker").waitFor();
    await page.getByRole("tab", { name: /paystack/i }).click();
    await page.getByTestId("paystack-pay-button").click();

    await expect(page.getByTestId(`payment-failure-${PAYMENT_ID}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`retry-payment-${PAYMENT_ID}`)).toBeVisible();

    // Clicking Retry re-opens the picker with Paystack preselected.
    await page.getByTestId(`retry-payment-${PAYMENT_ID}`).click();
    await expect(page.getByRole("tab", { name: /paystack/i })).toHaveAttribute("data-state", "active");
  });
});
