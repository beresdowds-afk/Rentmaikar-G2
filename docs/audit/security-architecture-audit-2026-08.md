# Platform Security Architecture Audit & Repair — August 2026

Scope: frontend, edge functions, database (RLS/RPC/grants), storage, auth
configuration, third-party integrations (Twilio, Persona, Traccar, PSPs) and
administrative tooling, across all user roles (driver, owner, admin, admin
assistant, support staff, anonymous).

---

## 1. Critical findings and fixes

### 1.1 IDOR in the billing portal (CRITICAL — fixed)
`billing-portal` authenticated the caller but never checked record ownership.
Any signed-in driver or owner could read, resend or void **any** invoice or
receipt by ID, exposing amounts, emails and PSP transaction references.

Fix: `assertCanAccess()` loads the row and requires caller ==
`driver_id`/`owner_id`, an admin/admin assistant, or an internal
(service-role/cron) caller. Privileged actions (`void_invoice`,
`create_invoice`) require the privileged path. Unauthorized targets return
403; unknown IDs return 404.

Verified: unauthenticated `POST /billing-portal` returns `401 Unauthorized`.

### 1.2 Unauthenticated background jobs (HIGH — fixed)
Five background functions were callable by anyone on the internet:
`send-push-notification`, `persona-reconcile`, `send-persona-digest`,
`send-reconciliation-alert`, `check-repeat-call-ins`.

Fix: new shared guard `supabase/functions/_shared/guard.ts` exposing
`requireInternal` (CRON_SECRET / service-role bearer), `requireAuthenticated`
and `requireAdminCaller`. All five are now gated. `persona-reconcile` is
additionally reachable by signed-in users but **scoped to their own
inquiries** — only internal/admin callers run the full sweep.

### 1.3 Unverified Twilio IVR webhooks (HIGH — fixed)
`expiry-notification-ivr`, `payment-default-ivr`, `shutdown-warning-ivr` and
`vehicle-return-ivr` accepted unsigned form posts, allowing forged DTMF input
to drive payment-default and vehicle-return state.

Fix: `supabase/functions/_shared/twilio-signature.ts` implements Twilio's
HMAC-SHA1 `X-Twilio-Signature` validation; all four endpoints now reject
unsigned or mis-signed requests.

### 1.4 Over-exposed SECURITY DEFINER routines (HIGH — fixed)
22 `SECURITY DEFINER` routines (settlement triggers, application recovery,
role helpers) were executable by `PUBLIC`/`anon`/`authenticated`.

Fix: `EXECUTE` revoked from `PUBLIC` and `anon`; user-facing RPCs narrowed to
`authenticated`; internal trigger functions restricted to `service_role`.
`voip_call_transcripts` writes are now `service_role`-only. Database linter
findings dropped from 122 to 94.

The 8 routines still callable anonymously are intentional and each carries its
own in-function authorization: `check_auth_rate_limit`, `log_auth_event`,
`log_verification_event` (pre-sign-in telemetry/limits), `get_allowed_regions`
and `is_allowed_region` (public landing-page region data), and
`get_proxy_consent_context`, `submit_proxy_consent`,
`update_proxy_notification_prefs` (consent-token gated, for proxies who reach
the platform via an emailed link and have no account).

### 1.5 Stored XSS in the Traccar live map (MEDIUM — fixed)
`TraccarLiveMap.tsx` interpolated Traccar-supplied `device.name`,
`device.status` and reverse-geocoded `address` straight into `innerHTML`. A
device named with a `<img onerror=...>` payload would execute in an admin
session. Fix: all interpolated values pass through an HTML escaper.

### 1.6 Passport pictures in a public bucket (MEDIUM — fixed)
`profile-photos` held users' passport photographs but was a **public** bucket:
anyone holding or guessing the object URL could read identity photos, and the
URL was persisted in `profiles.avatar_url`.

Fix: bucket flipped to private; `profiles.avatar_url` now stores the storage
path and the UI mints a 1-hour signed URL on render (legacy public URLs are
normalised transparently). New `profile_photos_select_own` policy on
`storage.objects` limits reads to the owning user plus admins/admin assistants.

### 1.7 Leaked-password protection (fixed)
Have I Been Pwned checking is now enabled on signup and password change.
Anonymous sign-ups remain disabled.

---

## 2. Layers reviewed and found sound

- **XSS**: the only other `dangerouslySetInnerHTML` uses (policy/terms
  rendering) are DOMPurify-sanitised. No `eval`. CSP is set in `index.html`
  with `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and an
  explicit allow-list for PSP, Persona, tile and Supabase origins.
- **Secrets**: no service-role key, PSP secret or provider token appears in
  client code; all privileged calls run in edge functions.
- **Storage**: 13 of 15 buckets are private (agreements, appeals, call
  recordings, chat attachments, document exports, signatures, user documents,
  inspection/incident photos). `vehicle-photos` remains public by design.
- **Roles**: roles live in `user_roles` with `has_role()` /
  `has_admin_assistant_permission()` security-definer checks — no role column
  on `profiles`, so no privilege-escalation-by-profile-update path.
- **Webhooks**: Termii, Persona and PSP webhooks already validated their
  shared secrets/signatures.
- **Admin API keys**: `generate-api-key` already enforced an admin role check;
  keys are stored hashed.

---

## 3. Residual risks and recommendations

1. **Admin-trust surfaces** (open, low severity, informational):
   `api_keys.key_hash` and `webhooks.secret` are readable by any admin, and
   `rideshare_profile_submissions` uses inline `EXISTS` role checks rather
   than `is_admin()`. All three are consistent with the current
   "admins are fully trusted" model; standardising the role check is a
   consistency improvement, not a vulnerability.
2. **Remaining 94 linter warnings** are predominantly
   "signed-in users can execute SECURITY DEFINER function" on legitimate
   user-facing RPCs (wallet summary, onboarding progress, payment preflight),
   plus `extension in public`. Each already authorises internally.
3. **CSP hardening**: `script-src` still needs `'unsafe-inline'`/`'unsafe-eval'`
   for the current bundler and Persona/Meta pixel. Moving to nonces would
   remove the last practical XSS amplifier.
4. **Rate limiting** exists for auth and phone OTP but not for every
   authenticated edge function; consider a shared limiter for the billing and
   payment endpoints.
5. **Legacy avatar rows**: profiles that still store a full public URL resolve
   correctly through the path normaliser, but a one-off backfill to bare paths
   would simplify the code later.
