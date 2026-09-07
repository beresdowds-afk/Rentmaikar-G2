# Cloudflare Email Routing → RentMaikar inbound mail

Inbound domain: `backend.rentmaikar.com`
Outbound (sending) domain: `notify.rentmaikar.com` — managed by the platform, do **not** add MX for it.

Cloudflare Email Routing cannot call a webhook by itself; it can only forward to a
verified mailbox or run an **Email Worker**. This Worker is that bridge: it parses the
message and POSTs it to the platform inbound email function with a signed header, so
support/payments/documents/legal/negotiations mail lands in the Unified Inbox queues.

## 1. DNS (Cloudflare, zone `rentmaikar.com`)

Enable Email Routing on the zone. Cloudflare will add the MX + SPF records; make sure
they are created for the **`backend`** subdomain:

| Type | Name | Value | Priority |
|---|---|---|---|
| MX | `backend` | `route1.mx.cloudflare.net` | 78 |
| MX | `backend` | `route2.mx.cloudflare.net` | 27 |
| MX | `backend` | `route3.mx.cloudflare.net` | 51 |
| TXT | `backend` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | — |

All DNS-only (grey cloud). Keep the `notify` NS delegation records untouched.

> Cloudflare Email Routing is enabled per zone; for a subdomain you add the MX records
> above manually under DNS and add `backend.rentmaikar.com` addresses under
> Email Routing → Destination/Custom addresses.

## 2. Deploy the Worker

```bash
cd cloudflare/email-router
npm install
npx wrangler secret put EMAIL_WEBHOOK_URL      # https://<project>.functions.supabase.co/email-webhook
npx wrangler secret put EMAIL_WEBHOOK_SECRET   # same value as RESEND_WEBHOOK_SECRET
npx wrangler secret put FALLBACK_FORWARD_TO    # optional mailbox for failed deliveries
npx wrangler deploy
```

## 3. Route addresses to the Worker

Cloudflare dashboard → Email Routing → Routing rules. For each mailbox, set the
action to **Send to a Worker → rentmaikar-email-router**:

`support@`, `payments@`, `documents@`, `admin@`, `legal@`, `privacy@`, `dpo@`,
`nigeria@`, `usa@`, `negotiations@` (all `@backend.rentmaikar.com`)

Optionally enable the **catch-all** rule pointing at the same Worker so unknown
mailboxes still reach the support queue.

## 4. Verify

Send a test email to `support@backend.rentmaikar.com`, then:

- `npx wrangler tail` should show a 200 from the webhook
- the message appears in Admin → Unified Inbox under the Support queue

If the Worker logs a 403, `EMAIL_WEBHOOK_SECRET` does not match the backend's
`RESEND_WEBHOOK_SECRET`.
