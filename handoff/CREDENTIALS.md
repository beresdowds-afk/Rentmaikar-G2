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
| `PERSONA_API_KEY` | Backend | High | Persona biometric & driver KYC verification key |
| `RESEND_API_KEY` | Backend | High | Transactional email delivery service |

---

## 3. Key Rotation Guidelines

1. **Immediate Revocation**: If any service role key or API secret is committed to a client repository or exposed in browser bundles, regenerate it immediately via the provider console.
2. **Zero In-Code Secrets**: No production keys may be hardcoded into TypeScript files. All secrets are read via `process.env` in backend microservices.
