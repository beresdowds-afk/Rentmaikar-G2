# RentMaikar Credential Matrix & Secret Isolation Policy

This document defines the strict segregation between client-safe variables (prefixed with `VITE_`) and server-only secrets for the RentMaikar platform.

---

## 1. Security Isolation Hierarchy

```
[ BROWSER CLIENT (Public) ]
  ├── VITE_SUPABASE_URL (https://jrsydiofzceoeddjogov.supabase.co)
  ├── VITE_SUPABASE_PUBLISHABLE_KEY (Anon JWT)
  └── VITE_API_BASE_URL (https://staging.rentmaikar.com/api)

[ EXPRESS BACKEND / EDGE FUNCTIONS (Strict Secrets) ]
  ├── SUPABASE_SERVICE_ROLE_KEY (Bypasses RLS - NEVER expose to frontend)
  ├── TWILIO_AUTH_TOKEN & TWILIO_API_KEY_SECRET
  ├── SENT_API_KEY & SENT_WEBHOOK_SECRET
  ├── PAYPAL_CLIENT_SECRET
  ├── PAYSTACK_SECRET_KEY
  ├── OPAY_MERCHANT_ID & OPAY_PUBLIC_KEY & OPAY_SECRET_KEY
  ├── EMQX_API_URL & EMQX_API_KEY & EMQX_API_SECRET
  ├── TRACCAR_API_URL / TRACCAR_BASE_URL & TRACCAR_API_TOKEN / TRACCAR_API_KEY
  ├── ELEVENLABS_API_KEY
  ├── GEMINI_API_KEY
  ├── GOOGLE_APPLICATION_CREDENTIALS / GCP_PROJECT_ID / GCP_CLIENT_ID / GCP_CLIENT_SECRET
  ├── VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY & VAPID_SUBJECT
  ├── PERSONA_API_KEY
  └── RESEND_API_KEY
```

---

## 2. Platform Credential Inventory

| Key Name | Location | Sensitivity | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Frontend `.env` | Public | Target Supabase URL (`https://jrsydiofzceoeddjogov.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend `.env` | Public | Public anonymous key for client RLS queries |
| `VITE_API_BASE_URL` | Frontend `.env` | Public | Backend gateway endpoint (`https://staging.rentmaikar.com/api`) |
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

- **EMQX:** runtime credential resolution prefers an active vault-backed rotation credential when present, then falls back to `EMQX_API_KEY` / `EMQX_API_SECRET`. A missing env var alone does not prove EMQX is unavailable.
- **Google Cloud:** some Google integrations may use Application Default Credentials (ADC) rather than a static JSON key. Presence of `GOOGLE_APPLICATION_CREDENTIALS` or related vars should be interpreted according to the specific code path, not as universal proof of readiness.
- **Provider readiness:** credential presence only confirms configuration. It does not prove the provider account is active, a live transaction succeeds, or webhook verification is working.

---

## 3. Key Rotation Guidelines

1. **Immediate Revocation**: If any service role key or API secret is committed to a client repository or exposed in browser bundles, regenerate it immediately via the provider console.
2. **Zero In-Code Secrets**: No production keys may be hardcoded into TypeScript files. All secrets are read via `process.env` in backend microservices.
3. **Configuration vs readiness**: treat secret presence, runtime authentication, live request success, and webhook verification as separate checks in operational runbooks.
