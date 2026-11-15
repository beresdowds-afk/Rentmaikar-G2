# Outbound & Auth Email Architecture

## Authoritative Production Topology

All application and authentication emails flow through **`rentmaikar-backend`** (Cloud Run, `europe-west1`, `avian-computer-477009-v0`, custom hostname `staging.rentmaikar.com`) and dispatch exclusively through **Resend** (`api.resend.com`).

| Email Category | Entry Point | Gateway & Transport | Sender & Domain Policy | Auth & Security Controls | Persistence & Idempotency |
| --- | --- | --- | --- | --- | --- |
| Supabase Auth lifecycle | Supabase Auth Send Email Hook → `POST /api/webhooks/supabase-auth-email` (or Edge `auth-email-hook` → `rentmaikar-backend`) | `rentmaikar-backend` (`handleAuthEmailHook`) → Resend | Policy-enforced visible `From` (`DEFAULT_BUSINESS_FROM` / `APPROVED_BUSINESS_SENDERS`); transport `notify.rentmaikar.com` | Standard Webhooks HMAC-SHA256 verification (`SUPABASE_AUTH_HOOK_SECRET`); preserves Supabase `token_hash` / `redirect_to`; zero native mailer fallback | `email_send_log` + `outbound_message_outbox` (`auth_emails` class, no automatic DLQ replay) |
| Password reset & verification | Frontend / Edge (`send-password-reset`, `send-verification-email`, `admin-create-user`) → `/api/functions/*` | `rentmaikar-backend` (`handleSendPasswordReset`, `handleSendVerificationEmail`) → Resend | Verified `rentmaikar.com` / `notify.rentmaikar.com` allowlist | Rate-limited public / admin JWT / `x-rentmaikar-internal-secret`; fails closed on Resend error | `outbound_message_outbox` + `email_send_log` |
| Transactional & operational notifications | Edge Functions (`send-transactional-email`, `send-outbound-email`, `send-email-reply`, `notify-referees`, cron processors) → `_shared/backend-email-client.ts` / `_shared/resend-gateway.ts` | `rentmaikar-backend` (`/api/functions/*`) → Resend | `resolveBusinessEmailSender` allowlist enforcement | Edge Functions hold zero `RESEND_API_KEY`; authenticate to backend via `x-rentmaikar-internal-secret` (`RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET`) | Fail-closed `suppressed_emails` check + `outbound_message_outbox` + `email_send_log` |
| Marketing campaigns | `backend/src/marketing/resendAdapter.ts` (and dev proxy `src/server/marketing/resendAdapter.ts`) | `sendEmailViaResend()` in `emailService` → Resend | `resolveBusinessEmailSender` allowlist + CAN-SPAM unsubscribe header/footer | Server-only marketing engine | Deterministic `idempotencyKey` (`mkt:${campaignId}:${leadId}`) in `outbound_message_outbox` |
| Delivery & bounce webhooks | Resend Svix webhook → `POST /api/functions/resend-events` (or Edge `resend-events` → `rentmaikar-backend`) | `rentmaikar-backend` (`handleResendWebhookEvent`) | N/A | Standard Webhooks HMAC signature verification (`RESEND_WEBHOOK_SIGNING_SECRET`) | `email_webhook_events` (`svix_id` unique dedup) + auto-insert into `suppressed_emails` on bounce/complaint |
| Inbound email & replies | Resend inbound / Cloudflare worker → `email-webhook` → `_shared/resend-inbound.ts` → `fetch-resend-inbound-email` | `rentmaikar-backend` (`resendReceivingService.ts`) | Inbound domain `backend.rentmaikar.com` | Multi-secret Standard Webhooks verification (`RESEND_INBOUND_WEBHOOK_SECRET` / `RESEND_WEBHOOK_SIGNING_SECRET`) | Inbox ticket storage + admin reply (`send-email-reply`) |

## Service Boundaries

- **`rentmaikar-g2`**: Frontend SPA container serving `https://rentmaikar.com`. Holds no email credentials, no `RESEND_API_KEY`, and no backend secrets.
- **`rentmaikar-backend`**: Authoritative backend API and email gateway (`staging.rentmaikar.com`). Exclusively holds `RESEND_API_KEY`, webhook secrets, sender policy env vars, and `RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET`.
- **`rentmaikar3`**: Idle legacy service — strictly excluded from deployment, routing, and documentation.
- **SENT.DM**: Retained exclusively for **SMS and WhatsApp** delivery (`smsService.ts`, `messagingBridge.ts`, `_shared/sent-client.ts`). Zero email routing or email fallback touches SENT.DM.

## Database Schema & Migrations

1. `supabase/migrations/20261109120000_durable_message_outbox_and_telemetry_lifecycle.sql`: Creates `public.outbound_message_outbox` and atomic `claim_outbound_message` / `enqueue_email` primitives.
2. `supabase/migrations/20261115000000_email_architecture_hardening.sql`: Creates `public.email_webhook_events` (`svix_id` idempotent deduplication + admin-only RLS), expands `public.email_send_log_status_check` to cover `'accepted'`, `'delivered'`, and `'rate_limited'`, and adds case-insensitive `idx_suppressed_emails_lower_email`.

## External Operator Actions (Outside Repository Source)

These runtime actions cannot be executed from repository code alone and must be verified by an operator during controlled rollout:

1. Apply database migrations (`20261109120000_*`, `20261115000000_*`) to Supabase project `jrsydiofzceoeddjogov`.
2. Verify Cloud Run secret bindings & non-secret env vars on `rentmaikar-backend` (`avian-computer-477009-v0`, `europe-west1`):
   - Secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SIGNING_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET`, `SUPABASE_AUTH_HOOK_SECRET`, `RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`.
   - Env vars: `RESEND_SENDING_DOMAIN=notify.rentmaikar.com`, `DEFAULT_BUSINESS_FROM`, `APPROVED_BUSINESS_SENDERS`.
3. Configure Supabase Edge Function secrets for `jrsydiofzceoeddjogov`: `RENTMAIKAR_BACKEND_URL=https://staging.rentmaikar.com`, `RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET`, and `SUPABASE_AUTH_HOOK_SECRET` (remove stale `RESEND_API_KEY` and `LOVABLE_API_KEY` from email Edge Functions once cut over).
4. Register Supabase Auth Send Email Hook (`https://staging.rentmaikar.com/api/webhooks/supabase-auth-email` or Edge `auth-email-hook`) with the matching `v1,whsec_...` secret and confirm Resend DNS records (SPF, DKIM, DMARC) for `notify.rentmaikar.com` / `rentmaikar.com` and MX for `backend.rentmaikar.com`.
