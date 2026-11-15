# Governing Rentmaikar Email Policy

This policy is enforced in CI via `npm run check:email-policy` (`scripts/check-email-policy.ts`) and governs every application component, Supabase Edge Function, and backend service in `beresdowds-afk/Rentmaikar-G2`.

## 1. Provider Exclusivity (Resend Only)

- **Resend** is the sole authorized outbound email service provider for Rentmaikar.
- No application module, frontend page, Edge Function, or background worker may silently fall back to another email provider (`SENT.DM` email fallback, custom `SMTP_HOST`/`SMTP_PORT` transport, or native Supabase Auth emailers).
- When Resend configuration is absent or Resend rejects/fails delivery, every dispatch path MUST fail closed / fail loudly and persist the failure state.
- **SENT.DM Scope**: SENT.DM remains strictly dedicated to **SMS and WhatsApp** messaging (`smsService.ts`, `messagingBridge.ts`, `sentClient.ts`, `sentDmAdapter.ts`, `communicationServices.ts`, `_shared/sent-client.ts`). Using SENT.DM for email (`sendEmailViaSent`) is strictly forbidden.

## 2. Authoritative Email Gateway (`rentmaikar-backend`)

- Cloud Run service **`rentmaikar-backend`** (custom API hostname `staging.rentmaikar.com`, GCP project `avian-computer-477009-v0`, region `europe-west1`) is the single authoritative outbound email gateway.
- Cloud Run service **`rentmaikar-g2`** is strictly the frontend SPA runtime serving `https://rentmaikar.com`.
- Idle/redundant Cloud Run service **`rentmaikar3`** is permanently excluded from the architecture and MUST NOT be deployed to, routed through, modified, or referenced.
- **`rentmaikar-backend`** exclusively holds `RESEND_API_KEY` and `RESEND_WEBHOOK_SIGNING_SECRET` / `RESEND_INBOUND_WEBHOOK_SECRET` and owns:
  - Caller authorization & internal bridge authentication (`x-rentmaikar-internal-secret`)
  - Sender identity allowlist enforcement (`DEFAULT_BUSINESS_FROM`, `APPROVED_BUSINESS_SENDERS`)
  - Fail-closed suppression checks against `public.suppressed_emails`
  - Durable outbox idempotency (`public.outbound_message_outbox`)
  - Audit & delivery tracking (`public.email_send_log`, `public.email_webhook_events`)
  - Signed Resend delivery & inbound webhook verification (Standard Webhooks / Svix)

## 3. Supabase Auth Email Integration

- Supabase Auth remains the source of truth for user identity, session state, and recovery/confirmation token generation (`token_hash`, `token`, `redirect_to`, `email_action_type`).
- Auth emails (`signup`, `recovery`, `magiclink`, `invite`, `email_change`, `reauthentication`) route through the registered Supabase Send Email Hook (`POST /api/webhooks/supabase-auth-email` on `rentmaikar-backend`, or Edge Function `supabase/functions/auth-email-hook` verifying Standard Webhooks `v1,whsec_` signatures and delegating to `rentmaikar-backend`).
- Direct client/Edge calls to `supabase.auth.resetPasswordForEmail()` or `supabase.auth.resend()` are prohibited; password reset and email verification requests route through `send-password-reset` and `send-verification-email` on `rentmaikar-backend`.
- Third-party preview/scaffold packages (`@lovable.dev/email-js`, `@lovable.dev/webhooks-js`) and `LOVABLE_API_KEY` are prohibited in email and Auth paths.

## 4. Sender, Reply-To, and DNS Policy

- Outbound transport uses Resend verified domain `notify.rentmaikar.com` (`RESEND_SENDING_DOMAIN`).
- Inbound customer support replies route to `backend.rentmaikar.com` (`support@backend.rentmaikar.com`).
- Public visible support/security footer references use `@rentmaikar.com`.
- Production webhook simulation (`/api/email/webhooks/simulate-event`) is blocked when `NODE_ENV=production` unless explicitly overridden with `ALLOW_EMAIL_WEBHOOK_SIMULATION=true` and requires portal/Supabase admin authentication.

## 5. Secrets Hygiene

- No `VITE_*` build variable may expose `RESEND_*`, `PORTAL_*`, `SERVICE_ROLE`, webhook secrets, or `RENTMAIKAR_INTERNAL_*` secrets.
- Supabase Edge Functions delegate outbound/inbound Resend operations to `rentmaikar-backend` using `RENTMAIKAR_BACKEND_URL` + `RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET` and do not hold or require `RESEND_API_KEY`.
