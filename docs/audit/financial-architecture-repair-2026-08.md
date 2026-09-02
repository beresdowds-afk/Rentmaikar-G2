# Financial Architecture Audit & Repair — 2026-08

## Summary

Every payment on the platform now flows through **one settlement routine**,
`public.settle_payment_financials(payment_id, provider, provider_reference)`,
fired automatically by the `trg_payments_settle` trigger the moment a
`payments` row reaches `status = 'completed'`.

For a single completed payment it performs, exactly once (idempotent via
`payments.settled_at` plus per-entry idempotency keys):

1. **Tax** — resolves the jurisdiction (`resolve_tax_jurisdiction`) and writes
   `tax_line_items` from the active customer-facing `tax_rules`.
2. **Commission split** — rental payments split at the configured
   `owner_share_pct` (default 2/3 of the gross, i.e. driver pays base + 20%,
   owner receives base − 20%, platform keeps 40% of base). All other payment
   purposes are 100% platform revenue.
3. **Wallet ledger** — driver debit, owner-share credit and a **platform-fee
   credit to the platform treasury wallet** (`wallet_accounts` with
   `user_id = 00000000-0000-0000-0000-000000000000`, `account_type = 'platform'`).
4. **Owner earnings** — an `owner_earnings` row keyed by
   `payout_reference = 'payment:<id>'`.
5. **Subscription activation** — `activate_user_subscription` for any
   `subscription_*` purpose, so services activate even if the user closes the
   checkout tab.
6. **Invoice** — creates a paid invoice when none is linked, otherwise marks
   the existing one paid, with the tax total attached.
7. **Receipt** — issued by the pre-existing `auto_generate_receipt_from_payment`
   trigger.
8. **Audit** — a `payment_settled` entry in `admin_audit_log` capturing the
   full breakdown; failures land as `payment_settlement_failed` instead of
   blocking the payment.

## Defects found and fixed

| # | Defect | Fix |
|---|--------|-----|
| 1 | **Blocker:** `auto_generate_receipt_from_payment` used `ON CONFLICT (idempotency_key)` on `receipts`, but no such unique index existed — *marking any payment completed failed outright*. | Added unique indexes on `receipts.idempotency_key` and `invoices.idempotency_key`. |
| 2 | Platform commission was computed but never posted anywhere; no platform account existed. | Platform treasury wallets (USD/NGN) seeded; `platform_fee` credited on every payment. |
| 3 | `owner_earnings` was a dead table — nothing ever inserted into it. | Populated by the settlement routine, guarded by a unique `payout_reference`. |
| 4 | Opay webhook skipped ledger postings entirely (Paystack/PayPal did them). | Opay webhook now calls the shared `settlePaymentFinancials` helper. |
| 5 | Subscriptions (training / insurance / roadside) bypassed `payments`, `invoices`, `receipts` and the ledger; activation happened only client-side after redirect. | `subscribe-to-plan` now creates a pending `payments` row (`purpose`, `subscription_plan_id`) plus the matching `paystack_transactions` / `paypal_transactions` row, so the webhook settles and activates server-side. |
| 6 | `tax_rules` existed but were never read. | Tax line items generated per payment; totals stored on `payments.tax_amount` and the invoice. |
| 7 | IoT device online orders never redirected to the gateway, were never verified, and produced no payment/invoice/receipt/ledger record. | The purchase now records a `payments` row with `purpose = 'iot_device'` and actually redirects to the gateway; the webhook settles it. |
| 8 | No single audit trail for money movement. | `payment_settled` / `payment_settlement_failed` entries in `admin_audit_log`. |

## Schema changes

- `payments`: `owner_id` / `vehicle_id` now nullable; new `purpose`,
  `subscription_plan_id`, `owner_share_amount`, `platform_fee_amount`,
  `tax_amount`, `settled_at`.
- `paypal_transactions`: `owner_id` / `vehicle_id` now nullable (subscriptions).
- New unique indexes: `receipts.idempotency_key`, `invoices.idempotency_key`,
  `tax_line_items(payment_id, tax_type, jurisdiction_code)`,
  `owner_earnings.payout_reference`.

## Configuration

- `platform_kv_settings.owner_share_pct` — `{"owner_share_pct": 0.6667}` to
  override the rental split.
- `platform_kv_settings.tax_jurisdiction_USD` — `{"code": "US-DC"}` etc. USD
  payments get **no** tax line until this is set (no jurisdiction is guessed).

## Access control

`settle_payment_financials` is granted to `service_role` only; it is not
callable by `anon` or `authenticated`. The trigger runs `SECURITY DEFINER`, so
normal payment paths keep working without exposing the routine.

## Verified end-to-end

- NGN 120,000 rental → owner 80,000 credit, platform 40,000 credit, VAT 9,000,
  paid invoice, receipt, audit entry; re-running returns `duplicate: true`.
- NGN 30,000 training subscription → platform credit, paid subscription
  invoice, `user_subscriptions` row active.

## Known remaining gaps (not in this repair)

1. **Proxy billing has no charge-execution path.** `driver_proxy_billing_accounts`
   supports consent/KYC/card capture, but no edge function or cron ever debits a
   proxy's stored card. Needs a dedicated charge function that respects the
   one-time / validity-period consent rules.
2. **Invoice-type side effects.** Paying an invoice marks it paid but nothing
   reacts to `invoice_type` (e.g. rent-to-own conversion, clearing a fine).
3. **`usePayment.processOwnerPayout`** does not require an `authorizationId`
   while the gateway layer does; it is unused scaffolding and should be removed.
