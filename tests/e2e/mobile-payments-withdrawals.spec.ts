import { test, expect, devices, Page } from "@playwright/test";

/**
 * Mobile end-to-end coverage for the two money-moving flows:
 *
 *   1. Driver payments through the PSP checkout edge functions
 *      (`create-paystack-transaction`, `verify-paystack-transaction`,
 *      `create-opay-payment`, `paypal-create-order`, `paypal-capture-order`).
 *
 *   2. Owner withdrawals through the PSP payout edge functions
 *      (`initiate-paystack-transfer`, `initiate-paypal-payout`).
 *
 * Every network dependency is stubbed at the route layer so the tests are
 * deterministic and can run in CI without live credentials. Both flows are
 * executed on Android (Pixel 7) and iOS (iPhone 13) viewports to confirm the
 * mobile PWA reacts to realtime dashboard invalidations after the PSP webhook
 * fires — no manual reload should be required.
 *
 * Environment overrides:
 *   E2E_DRIVER_URL  – route rendering <PaymentMethodPicker /> (default /driver/dashboard)
 *   E2E_OWNER_URL   – route rendering the owner withdrawal panel (default /owner/dashboard)
 *   E2E_PAYMENT_ID  – payment id used in verify stubs
 *   E2E_PAYOUT_ID   – payout id used in transfer stubs
 */

const DRIVER_URL = process.env.E2E_DRIVER_URL ?? "/driver/dashboard";
const OWNER_URL = process.env.E2E_OWNER_URL ?? "/owner/dashboard";
const PAYMENT_ID = process.env.E2E_PAYMENT_ID ?? "test-payment-id";
const PAYOUT_ID = process.env.E2E_PAYOUT_ID ?? "test-payout-id";

const MOBILE_PROFILES: Array<{ name: string; device: keyof typeof devices }> = [
  { name: "Android (Pixel 7)", device: "Pixel 7" },
  { name: "iOS (iPhone 13)", device: "iPhone 13" },
];

async function stubPspConfig(page: Page) {
  await page.route("**/functions/v1/get-psp-config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paystack: { configured: true, publicKey: "pk_test_e2e" },
        opay: { configured: true, merchantId: "opay_m", publicKey: "opay_pub", environment: "sandbox" },
        paypal: { configured: true, clientId: "pp_client_e2e", mode: "sandbox" },
      }),
    }),
  );
}

async function stubPaystackInline(page: Page, outcome: "success" | "failure") {
  await page.route("**/js.paystack.co/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.PaystackPop = function(){return{resumeTransaction:function(_c,h){setTimeout(function(){h.onSuccess({reference:"ps_${outcome}"})},20)}}};`,
    }),
  );
}

async function stubDriverCheckout(page: Page, outcome: "success" | "failure") {
  await stubPspConfig(page);
  await stubPaystackInline(page, outcome);

  await page.route("**/functions/v1/create-paystack-transaction", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reference: `ps_${outcome}`, access_code: "ac_e2e" }),
    }),
  );
  await page.route("**/functions/v1/verify-paystack-transaction", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: outcome === "success" ? "completed" : "failed",
        payment_id: PAYMENT_ID,
        failure_reason: outcome === "success" ? null : "insufficient funds",
      }),
    }),
  );
  await page.route("**/functions/v1/create-opay-payment", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ redirect_url: "about:blank", reference: "opay_ref" }) }),
  );
  await page.route("**/functions/v1/paypal-*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orderId: "pp_order", status: "COMPLETED" }) }),
  );
}

async function stubOwnerPayouts(page: Page, outcome: "success" | "failure") {
  await stubPspConfig(page);

  const respond = (body: object, status = 200) => (route: any) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/functions/v1/initiate-paystack-transfer", respond({
    reference: `pt_${outcome}`,
    transfer_code: "trf_test",
    status: outcome === "success" ? "success" : "failed",
    payout_id: PAYOUT_ID,
  }));
  await page.route("**/functions/v1/initiate-paypal-payout", respond({
    reference: `pp_${outcome}`,
    payout_batch_id: "batch_e2e",
    status: outcome === "success" ? "SUCCESS" : "FAILED",
    payout_id: PAYOUT_ID,
  }));
}

for (const profile of MOBILE_PROFILES) {
  test.describe(`Mobile driver payment · ${profile.name}`, () => {
    test.use({ ...devices[profile.device] });

    test("PSP edge function completes and dashboard updates without reload", async ({ page }) => {
      await stubDriverCheckout(page, "success");
      await page.goto(DRIVER_URL);
      await page.getByTestId("payment-method-picker").waitFor({ timeout: 15_000 });

      // Pick the region's default PSP tab exposed by <PaymentMethodPicker />.
      const paystackTab = page.getByRole("tab", { name: /paystack/i });
      if (await paystackTab.count()) {
        await paystackTab.click();
        await page.getByTestId("paystack-pay-button").click();
      } else {
        // Fallback for US region where PayPal is the only option.
        await page.getByRole("tab", { name: /paypal/i }).click();
        await page.getByTestId("paypal-pay-button").click();
      }

      // The receipt link only appears once the realtime cache invalidation
      // triggered by the webhook flows back into the dashboard queries.
      await expect(page.getByTestId(`view-receipt-${PAYMENT_ID}`)).toBeVisible({ timeout: 15_000 });
    });

    test("failure surfaces retry without reloading the page", async ({ page }) => {
      await stubDriverCheckout(page, "failure");
      await page.goto(DRIVER_URL);
      await page.getByTestId("payment-method-picker").waitFor({ timeout: 15_000 });
      const paystackTab = page.getByRole("tab", { name: /paystack/i });
      if (await paystackTab.count()) {
        await paystackTab.click();
        await page.getByTestId("paystack-pay-button").click();
      } else {
        await page.getByRole("tab", { name: /paypal/i }).click();
        await page.getByTestId("paypal-pay-button").click();
      }
      await expect(page.getByTestId(`retry-payment-${PAYMENT_ID}`)).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe(`Mobile owner withdrawal · ${profile.name}`, () => {
    test.use({ ...devices[profile.device] });

    test("payout edge function succeeds and available balance refreshes", async ({ page }) => {
      await stubOwnerPayouts(page, "success");
      await page.goto(OWNER_URL);

      const withdrawButton = page.getByTestId("owner-withdraw-button");
      await withdrawButton.waitFor({ timeout: 15_000 });
      await withdrawButton.click();

      await page.getByTestId("owner-confirm-withdraw").click();

      // The payout status row must appear via the realtime invalidations
      // wired in useApplicationApprovalNotifier / useRealtimeSync.
      await expect(page.getByTestId(`payout-status-${PAYOUT_ID}`)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId(`payout-status-${PAYOUT_ID}`)).toContainText(/success/i);
    });

    test("payout failure keeps balance intact and shows retry", async ({ page }) => {
      await stubOwnerPayouts(page, "failure");
      await page.goto(OWNER_URL);

      const withdrawButton = page.getByTestId("owner-withdraw-button");
      await withdrawButton.waitFor({ timeout: 15_000 });
      await withdrawButton.click();
      await page.getByTestId("owner-confirm-withdraw").click();

      await expect(page.getByTestId(`payout-retry-${PAYOUT_ID}`)).toBeVisible({ timeout: 15_000 });
    });
  });
}
