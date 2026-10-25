# Outbound email architecture and verification

## Source-level architecture inventory

This inventory reflects repository source and deployment manifests, not a live
production inspection. Cloud Run targets, Supabase function settings, provider
secrets, sender verification, and DNS records remain unverified externally.

| Email purpose | Initiator and dispatch path | Hosting and provider | Visible sender | Authentication and authorization | Secret/configuration | Duplicate and status notes |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase Auth lifecycle | Supabase Auth event → `supabase/functions/auth-email-hook/index.ts` → `enqueue_email` → `supabase/functions/process-email-queue/index.ts` → `_shared/resend-gateway.ts` | Supabase Edge Functions → Resend | Gateway enforces `DEFAULT_BUSINESS_FROM` from the configured allowlist; the hook's queued `from` value is not authoritative | Hook verifies its signed Auth webhook; queue processor uses Supabase service credentials. Actual hook registration and SMTP settings are dashboard-owned and unverified | Supabase Edge secrets include the referenced Resend and service-role settings; values are not in source | Queue/message IDs are used for tracking; delivery idempotency and deployed retry behavior require runtime verification |
| Transactional templates | Supabase callers and `supabase/functions/send-transactional-email/index.ts` enqueue work for `process-email-queue` | Supabase Edge Functions → Resend | Shared gateway sender policy | Edge config sets `verify_jwt = true`; endpoint-specific role/operation authorization must still be verified | Supabase Edge secrets and sender-policy settings | Idempotency key is enqueued, but provider acceptance is not delivery confirmation |
| Business email through bridge | Frontend bridge → `/api/bridge/call` → `backend/src/routes/bridge.ts` → `backend/src/services/emailService.ts` | Cloud Run backend → Resend | Server-side default sender, checked against explicit allowlist | This bridge route now requires a verified caller and administrator status for its email actions | Cloud Run `RESEND_API_KEY`, `DEFAULT_BUSINESS_FROM`, and `APPROVED_BUSINESS_SENDERS`; the sender-policy variables are not currently wired by the deployment workflow | Resend acceptance is logged as sent in existing code; no claim of recipient delivery |
| Other business Edge sends | Multiple notification, payment, agreement, and communication Edge Functions call `_shared/resend-gateway.ts` directly | Supabase Edge Functions → Resend, bypassing Cloud Run | Shared gateway enforces the configured allowlist when configuration is present | Authorization varies by function; `supabase/config.toml` has many functions with `verify_jwt = false`, so handler-level controls need individual verification | Supabase Edge `RESEND_API_KEY` and sender-policy settings | Queue and caller retries may duplicate messages; no single shared idempotency guarantee was established |
| Email replies and marketing | `send-email-reply` route and marketing adapters can call Resend directly from server code; reply routing may first try an Edge Function | Cloud Run or the legacy root server → Resend | Server-side sender policy now controls applicable sends | Route-level authorization and actual deployed status vary; legacy root server is not established as the deployed backend | Server `RESEND_API_KEY` and sender-policy settings | These paths remain separate dispatch implementations; deployment and retry behavior are not verified |

The intended two-category architecture is **not fully implemented**. Auth token
generation remains Supabase-owned in the Auth hook path, but the actual Supabase
hook/SMTP configuration is unknown. Business email still has direct Supabase
Edge-to-Resend paths and other direct provider adapters in addition to the
Cloud Run bridge. The browser bridge has no Resend credential, but it is not the
only business dispatch path.

The deployment workflow identifies `rentmaikar-backend` in `europe-west1` and
configures `staging.rentmaikar.com` as its API hostname. This is repository
configuration only, not confirmation that the live service or DNS currently
routes there. `RESEND_SENDING_DOMAIN` is a transport/bounce-domain setting and
must not be treated as the visible `From` domain.

## Sender policy

Application-controlled sends now require both:

- `DEFAULT_BUSINESS_FROM`: one approved exact-domain address.
- `APPROVED_BUSINESS_SENDERS`: comma-separated exact addresses, including the
  default.

The policy rejects other domains, subdomains, lookalike domains, and
unallowlisted local parts. It ignores caller-supplied sender overrides and
constrains unapproved `Reply-To` values to the configured default sender; a
different `Reply-To` is accepted only when that exact address is also in the
server-side allowlist. Recipient lists are validated and capped, and the
shared Resend gateway rejects client-supplied CC/BCC. Existing reply/forward flows that used external
`Reply-To` addresses will therefore reply to the configured sender instead.
No production-approved mailbox or provider verification was discoverable in
the repository. Example values in UI, templates, webhook fixtures, or tests do
not establish that a mailbox exists.

`src/lib/email-config.ts` contains source-level contact candidates
(`support@rentmaikar.com`, `privacy@rentmaikar.com`, `legal@rentmaikar.com`,
`dpo@rentmaikar.com`, `payments@rentmaikar.com`, `documents@rentmaikar.com`,
`admin@rentmaikar.com`, and `support.ng@rentmaikar.com`). These are not an
approved sender allowlist and do not prove the addresses exist or have been
verified by Resend.

Supabase Auth's hook source currently queues its own sender field, while the
shared transport gateway enforces the server-side sender at delivery. This
source behavior does not prove that the hook is registered or that SMTP,
Resend, or domain authentication is configured in the live Supabase project.

## External verification required

1. Set Cloud Run environment variables `DEFAULT_BUSINESS_FROM` to a real,
   verified mailbox and `APPROVED_BUSINESS_SENDERS` to only explicitly approved,
   verified addresses. The current `.github/workflows/deploy.yml` does not pass
   these variables; either configure them directly on Cloud Run or update the
   workflow and redeploy.
2. In Supabase Edge Function secrets, configure the same sender policy and
   verify the Resend credential is present. Do not expose these values to
   frontend build variables.
3. In the Supabase Auth dashboard, inspect the active email hook and SMTP
   configuration, verify the visible sender is approved, and confirm signup,
   recovery, and email-change flows still use Supabase-generated links/tokens.
4. In Resend, verify the root `rentmaikar.com` sender domain and each approved
   address. Obtain SPF/DKIM record values from the provider. Inspect existing
   DNS before changes; preserve current MX/mail flows and publish an appropriate
   DMARC policy only after reviewing existing records. Keep any provider
   bounce/Return-Path domain separate from the visible sender policy.
5. Verify the deployed Cloud Run service, API hostname, secret bindings, and
   actual GitHub Actions variables. The workflow does not establish the current
   runtime state of secrets not explicitly wired in that deployment command.
6. Migrate or formally approve each business Edge function and direct Resend
   adapter before claiming a single Cloud Run business-email route.

Public DNS lookups were attempted during this review but returned `EREFUSED`;
no SPF, DKIM, or DMARC record status can be concluded from that result.
