# Backend Secret Retirement Checklist

This checklist does not authorize secret deletion, rotation, renaming, or production configuration changes. Static code inspection cannot prove the current secret bindings or whether a live caller remains.

## Keep until a verified cutover

| Secret/configuration | Repository consumers/evidence | Retirement condition |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend auth/admin integration; many Edge Functions and `_shared` clients; migrations describe Vault-backed `pg_net` calls | Do not retire while any Edge function, backend administrative DB/auth/storage operation, scheduled job, or webhook still uses it. Confirm least privilege and all consumers first |
| `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID_US`, `PERSONA_TEMPLATE_ID_NG`, `PERSONA_WEBHOOK_SECRET` | Persona inquiry creation and webhook flows; Cloud Run `personaWebhookService` requires the webhook secret and fails closed | Keep for Cloud Run and remaining Edge Persona functions until inquiry creation, webhook processing, retries and deployed callback cutover are verified |
| `ELEVENLABS_API_KEY` (Edge accepts the legacy alias `ELEVEN_LABS_API_KEY`) | `elevenlabs-tts`, stream, STT, voice list/agent token and transcript Edge functions; frontend TTS now uses BackendBridge but gateway still proxies Edge | Keep until all ElevenLabs operations are local and tested and no Edge/job caller remains |
| `SENT_API_KEY`, `SENT_WEBHOOK_SECRET`, sender IDs and sandbox mode | Cloud Run `sentClient`/SMS services and Edge shared provider client; Cloud Run Sent signature verification | Keep while sending and webhook delivery/inbound processing rely on either execution path |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, phone/WhatsApp sender values, API credentials and TwiML app SID | Backend `smsService`/`voipService`; Edge IVR, SMS commands and callbacks | Keep until all call/SMS/WhatsApp/recording callbacks are migrated and provider-side callback settings are verified |
| `TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_WEBHOOK_SECRET` | Regional SMS and Edge Termii callback/command handling; the new Cloud Run callback guard reads `TERMII_WEBHOOK_SECRET` from its server environment | Keep while Nigeria SMS or webhook consumers remain; bind `TERMII_WEBHOOK_SECRET` server-side before directing callbacks to Cloud Run; it is not currently listed in the deploy workflow secret bindings |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` | Cloud Run `paymentService` plus Edge payment and payout workflows | Keep while any approved payment/payout/refund/webhook path uses PayPal; validate provider webhook before cutover |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, public key | Cloud Run payment service and Edge transaction/transfer/webhook functions | Keep while Edge callers or callback URLs remain; verify duplicate webhook/idempotency handling before migration |
| `OPAY_MERCHANT_ID`, `OPAY_PUBLIC_KEY`, `OPAY_SECRET_KEY`, `OPAY_ENVIRONMENT` | Cloud Run `opayService` and Edge order/webhook operations | Keep until all OPay transactions/callbacks use a verified Cloud Run route |
| `HOLOGRAM_API_KEY`, `HOLOGRAM_ORG_ID`; Traccar tokens/passwords; EMQX keys; SAREKON credentials | Existing backend IoT services and corresponding Edge functions/jobs | Keep until provider-specific scheduled operations, device ownership and sync states have been verified on Cloud Run |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SIGNING_SECRET`, approved sender settings | Backend `emailService` and remaining Edge email/event jobs | Keep until queued/event email callers and webhook endpoints are migrated and delivery/suppression behavior is verified |
| `CRON_SECRET`, database credentials, `OTP_AUTH_SECRET`, internal bridge secret, VAPID and other service credentials | Cloud Run access policy, scheduled operations, OTP, internal email, database and push paths | Determine each consumer separately; do not use absence from a single workflow to claim unused |

## Deployment configuration gaps to verify (not changed)

- `.github/workflows/deploy.yml` currently injects only `PORTAL_SECRET_KEY`, `PORTAL_ADMIN_PASSWORD`, `PORTAL_MASTER_KEY`, and `SENT_WEBHOOK_SECRET` as Cloud Run secrets; it does not set or bind Persona, payment, communications, IoT, database, OTP, email, VAPID, or cron secrets there.
- `.env.example` documents many server-side values, but this is a local-development template and not proof of Cloud Run runtime configuration.
- `PERSONA_WEBHOOK_SECRET` is required by the Cloud Run Persona service but is absent from the workflow's Cloud Run secret binding list. Verify the deployed service binding before moving provider callbacks.
- `TERMII_WEBHOOK_SECRET` is required by the Cloud Run Termii callback guard but is absent from `.env.example` and the workflow's Cloud Run secret binding list. Configure it only in the backend secret store before directing Termii callbacks to this endpoint; the endpoint currently returns 503 for valid callbacks until a processor exists.
- The existing Edge ElevenLabs operations require `ELEVENLABS_API_KEY`; Cloud Run currently has no local TTS service and this change introduces no new environment variable.
- No secret was added to frontend code. `VITE_*` Supabase URL and publishable key remain public-client values; never place service-role, provider, webhook, or internal bridge secrets in the frontend.

## Retirement sequence

- [ ] Enumerate actual secret bindings in the approved Cloud Run and Supabase projects without printing secret values.
- [ ] Map every secret to active source consumers, deployed functions, scheduled jobs, webhooks, provider dashboards and CI/CD.
- [ ] Migrate callers and verify behavior in staging; inspect logs for missing configuration without logging secret values.
- [ ] Confirm a full observation window with no calls to the old Edge consumer, including retries and delayed provider callbacks.
- [ ] Obtain explicit change approval; then remove only the specific obsolete binding in a separate phase.
- [ ] Preserve rollback access and audit evidence; never delete/rotate a secret as part of this repository-only change.
