# PSP Checkout E2E Tests

Playwright tests that simulate Paystack and Opay checkout success/failure flows
and assert that `RentalPaymentStatusPanel` updates live.

## How they work

The tests stub the Supabase edge functions used by the checkout components:

- `get-psp-config` – returns a fake public key so the "Pay with ..." button renders
- `create-paystack-transaction` / `verify-paystack-transaction`
- `create-opay-order` / `verify-opay-order`
- The Paystack inline script (`https://js.paystack.co/v2/inline.js`) is intercepted
  and replaced with a shim exposing `window.PaystackPop`, so we can drive
  `onSuccess` / `onCancel` synchronously without opening the real popup.

The tests then mount a minimal harness (a small page you host in the app or a
signed-in dashboard route) and assert:

- Success case → status panel row transitions to "Completed" and a **Receipt** link appears.
- Failure case → row shows "Failed" and the **Retry** button becomes visible.

## Running

```bash
# 1. Make sure the dev server is running
bun run dev  # http://localhost:8080

# 2. Install Playwright + browser (first time only)
bunx playwright install chromium

# 3. Run the tests
bunx playwright test
```

Set `E2E_BASE_URL=https://staging.rentmaikar.com` to run against a deployed env.

## Requirements

These tests need an authenticated driver session for the target rental. Either:

1. Sign in manually once, save `storageState.json` with
   `bunx playwright codegen --save-storage=tests/e2e/.auth/driver.json`, then set
   `use: { storageState: 'tests/e2e/.auth/driver.json' }` in `playwright.config.ts`, **or**
2. Point the tests at a public stub page you serve for E2E only.

The status-panel assertion relies on the `data-testid` attributes added in
`RentalPaymentStatusPanel` (`retry-payment-*`, `view-receipt-*`,
`payment-failure-*`) and the `paystack-pay-button` / `opay-pay-button` testids
on the checkout components.
