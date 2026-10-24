# RentMaikar Credential Matrix & Secret Isolation Policy

This document defines the strict segregation between client-safe variables (prefixed with `VITE_`) and server-only secrets for the RentMaikar platform.

---

## 0. Surface Separation (Public Frontend vs Admin Backend)

Credentials are split by deployment surface. Templates: `handoff/env/public-frontend.env.template` and `handoff/env/admin-backend.env.template`. Enforced by `npm run check:env-surfaces`.

| Surface | Domain | Cloud Run service | May hold |
|---|---|---|---|
| Public frontend (nginx) | rentmaikar.com | `rentmaikar-g2` | Public `VITE_*`, `BACKEND_URL`, `SUPABASE_URL`, `PUBLIC_APP_URL` only |
| Admin backend | staging.rentmaikar.com | `rentmaikar-backend` | `PORTAL_*` group and all other backend secrets |

### 0.1 Surface-to-variable matrix

| Variable | Surface | Secret / Public | Where to set | Rotation notes |
|---|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID` | Public frontend | Public | Docker build arg | Change on redeploy |
| `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY` | Public frontend | Public (publishable) | Docker build arg | Rotate in Supabase; rebuild image |
| `BACKEND_URL`, `SUPABASE_URL` | Public frontend | Public | Cloud Run env (nginx envsubst) | Update if upstream changes |
| `PUBLIC_APP_URL` | Public frontend | Public | Cloud Run env | n/a |
| `PORTAL_SECRET_KEY` | Admin backend | **Secret** | Secret Manager (`--set-secrets`) | Rotation invalidates all portal sessions |
| `PORTAL_ADMIN_EMAIL` | Admin backend | Sensitive config | Cloud Run env (`--update-env-vars`) or Secret Manager | Change with password |
| `PORTAL_ADMIN_PASSWORD` | Admin backend | **Secret** | Secret Manager | Rotate on operator change / suspected exposure |
| `PORTAL_MASTER_KEY` | Admin backend | **Secret** | Secret Manager | Rotate on suspected exposure |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin backend | **Secret** | Secret Manager | Rotate in Supabase; redeploy |
| `TWILIO_*`, `SENT_*`, `RESEND_*`, `PAYSTACK_*`, `PAYPAL_*`, `OPAY_*`, `PERSONA_API_KEY`, `ELEVENLABS_API_KEY`, `TERMII_API_KEY` | Admin backend | **Secret** (IDs/modes are config) | Secret Manager (see Section 2 and admin template) | Rotate at provider console |
| `PORT`, `NODE_ENV`, `PUBLIC_BACKEND_URL`, `ALLOWED_ORIGINS`, `SUPABASE_URL` | Admin backend | Public config | Cloud Run env | n/a |

### 0.2 Never do

- Never put `PORTAL_*` or service-role keys in `VITE_*` variables, Docker build args, nginx env, or the public frontend service (`rentmaikar-g2`).
- Never place payment/CPaaS secrets (Twilio, Paystack, PayPal, OPay, Sent, Resend) on the public frontend.
- Never use `--set-env-vars` on `rentmaikar-backend`: it replaces all existing vars. Use `--update-env-vars` or `--set-secrets`.
- Never commit real values to templates; placeholders only.

---

## 1. Security Isolation Hierarchy

```
[ SURFACE 1: rentmaikar.com — nginx public frontend (NO secrets; never PORTAL_*, service-role keys) ]
  ├── VITE_SUPABASE_URL (https://jrsydiofzceoeddjogov.supabase.co)
  ├── VITE_SUPABASE_PUBLISHABLE_KEY (Anon JWT)
  ├── VITE_API_BASE_URL (configured per frontend deployment)
  └── VITE_STAGING_API_BASE_URL (https://staging.rentmaikar.com/api)

[ SURFACE 2: staging.rentmaikar.com — rentmaikar-backend admin-only portal (PORTAL_* + backend secrets) ]
  ├── PORTAL_SECRET_KEY, PORTAL_ADMIN_EMAIL, PORTAL_ADMIN_PASSWORD, PORTAL_MASTER_KEY
[ SURFACE 3: rentmaikar-g2 — backend (owner's intent; see DEPLOYMENT-SURFACES.md) ]
[ SURFACES 2 & 3 / EDGE FUNCTIONS (Strict Secrets) ]
  ├── SUPABASE_SERVICE_ROLE_KEY (Bypasses RLS - NEVER expose to frontend)
  ├── TWILIO_AUTH_TOKEN & TWILIO_API_KEY_SECRET
  ├── SENT_API_KEY & SENT_WEBHOOK_SECRET
  ├── PAYPAL_CLIENT_SECRET
  ├── PAYSTACK_SECRET_KEY
  ├── PERSONA_API_KEY
  └── RESEND_API_KEY
```

---

## 1.1 Variable matrix by deployment surface

See [`DEPLOYMENT-SURFACES.md`](./DEPLOYMENT-SURFACES.md) for ownership and deploy targets.

| Variable group | 1. `rentmaikar.com` (nginx) | 2. `staging.rentmaikar.com` (`rentmaikar-backend`) | 3. `rentmaikar-g2` (backend, intended) |
|---|---|---|---|
| `VITE_*` (public client config) | Yes (build-time) | No | No |
| `BACKEND_URL`, `SUPABASE_URL` (non-secret runtime URLs) | Yes | `SUPABASE_URL` only | `SUPABASE_URL` only |
| `PORTAL_SECRET_KEY`, `PORTAL_ADMIN_EMAIL`, `PORTAL_ADMIN_PASSWORD`, `PORTAL_MASTER_KEY` | **Never** | Yes (env / Secret Manager) | Only if it serves portal routes |
| `SUPABASE_SERVICE_ROLE_KEY` and all provider secrets (Twilio, Sent.dm, PayPal, Paystack, OPay, Persona, Resend, ...) | **Never** | Yes | Yes |

Templates: [`handoff/env/public-frontend.env.template`](./env/public-frontend.env.template) (surface 1) and [`handoff/env/admin-backend.env.template`](./env/admin-backend.env.template) (surfaces 2 and 3) are the source of truth. `handoff/backend.env.template` is only a pointer to them, and `.env.example` (local development) carries per-variable surface headers. Compliance is enforced by `npm run check:env-surfaces`.

---

## 2. Platform Credential Inventory

| Key Name | Location | Sensitivity | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Frontend `.env` | Public | Target Supabase URL (`https://jrsydiofzceoeddjogov.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend `.env` | Public | Public anonymous key for client RLS queries |
| `VITE_API_BASE_URL` | Frontend build | Public | Primary API base; staging builds use `https://staging.rentmaikar.com/api`, production keeps the `rentmaikar-g2` API gateway |
| `VITE_STAGING_API_BASE_URL` | Frontend build | Public | Staging fallback API base used by the bridge |
| `BACKEND_URL` | Frontend Cloud Run | Public | Cloud Run upstream origin for `/api` and `/portal`; Nginx Host and TLS SNI follow this URL |
| `PORTAL_ADMIN_EMAIL` | Surface 2 backend (Cloud Run) | Sensitive | Initial admin account email; required to enable portal auth (no hardcoded fallback) |
| `PORTAL_ADMIN_PASSWORD` | Surface 2 backend (Cloud Run Secret) | **CRITICAL** | Initial admin password; required to enable portal auth (no hardcoded fallback) |
| `PORTAL_MASTER_KEY` | Surface 2 backend (Cloud Run Secret) | **CRITICAL** | Portal admin master-key login credential |
| `PORTAL_SECRET_KEY` | Surface 2 backend (Cloud Run Secret) | **CRITICAL** | HMAC key for signing and verifying portal sessions; no hardcoded fallback |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend / Edge | **CRITICAL** | Full administrative database privileges |
| `TWILIO_ACCOUNT_SID` | Backend / Edge | High | Twilio Account identifier |
| `TWILIO_AUTH_TOKEN` | Backend / Edge | **CRITICAL** | Twilio authentication token for webhooks and REST |
| `TWILIO_TWIML_APP_SID` | Backend / Edge | Medium | TwiML voice application identifier |
| `TWILIO_API_KEY_SID` | Backend / Edge | Medium | Twilio Voice WebRTC API Key identifier |
| `TWILIO_API_KEY_SECRET` | Backend / Edge | **CRITICAL** | Secret used to sign Twilio WebRTC client tokens |
| `SENT_API_KEY` | Backend | High | Sent.dm CPaaS API access token |
| `SENT_WEBHOOK_SECRET` | Backend | High | Signature validation secret for Sent.dm callbacks |
| `PAYPAL_CLIENT_ID` | Backend | Medium | PayPal application client ID |
| `PAYPAL_CLIENT_SECRET` | Backend | **CRITICAL** | PayPal transaction authorization secret |
| `PAYSTACK_SECRET_KEY` | Backend | **CRITICAL** | Paystack payment secret (Nigeria gateway) |
| `PAYSTACK_WEBHOOK_SECRET` | Backend / Edge | **CRITICAL** | Paystack webhook verification secret |
| `OPAY_MERCHANT_ID` | Backend | **CRITICAL** | OPay merchant identifier required for cashier and payout configuration |
| `OPAY_PUBLIC_KEY` | Backend | **CRITICAL** | OPay public key used for cashier/order requests |
| `OPAY_SECRET_KEY` | Backend | **CRITICAL** | OPay secret key used for signed OPay requests and webhook verification |
| `OPAY_ENVIRONMENT` | Backend | Medium | OPay environment selector (`sandbox` / `live`) |
| `EMQX_API_URL` | Backend / Edge | Medium | EMQX management API base URL; may be overridden by deployment config |
| `EMQX_API_KEY` | Backend / Edge | **CRITICAL** | EMQX management API key; used when no active vault rotation credential is present |
| `EMQX_API_SECRET` | Backend / Edge | **CRITICAL** | EMQX management API secret; used when no active vault rotation credential is present |
| `TRACCAR_API_URL` | Backend / Edge | Medium | Traccar API URL override |
| `TRACCAR_BASE_URL` | Backend / Edge | Medium | Traccar base URL used by some flows |
| `TRACCAR_API_TOKEN` | Backend / Edge | **CRITICAL** | Traccar API token |
| `TRACCAR_API_KEY` | Backend / Edge | **CRITICAL** | Traccar API key / fallback auth secret |
| `TRACCAR_EMAIL` | Backend / Edge | Medium | Traccar account email used by some auth flows |
| `TRACCAR_PASSWORD` | Backend / Edge | **CRITICAL** | Traccar account password used by some auth flows |
| `TRACCAR_VAPID_KEY` | Backend / Edge | Medium | Traccar web push VAPID key |
| `ELEVENLABS_API_KEY` | Backend | High | ElevenLabs text-to-speech API key |
| `GEMINI_API_KEY` | Backend | High | Google Gemini API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Backend / Edge | High | Google Cloud ADC credential path or JSON credential payload source |
| `GCP_PROJECT_ID` | Backend / Edge | High | Google Cloud project ID for ADC / GCP client configuration |
| `GCP_CLIENT_ID` | Backend / Edge | Medium | Google OAuth client ID used by some Google integrations |
| `GCP_CLIENT_SECRET` | Backend / Edge | **CRITICAL** | Google OAuth client secret used by some Google integrations |
| `VITE_GOOGLE_CLIENT_ID` | Frontend `.env` | Public | Google client ID exposed to the browser for sign-in flows |
| `VAPID_PUBLIC_KEY` | Backend / Frontend | Public | Web Push public VAPID key |
| `VAPID_PRIVATE_KEY` | Backend | **CRITICAL** | Web Push private VAPID key |
| `VAPID_SUBJECT` | Backend / Frontend | Public | Web Push contact subject / mailto URI |
| `PERSONA_API_KEY` | Backend | High | Persona biometric & driver KYC verification key |
| `RESEND_API_KEY` | Backend | High | Transactional email delivery service |
| `RESEND_WEBHOOK_SIGNING_SECRET` | Backend / Edge | High | Resend Svix webhook signing secret (`whsec_...`) to verify delivery and inbound callbacks |

### 2.1 Runtime authentication paths that are not equivalent to a single env-var check

- **EMQX management configuration:** `EMQX_API_URL`, `EMQX_MQTT_HOST`, and `EMQX_MQTT_PORT` shape the management endpoint, but they are not secrets. The runtime config resolver prefers a deployed `platform_kv_settings.emqx_management_config` value when present, then falls back to env vars, then defaults.
- **EMQX management credentials:** runtime credential resolution prefers an active vault-backed rotation credential when present, then falls back to `EMQX_API_KEY` / `EMQX_API_SECRET`. A missing env var alone does not prove EMQX is unavailable.
- **Google Cloud ADC:** some Google integrations may use Application Default Credentials (ADC) rather than a static JSON key. Presence of `GOOGLE_APPLICATION_CREDENTIALS` or related vars should be interpreted according to the specific code path, not as universal proof of readiness.
- **Google Ads OAuth:** the Google Ads adapter uses OAuth client credentials and refresh tokens (`GOOGLE_ADS_*`) and is separate from ADC-based Google Cloud authentication.
- **Provider readiness:** credential presence only confirms configuration. It does not prove the provider account is active, a live transaction succeeds, or webhook verification is working.

### 2.2 Provider-specific runtime authentication matrix

| Provider / subsystem | Configuration source | Secret material | Runtime verification path | Notes |
|---|---|---|---|---|
| EMQX management endpoint | `platform_kv_settings.emqx_management_config`, then `EMQX_API_URL` / `EMQX_MQTT_HOST` / `EMQX_MQTT_PORT` | No | Dashboard probes management API through `resolveEmqxClient()` / `probeEmqx()` | Endpoint config is separate from credentials |
| EMQX management credentials | Vault rotation via `emqx_read_credentials`, then env fallback | Yes | `supabase/functions/_shared/emqx-credentials.ts` | Vault-backed credentials take precedence |
| Google Cloud ADC | Local `gcloud auth application-default login`, GitHub Actions Workload Identity Federation, Cloud Run / Cloud Build metadata server | Depends on ADC source | Google client libraries resolve ADC automatically | Do not treat `GOOGLE_APPLICATION_CREDENTIALS` as the only path |
| Google Ads OAuth | `GOOGLE_ADS_*` env vars | Yes | OAuth token exchange and refresh in `googleAdsAdapter.ts` | Distinct from ADC-based Google Cloud auth |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Private key only | Web Push signing and subscription delivery flows | `VAPID_PUBLIC_KEY` is public by design |

---

### 2.3 Staging backend portal deployment

Build the admin-only staging frontend with `VITE_API_BASE_URL=https://staging.rentmaikar.com/api` and `VITE_STAGING_API_BASE_URL=https://staging.rentmaikar.com/api`. The frontend Nginx service must set `BACKEND_URL` to the `rentmaikar-backend` Cloud Run service origin (for example, `https://rentmaikar-backend-<service-id>-<region>.run.app`); Nginx derives proxy `Host` and TLS SNI from that upstream.

Set `PUBLIC_BACKEND_URL=https://staging.rentmaikar.com` and `PORTAL_ADMIN_EMAIL` on `rentmaikar-backend`. Bind `PORTAL_ADMIN_PASSWORD`, `PORTAL_MASTER_KEY`, and `PORTAL_SECRET_KEY` from Secret Manager at deploy time. Production backend startup fails if any of the four `PORTAL_*` variables is missing or empty. Backend deployment commands update ordinary env vars so existing Secret Manager bindings are retained. Do not reuse `SUPABASE_SERVICE_ROLE_KEY` for portal signing.

The production frontend retains its `rentmaikar-g2` API gateway base; configure its staging fallback separately with `VITE_STAGING_API_BASE_URL`.

---

## 3. Key Rotation Guidelines

1. **Immediate Revocation**: If any service role key or API secret is committed to a client repository or exposed in browser bundles, regenerate it immediately via the provider console.
2. **Zero In-Code Secrets**: No production keys may be hardcoded into TypeScript files. All secrets are read via `process.env` in backend microservices.
3. **Configuration vs readiness**: treat secret presence, runtime authentication, live request success, and webhook verification as separate checks in operational runbooks.

---

## 4. Backend Portal Credentials (`rentmaikar-backend`)

The admin-only backend portal (served at `staging.rentmaikar.com`) reads its fallback admin credentials solely from environment variables. No defaults exist in source.

| Variable | Purpose | Behavior when unset |
|---|---|---|
| `PORTAL_ADMIN_EMAIL` | Admin login email (no default) | Production: startup fails |
| `PORTAL_ADMIN_PASSWORD` | Admin email/password login (seeded and hashed at startup) | Production: startup fails |
| `PORTAL_MASTER_KEY` | Master key login | Production: startup fails |
| `PORTAL_SECRET_KEY` | Dedicated session-signing secret (never `SUPABASE_SERVICE_ROLE_KEY`) | Production: startup fails. Non-production: random per-process secret |

Inject these into the `rentmaikar-backend` Cloud Run service via Secret Manager (`--set-secrets`) or `--update-env-vars`. Use placeholder-free, newly generated values; any previously committed or default values are compromised and must be rotated.
