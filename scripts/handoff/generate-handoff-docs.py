import os, re, json, textwrap, datetime

ROOT = "/dev-server"
FN = os.path.join(ROOT, "supabase/functions")
OUT = os.path.join(ROOT, "docs/handoff")
os.makedirs(OUT, exist_ok=True)

PROJECT_REF = "bwvocmhcledbwqlpcswp"
FUNCTIONS_BASE = f"https://{PROJECT_REF}.supabase.co/functions/v1"
GATEWAY = "https://staging.rentmaikar.com"
TODAY = "2026-09-03"

meta = json.load(open("/tmp/handoff/functions.json"))

# ---- verify_jwt from config.toml ----
cfg = open(os.path.join(ROOT, "supabase/config.toml")).read()
verify_jwt = {}
cur = None
for line in cfg.splitlines():
    m = re.match(r"\s*\[functions\.([\w-]+)\]", line)
    if m:
        cur = m.group(1)
        continue
    m = re.match(r"\s*verify_jwt\s*=\s*(true|false)", line)
    if m and cur:
        verify_jwt[cur] = m.group(1) == "true"

CRON = {
 "process-expiry-notifications": ["daily-expiry-notifications 0 8 * * *", "process-expiry-notifications 0 8 * * *"],
 "dispatch-event-notifications": ["*/2 * * * *"],
 "email-domain-status-check": ["*/30 * * * *"],
 "enforce-call-in-geofence": ["* * * * *"],
 "expire-call-ins": ["*/5 * * * *"],
 "generate-daily-tasks": ["0 6 * * *"],
 "gps-worker-watchdog": ["*/5 * * * *"],
 "hologram-sync": ["0 * * * *"],
 "iot-auto-provision": ["0 * * * *"],
 "iot-offline-alerts": ["*/15 * * * *"],
 "iot-scheduled-sync": ["* * * * *"],
 "mqtt-ingestion-worker": ["* * * * *"],
 "persona-expiry-scan": ["0 7 * * *"],
 "persona-reconcile": ["*/15 * * * *"],
 "process-agreement-renewals": ["10 6 * * *"],
 "process-daily-debits": ["1 0 * * *"],
 "process-email-queue": ["* * * * *"],
 "process-inspection-reminders": ["0 9 1 1,4,7,10 *"],
 "process-owner-payouts": ["0 9 * * 5"],
 "process-payment-defaults": ["0 */6 * * *", "0 * * * *"],
 "process-payment-unlock": ["*/10 * * * *"],
 "process-predue-reminders": ["0 7 * * *"],
 "provider-billing-sync": ["20 2 * * *"],
 "provider-health-alerts": ["7 * * * *"],
 "reconcile-payments": ["*/15 * * * *"],
 "reprocess-email-dlq": ["*/15 * * * *"],
 "reprocess-sms-dlq": ["*/15 * * * *"],
 "sarekon-location-worker": ["* * * * *"],
 "send-booking-reminders": ["15 * * * *"],
 "send-persona-digest": ["0 8 * * *"],
 "sync-approved-vehicles": ["17 * * * *"],
 "telemetry-health-monitor": ["*/15 * * * *"],
 "training-compliance-reminders": ["0 8 * * *"],
 "vehicle-return-reminder": ["0 10 * * *"],
}

GROUPS = [
 ("Auth, Identity & Verification", ["auth-", "sync-auth", "verify-credentials", "verify-phone", "phone-otp", "send-2fa", "send-password-reset", "send-verification-email", "admin-create-user", "admin-delete-users", "admin-set-user-active", "referee", "notify-referees", "verify-referees", "proxy-consent", "generate-api-key", "export-user-documents", "refresh-export-download-url"]),
 ("Persona KYC", ["persona-"]),
 ("Payments & Payouts", ["paypal", "paystack", "opay", "capture-", "create-paypal", "create-paystack", "create-opay", "verify-opay", "verify-paystack", "initiate-paypal", "initiate-paystack", "process-daily-debits", "process-owner-payouts", "process-payment", "reconcile-", "billing-portal", "subscribe-to-plan", "activate-subscription", "get-psp-config", "get-paypal-config", "provider-billing-sync", "send-payment-notification", "send-price-notification", "send-order-notification", "send-shipping-notification"]),
 ("Messaging: SMS / WhatsApp / CPaaS", ["sent-", "termii-", "twilio-test", "twilio-webhook", "sms-", "whatsapp-", "whatchimp-", "manychat-", "send-sms-notification", "send-in-app-message", "reprocess-sms-dlq", "social-inbox-webhook", "comms-test-console", "auto-reply-simulate"]),
 ("Email", ["email-", "resend-events", "handle-email", "process-email-queue", "reprocess-email-dlq", "send-email-reply", "send-inbox-reply", "send-outbound-email", "send-transactional-email", "preview-transactional-email", "send-agreement-email", "booking-email-trigger", "inbox-attachment-ocr"]),
 ("VoIP, IVR & Call Center", ["voice-", "voip-", "initiate-voip", "end-voip", "incoming-call", "create-call-in", "check-repeat-call-ins", "expire-call-ins", "enforce-call-in-geofence", "get-recording-url", "process-call-recording", "recording-status-callback", "-ivr", "shutdown-warning-ivr", "payment-default-ivr", "expiry-notification-ivr", "vehicle-return-ivr"]),
 ("IoT, Telemetry & Tracking", ["iot-", "emqx-", "hologram-", "traccar-", "sarekon-", "telemetry-", "mqtt-", "gps-", "generate-vehicle-mqtt-token", "accident-emergency-dispatch", "vehicle-shutdown-warning"]),
 ("Notifications, Tasks & Scheduling", ["send-", "notify-", "dispatch-event-notifications", "retry-event-notifications", "generate-daily-tasks", "process-expiry-notifications", "process-inspection-reminders", "process-predue-reminders", "process-agreement-renewals", "training-compliance-reminders", "vehicle-return-reminder", "save-push-subscription", "get-vapid-public-key", "send-push-notification"]),
 ("AI & Media (ElevenLabs, Lovable AI)", ["elevenlabs-"]),
 ("Admin & Platform Operations", ["admin-", "region-autobuild", "sync-approved-vehicles", "auto-submit-for-review", "generate-inspection-pdf", "reconcile-rental-terms", "send-meta-capi"]),
]

def group_of(name):
    for g, pats in GROUPS:
        for p in pats:
            if (p.endswith("-") and name.startswith(p)) or (p.startswith("-") and name.endswith(p)) or name == p or name.startswith(p):
                return g
    return "Other / Uncategorised"

def describe(name):
    path = os.path.join(FN, name, "index.ts")
    if not os.path.exists(path):
        return ""
    lines = open(path, encoding="utf8", errors="ignore").read().splitlines()
    buf = []
    inblock = False
    for ln in lines[:60]:
        s = ln.strip()
        if s.startswith("/**") or s.startswith("/*"):
            inblock = True
            s = re.sub(r"^/\*+", "", s).strip()
            if s:
                buf.append(s)
            continue
        if inblock:
            if "*/" in s:
                s = s.replace("*/", "").lstrip("*").strip()
                if s:
                    buf.append(s)
                break
            buf.append(s.lstrip("*").strip())
            continue
        if s.startswith("//") and not s.startswith("// deno-lint"):
            buf.append(s[2:].strip())
            continue
        if s.startswith("import") or not s:
            if buf:
                break
            continue
        break
    text = " ".join(x for x in buf if x).strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) > 320:
        text = text[:317].rsplit(" ", 1)[0] + "..."
    return text

def auth_label(name, m):
    vj = verify_jwt.get(name)
    parts = []
    if vj is False:
        parts.append("public edge (verify_jwt=false)")
    elif vj is True:
        parts.append("platform JWT enforced")
    else:
        parts.append("platform default")
    if "provider-signature" in m["auth"]:
        parts.append("provider signature")
    if "cron-token" in m["auth"]:
        parts.append("cron token")
    if "jwt" in m["auth"]:
        parts.append("in-code JWT check")
    if "service-role" in m["auth"]:
        parts.append("service-role DB access")
    return "; ".join(parts)

# ---------------- Credentials catalogue ----------------
# name -> (provider, purpose, obtain/rotate location, sensitivity, cadence)
CRED = {
 "SUPABASE_URL": ("Supabase", "Project API base URL", "Platform-injected", "Low", "N/A (rotates with project)"),
 "SUPABASE_ANON_KEY": ("Supabase", "Publishable client key", "Platform-injected", "Low (publishable)", "On project key rotation"),
 "SUPABASE_SERVICE_ROLE_KEY": ("Supabase", "Full DB bypass key for server code", "Platform-injected; not retrievable on Lovable Cloud", "Critical", "Immediately on suspected exposure"),
 "CRON_SECRET": ("Rentmaikar internal", "Shared token authorising pg_cron -> edge worker calls", "Self-issued random 32+ chars", "High", "Quarterly"),
 "PROVIDER_SESSION_KEY": ("Rentmaikar internal", "Signs provider session/state blobs", "Self-issued random", "High", "Quarterly"),
 "PUBLIC_APP_URL": ("Rentmaikar", "Canonical frontend URL used in links", "Config value", "Low", "N/A"),
 "PUBLIC_BACKEND_URL": ("Rentmaikar", "Canonical backend/API URL", "Config value", "Low", "N/A"),
 "APP_URL": ("Rentmaikar", "Legacy alias of PUBLIC_APP_URL", "Config value", "Low", "N/A"),
 "SITE_URL": ("Rentmaikar", "Auth redirect base", "Config value", "Low", "N/A"),
 "ALLOWED_ORIGINS": ("Rentmaikar", "CORS allowlist for the gateway", "Config value", "Low", "N/A"),
 "PORT": ("Rentmaikar", "Gateway listen port", "Config value", "Low", "N/A"),
 "NODE_ENV": ("Rentmaikar", "Gateway runtime mode", "Config value", "Low", "N/A"),
 "SENT_API_KEY": ("Sent.dm", "Primary global SMS/WhatsApp/RCS API key (x-api-key header)", "Sent.dm dashboard > API keys", "Critical", "Quarterly / on staff change"),
 "SENT_SENDER_ID": ("Sent.dm", "Approved alphanumeric sender ID (RENTMAIKAR)", "Sent.dm sender registration", "Low", "N/A"),
 "SENT_WHATSAPP_NUMBER": ("Sent.dm", "WhatsApp business sender", "Sent.dm dashboard", "Low", "N/A"),
 "SENT_SMS_NUMBER": ("Sent.dm", "Numeric US 10DLC SMS sender", "Sent.dm dashboard", "Low", "N/A"),
 "SENT_API_BASE_URL": ("Sent.dm", "API base override (staging only)", "Config value", "Low", "N/A"),
 "SENT_SANDBOX_MODE": ("Sent.dm", "Routes traffic to sandbox when true", "Config value", "Low", "N/A"),
 "SENT_ENABLED": ("Sent.dm", "Master switch for Sent as primary CPaaS", "Config value", "Low", "N/A"),
 "SENT_CHANNELS": ("Sent.dm", "Channels Sent may serve", "Config value", "Low", "N/A"),
 "SENT_WEBHOOK_SECRET": ("Sent.dm", "HMAC secret verifying inbound/status callbacks", "Shared value; set in Sent dashboard and here", "High", "Semi-annual; rotate before endpoint cutover"),
 "SENT_WEBHOOK_URL": ("Sent.dm", "Inbound callback URL", "Config value", "Low", "On domain change"),
 "SENT_STATUS_WEBHOOK_URL": ("Sent.dm", "Delivery-status callback URL", "Config value", "Low", "On domain change"),
 "TERMII_API_KEY": ("Termii", "Nigeria SMS/OTP fallback key", "Termii dashboard > API", "Critical", "Quarterly"),
 "TERMII_SENDER_ID": ("Termii", "Approved NG sender ID", "Termii dashboard", "Low", "N/A"),
 "TERMII_WEBHOOK_SECRET": ("Termii", "Verifies Termii delivery callbacks", "Shared value set in both places", "High", "Semi-annual"),
 "TWILIO_ACCOUNT_SID": ("Twilio", "Account identifier (voice only)", "Twilio console", "Medium", "N/A"),
 "TWILIO_AUTH_TOKEN": ("Twilio", "Legacy account token (API key preferred)", "Twilio console > Auth tokens", "Critical", "Quarterly"),
 "TWILIO_API_KEY_SID": ("Twilio", "API key SID used for REST auth", "Twilio console > API keys", "High", "Quarterly"),
 "TWILIO_API_KEY_SECRET": ("Twilio", "API key secret", "Twilio console > API keys (shown once)", "Critical", "Quarterly"),
 "TWILIO_API_KEY": ("Twilio", "Alias accepted for API key SID", "Twilio console", "High", "Quarterly"),
 "TWILIO_API_SECRET": ("Twilio", "Alias accepted for API key secret", "Twilio console", "Critical", "Quarterly"),
 "TWILIO_PHONE_NUMBER": ("Twilio", "Primary US voice number", "Twilio console > Phone numbers", "Low", "N/A"),
 "TWILIO_PHONE_NUMBER_NG": ("Twilio", "Optional NG long code", "Twilio console", "Low", "N/A"),
 "TWILIO_VOICE_FROM": ("Twilio", "Outbound voice caller ID override", "Config value", "Low", "N/A"),
 "TWILIO_FROM": ("Twilio", "Legacy from-number alias", "Config value", "Low", "N/A"),
 "TWILIO_WHATSAPP_NUMBER": ("Twilio", "Legacy WhatsApp sender (disabled)", "Twilio console", "Low", "N/A"),
 "TWILIO_WHATSAPP_FROM": ("Twilio", "Legacy WhatsApp from alias (disabled)", "Config value", "Low", "N/A"),
 "TWILIO_MESSAGING_SERVICE_SID": ("Twilio", "Messaging service (not approved; kept disabled)", "Twilio console", "Low", "N/A"),
 "TWILIO_MS_USA": ("Twilio", "Per-region messaging service override", "Twilio console", "Low", "N/A"),
 "TWILIO_MS_NG": ("Twilio", "Per-region messaging service override", "Twilio console", "Low", "N/A"),
 "TWILIO_TWIML_APP_SID": ("Twilio", "TwiML app backing the browser softphone", "Twilio console > TwiML apps", "Medium", "N/A"),
 "TWILIO_CUSTOMER_PROFILE_SID": ("Twilio", "Trust Hub customer profile", "Twilio console > Trust Hub", "Low", "N/A"),
 "RESEND_API_KEY": ("Resend", "Outbound transactional email key", "Resend dashboard > API keys", "Critical", "Quarterly"),
 "RESEND_WEBHOOK_SECRET": ("Resend", "Verifies delivery/bounce/spam webhooks", "Resend dashboard > Webhooks", "High", "Semi-annual"),
 "RESEND_FALLBACK_FROM": ("Resend", "Fallback sender address", "Config value", "Low", "N/A"),
 "RESEND_SENDING_DOMAIN": ("Resend", "Verified sending domain (notify.rentmaikar.com)", "Resend dashboard > Domains", "Low", "N/A"),
 "PAYPAL_CLIENT_ID": ("PayPal", "REST app client ID", "PayPal developer dashboard", "Medium", "Annual"),
 "PAYPAL_CLIENT_SECRET": ("PayPal", "REST app secret", "PayPal developer dashboard", "Critical", "Quarterly"),
 "PAYPAL_MODE": ("PayPal", "sandbox | live", "Config value", "Low", "N/A"),
 "PAYPAL_ENV": ("PayPal", "Alias of PAYPAL_MODE", "Config value", "Low", "N/A"),
 "PAYPAL_WEBHOOK_ID": ("PayPal", "Webhook ID used to verify IPN signatures", "PayPal developer dashboard > Webhooks", "High", "On webhook re-creation"),
 "PAYSTACK_SECRET_KEY": ("Paystack", "NGN charges, transfers and webhook signing", "Paystack dashboard > API keys", "Critical", "Quarterly"),
 "PAYSTACK_PUBLIC_KEY": ("Paystack", "Publishable checkout key", "Paystack dashboard", "Low (publishable)", "With secret rotation"),
 "OPAY_MERCHANT_ID": ("OPay", "Merchant identifier", "OPay merchant portal", "Medium", "N/A"),
 "OPAY_PUBLIC_KEY": ("OPay", "Publishable key", "OPay merchant portal", "Low", "Annual"),
 "OPAY_SECRET_KEY": ("OPay", "Signs charge and payout requests", "OPay merchant portal", "Critical", "Quarterly"),
 "OPAY_ENVIRONMENT": ("OPay", "sandbox | live", "Config value / admin panel", "Low", "N/A"),
 "OPAY_ENV": ("OPay", "Alias of OPAY_ENVIRONMENT", "Config value", "Low", "N/A"),
 "PERSONA_API_KEY": ("Persona", "KYC inquiry creation and reconciliation", "Persona dashboard > API keys", "Critical", "Quarterly"),
 "PERSONA_ENVIRONMENT_ID": ("Persona", "Environment scope", "Persona dashboard", "Low", "N/A"),
 "PERSONA_MASTER_TEMPLATE_ID": ("Persona", "Default inquiry template", "Persona dashboard", "Low", "N/A"),
 "PERSONA_TEMPLATE_ID": ("Persona", "Generic template fallback", "Persona dashboard", "Low", "N/A"),
 "PERSONA_TEMPLATE_ID_US": ("Persona", "US template (DB rules override)", "Persona dashboard", "Low", "N/A"),
 "PERSONA_TEMPLATE_ID_NG": ("Persona", "NG template (DB rules override)", "Persona dashboard", "Low", "N/A"),
 "PERSONA_WEBHOOK_SECRET": ("Persona", "Verifies Persona webhooks", "Persona dashboard > Webhooks", "High", "Semi-annual"),
 "HOLOGRAM_API_KEY": ("Hologram", "SIM/cellular management", "Hologram dashboard > API", "High", "Quarterly"),
 "HOLOGRAM_ORG_ID": ("Hologram", "Organisation scope", "Hologram dashboard", "Low", "N/A"),
 "TRACCAR_BASE_URL": ("Traccar", "GPS server base URL", "Self-hosted config", "Low", "N/A"),
 "TRACCAR_API_TOKEN": ("Traccar", "Primary API auth", "Traccar admin > Tokens", "High", "Quarterly"),
 "TRACCAR_TOKEN": ("Traccar", "Alias of TRACCAR_API_TOKEN", "Traccar admin", "High", "Quarterly"),
 "TRACCAR_EMAIL": ("Traccar", "Basic-auth fallback user", "Traccar admin", "Medium", "Annual"),
 "TRACCAR_PASSWORD": ("Traccar", "Basic-auth fallback password", "Traccar admin", "Critical", "Quarterly"),
 "SAREKON_USER_ID": ("GPSANDTRACK (Sarekon)", "Telemetry account user", "Provider portal", "Medium", "Annual"),
 "SAREKON_USERNAME": ("GPSANDTRACK (Sarekon)", "Alias of SAREKON_USER_ID", "Provider portal", "Medium", "Annual"),
 "SAREKON_PASSWORD": ("GPSANDTRACK (Sarekon)", "Telemetry account password", "Provider portal", "Critical", "Quarterly"),
 "SAREKON_BASE_URL": ("GPSANDTRACK (Sarekon)", "API base override", "Config value", "Low", "N/A"),
 "EMQX_API_URL": ("EMQX", "MQTT broker management API", "EMQX dashboard", "Low", "N/A"),
 "EMQX_API_KEY": ("EMQX", "Management API key", "EMQX dashboard > API keys", "High", "Quarterly"),
 "EMQX_API_SECRET": ("EMQX", "Management API secret", "EMQX dashboard > API keys", "Critical", "Quarterly"),
 "EMQX_MQTT_HOST": ("EMQX", "Broker host (admin-configurable)", "Config value / admin panel", "Low", "N/A"),
 "EMQX_MQTT_PORT": ("EMQX", "Broker port", "Config value / admin panel", "Low", "N/A"),
 "MQTT_JWT_SECRET": ("EMQX", "Signs per-vehicle MQTT access tokens", "Self-issued random", "Critical", "Quarterly"),
 "ELEVEN_LABS_API_KEY": ("ElevenLabs", "TTS/STT and accent conversion", "ElevenLabs dashboard > API keys", "High", "Quarterly"),
 "ELEVENLABS_API_KEY": ("ElevenLabs", "Alias accepted by code", "ElevenLabs dashboard", "High", "Quarterly"),
 "ELEVENLABS_AGENT_ID": ("ElevenLabs", "Conversational agent identifier", "ElevenLabs dashboard > Agents", "Low", "N/A"),
 "LOVABLE_SEND_URL": ("Lovable AI Gateway", "Optional override for the Lovable send endpoint (defaults to https://api.lovable.dev)", "Config value", "Low", "N/A"),
 "LOVABLE_API_KEY": ("Lovable AI Gateway", "Server-side AI completions", "Platform-managed; rotate via platform", "High", "Platform-managed"),
 "VAPID_PUBLIC_KEY": ("Web Push", "Public application server key", "Self-issued VAPID pair", "Low (public)", "Only with private key"),
 "VAPID_PRIVATE_KEY": ("Web Push", "Signs push payloads", "Self-issued VAPID pair", "Critical", "Annual (invalidates subscriptions)"),
 "VAPID_SUBJECT": ("Web Push", "mailto: contact for push", "Config value", "Low", "N/A"),
 "FCM_SERVER_KEY": ("Firebase", "Native Android push", "Firebase console > Cloud Messaging", "High", "Annual"),
 "META_PIXEL_ID": ("Meta", "Conversions API pixel", "Meta Events Manager", "Low", "N/A"),
 "META_CAPI_ACCESS_TOKEN": ("Meta", "Conversions API token", "Meta Events Manager", "High", "Annual"),
 "META_TEST_EVENT_CODE": ("Meta", "CAPI debugging only", "Meta Events Manager", "Low", "N/A"),
 "META_WEBHOOK_VERIFY_TOKEN": ("Meta", "Webhook subscription handshake", "Self-issued; entered in Meta", "Medium", "Annual"),
 "WA_VERIFY_TOKEN": ("WhatsApp Cloud", "Webhook verification token", "Self-issued; entered in Meta", "Medium", "Annual"),
 "WHATCHIMP_API_KEY": ("WhatChimp", "Optional WhatsApp route", "WhatChimp dashboard", "High", "Quarterly if enabled"),
 "WHATCHIMP_API_BASE": ("WhatChimp", "API base", "Config value", "Low", "N/A"),
 "WHATCHIMP_PHONE_NUMBER_ID": ("WhatChimp", "Sender identifier", "WhatChimp dashboard", "Low", "N/A"),
 "WHATCHIMP_VERIFY_TOKEN": ("WhatChimp", "Webhook handshake", "Self-issued", "Medium", "Annual"),
 "WHATCHIMP_WEBHOOK_SECRET": ("WhatChimp", "Webhook HMAC", "Shared value", "High", "Semi-annual"),
 "MANYCHAT_API_TOKEN": ("ManyChat", "Optional automation route", "ManyChat dashboard", "High", "Quarterly if enabled"),
 "MANYCHAT_WEBHOOK_SECRET": ("ManyChat", "Webhook HMAC", "Shared value", "High", "Semi-annual"),
 "SB_FUNCTION_NAME": ("Supabase", "Runtime-injected function name", "Platform-injected", "Low", "N/A"),
 "VITE_SUPABASE_URL": ("Supabase", "Client build-time URL (frontend)", "Platform-injected", "Low", "N/A"),
 "VITE_SUPABASE_PUBLISHABLE_KEY": ("Supabase", "Client publishable key (frontend)", "Platform-injected", "Low (publishable)", "With key rotation"),
 "EMAIL_E2E_RECIPIENT": ("Rentmaikar internal", "Test-only email recipient", "Config value (non-production)", "Low", "N/A"),
 "TEST_ADMIN_JWT": ("Rentmaikar internal", "Test-only admin token", "Test fixture (never in production)", "High", "Per test run"),
 "TEST_USER_A_ID": ("Rentmaikar internal", "Test fixture user id", "Test fixture", "Low", "N/A"),
 "TEST_USER_B_ID": ("Rentmaikar internal", "Test fixture user id", "Test fixture", "Low", "N/A"),
}

PROVIDER_ORDER = ["Supabase", "Rentmaikar internal", "Rentmaikar", "Sent.dm", "Termii", "Twilio", "Resend",
                  "PayPal", "Paystack", "OPay", "Persona", "Hologram", "Traccar", "GPSANDTRACK (Sarekon)",
                  "EMQX", "ElevenLabs", "Lovable AI Gateway", "Web Push", "Firebase", "Meta",
                  "WhatsApp Cloud", "WhatChimp", "ManyChat"]

deno_env = [l.strip() for l in open("/tmp/handoff/deno-env.txt") if l.strip()]
node_env = [l.strip() for l in open("/tmp/handoff/node-env.txt") if l.strip()]
all_env = sorted(set(deno_env) | set(node_env) | {"MQTT_JWT_SECRET", "SENT_STATUS_WEBHOOK_URL", "SENT_ENABLED", "ALLOWED_ORIGINS"})

consumers = {}
for name, m in meta.items():
    for e in m["env"]:
        consumers.setdefault(e, []).append(name)
for e in node_env:
    consumers.setdefault(e, []).append("gateway")

# ---------------- API-CONTRACT.md ----------------
grouped = {}
for name in sorted(meta):
    grouped.setdefault(group_of(name), []).append(name)

lines = []
w = lines.append
w("# Rentmaikar API Contract")
w("")
w(f"Generated {TODAY}. Authoritative description of every server-side endpoint the backend team takes ownership of: the Express API gateway and all {len(meta)} Supabase Edge Functions.")
w("")
w("## 1. Hosts")
w("")
w("| Role | Host |")
w("| --- | --- |")
w(f"| Frontend (browser app) | `https://rentmaikar.com`, `https://www.rentmaikar.com` |")
w(f"| Backend API gateway | `{GATEWAY}` |")
w(f"| Edge function base | `{FUNCTIONS_BASE}` |")
w("| Inbound mail domain | `backend.rentmaikar.com` |")
w("| Outbound mail domain | `notify.rentmaikar.com` |")
w("")
w("## 2. Authentication modes")
w("")
w("| Mode | Transport | Used by |")
w("| --- | --- | --- |")
w("| Supabase user JWT | `Authorization: Bearer <access_token>` | All user-facing endpoints; validated in-code because platform `verify_jwt` is disabled for most functions |")
w("| Service role | `SUPABASE_SERVICE_ROLE_KEY` (server-only) | Functions that bypass RLS for admin/system writes |")
w("| Cron token | `CRON_SECRET` in header/body, checked via `verify_cron_token` | pg_cron-triggered workers |")
w("| Provider signature | Provider-specific HMAC header (Sent, Resend, Termii, Persona, Paystack, PayPal, OPay, Twilio) | Inbound webhooks; raw body required |")
w("| Public | none | Config probes (`get-psp-config`, `get-vapid-public-key`), tracking pixels, IVR TwiML |")
w("")
w("Every function answers `OPTIONS` with shared CORS headers and accepts `POST` with a JSON body unless noted.")
w("")
w("## 3. API gateway (Express)")
w("")
w("| Method | Path | Auth | Purpose |")
w("| --- | --- | --- | --- |")
w("| GET | `/api/health` | public | Liveness: status, service, version, uptime, environment |")
w("| GET | `/api/health/diagnostics` | public | Configured-provider matrix (CPaaS, payments, IoT) and domain topology; booleans only, never values |")
w("| GET | `/api/domains` | public | Active domain topology (frontend, backend, inbound/outbound mail) |")
w("| POST | `/api/cpaas/send` | JWT | Send an SMS/WhatsApp/RCS message via Sent.dm with Twilio/Termii fallback |")
w("| POST | `/api/webhooks/sent` | Sent HMAC | Inbound Sent.dm messages |")
w("| POST | `/api/webhooks/sent/status` | Sent HMAC | Sent.dm delivery-status callbacks |")
w("| POST | `/api/webhooks/twilio` | Twilio signature | Twilio voice/status callbacks |")
w("| POST | `/api/webhooks/termii` | Termii secret | Termii delivery callbacks |")
w("")
w("Webhook routes are mounted before `express.json()` and receive the raw body so signatures verify correctly. CORS is restricted to `ALLOWED_ORIGINS` (defaults to the two frontend origins).")
w("")
w("## 4. Edge functions")
w("")
w("Invoke as `POST {base}/{function-name}` where base is the edge function base above, or via `supabase.functions.invoke()` from the frontend. `Secrets read` lists the environment variables each function requires at runtime.")
w("")
for g, _ in GROUPS + [("Other / Uncategorised", [])]:
    names = grouped.get(g)
    if not names:
        continue
    w(f"### {g}")
    w("")
    for n in names:
        m = meta[n]
        w(f"#### `{n}`")
        w("")
        d = describe(n)
        if d:
            w(d)
            w("")
        w(f"- Endpoint: `POST {FUNCTIONS_BASE}/{n}`" + (f" (also handles {', '.join(x for x in m['methods'] if x != 'POST')})" if [x for x in m['methods'] if x not in ("POST", "OPTIONS")] else ""))
        w(f"- Auth: {auth_label(n, m)}")
        if n in CRON:
            w(f"- Schedule: pg_cron `{'`, `'.join(CRON[n])}`")
        w(f"- Secrets read: {', '.join('`%s`' % e for e in m['env']) if m['env'] else 'none'}")
        if m["shared"]:
            w(f"- Shared modules: {', '.join('`_shared/%s.ts`' % s for s in m['shared'])}")
        w("")
    w("")

w("## 5. Scheduled workers (pg_cron)")
w("")
w("| Schedule (UTC) | Function |")
w("| --- | --- |")
for n in sorted(CRON):
    for s in CRON[n]:
        w(f"| `{s.split(' ',1)[-1] if s.startswith(n) else s}` | `{n}` |")
w("")
w("All cron jobs call the function URL with the `CRON_SECRET` token. `purge-elevenlabs-test-logs` (03:15 daily) runs pure SQL and calls no function.")
w("")
w("## 6. Frontend integration seam")
w("")
w("The frontend calls the gateway only through `src/lib/backend-client.ts` (`backendRequest`, `backendGet`, `backendPost`) which attaches the Supabase bearer token, enforces a 20s timeout and normalises `{ data, error }`. Edge functions are called through `supabase.functions.invoke()`. Repointing the frontend at a new backend requires changing `VITE_API_BASE_URL` only.")
w("")
open(os.path.join(OUT, "API-CONTRACT.md"), "w").write("\n".join(lines) + "\n")

# ---------------- backend.env.template ----------------
by_provider = {}
for e in all_env:
    prov = CRED.get(e, ("Unclassified",))[0]
    by_provider.setdefault(prov, []).append(e)

t = []
t.append("# Rentmaikar backend environment template")
t.append(f"# Generated {TODAY} by scanning Deno.env.get() across supabase/functions/** and process.env.* across backend/src/**.")
t.append("# Values are intentionally empty. Never commit populated copies of this file.")
t.append("# SUPABASE_* values are injected by the platform and cannot be set manually on Lovable Cloud.")
t.append("")
for prov in PROVIDER_ORDER + [p for p in sorted(by_provider) if p not in PROVIDER_ORDER]:
    names = by_provider.get(prov)
    if not names:
        continue
    t.append(f"# ── {prov} ──────────────────────────────────────────────")
    for e in sorted(names):
        c = CRED.get(e)
        cons = consumers.get(e, [])
        note = c[1] if c else "purpose unclassified — confirm before use"
        cnt = f"{len(cons)} consumer{'s' if len(cons) != 1 else ''}" if cons else "no runtime consumer found"
        t.append(f"# {note} ({cnt})")
        t.append(f"{e}=")
    t.append("")
open(os.path.join(OUT, "backend.env.template"), "w").write("\n".join(t) + "\n")

# ---------------- CREDENTIALS.md ----------------
c = []
a = c.append
a("# Rentmaikar Credentials Inventory & Rotation Plan")
a("")
a(f"Generated {TODAY}. **No secret values appear in this document.** It lists what exists, who owns it, where the backend team obtains or rotates it, and in what order to hand it over.")
a("")
a(f"Total distinct server-side environment variables in use: **{len(all_env)}**.")
a("")
a("## 1. Inventory")
a("")
for prov in PROVIDER_ORDER + [p for p in sorted(by_provider) if p not in PROVIDER_ORDER]:
    names = by_provider.get(prov)
    if not names:
        continue
    a(f"### {prov}")
    a("")
    a("| Variable | Purpose | Obtain / rotate at | Sensitivity | Cadence | Consumers |")
    a("| --- | --- | --- | --- | --- | --- |")
    for e in sorted(names):
        cr = CRED.get(e, (prov, "unclassified — confirm before use", "unknown", "Treat as High", "Confirm"))
        cons = consumers.get(e, [])
        cs = str(len(cons)) if cons else "0"
        a(f"| `{e}` | {cr[1]} | {cr[2]} | {cr[3]} | {cr[4]} | {cs} |")
    a("")
a("Consumer counts are the number of edge functions (plus `gateway`) that read the variable; the per-function list is in `API-CONTRACT.md`.")
a("")
a("## 2. Ownership handover")
a("")
a("Provider consoles that must change ownership or gain a backend-team member with admin rights, in priority order:")
a("")
a("1. **Supabase / Lovable Cloud** — database, edge function secrets, auth. Service role key is platform-managed and not retrievable; the backend team must operate through the platform.")
a("2. **Sent.dm** — primary SMS/WhatsApp. Highest traffic impact if mishandled.")
a("3. **Resend** — all outbound email; also owns DNS verification for `notify.rentmaikar.com`.")
a("4. **Twilio** — voice only (messaging deliberately disabled via `TWILIO_MESSAGING_ENABLED=false`).")
a("5. **Paystack, PayPal, OPay** — money movement; require finance sign-off before key rotation.")
a("6. **Persona** — KYC; rotation invalidates in-flight inquiries, so drain first.")
a("7. **Termii, Hologram, Traccar, GPSANDTRACK, EMQX, ElevenLabs, Meta, Firebase** — secondary providers.")
a("")
a("## 3. Rotation order (zero-drop sequence)")
a("")
a("Rotate in this order so no inbound callback is rejected and no outbound send fails mid-flight:")
a("")
a("| Step | Action | Why this order |")
a("| --- | --- | --- |")
a("| 1 | Rotate internal self-issued secrets: `CRON_SECRET`, `PROVIDER_SESSION_KEY`, `MQTT_JWT_SECRET` | No external party holds them; safe to change any time. MQTT token rotation forces device re-auth — do it in a maintenance window. |")
a("| 2 | Register new webhook secrets **alongside** the old ones where the provider supports dual secrets (Resend, Persona) | Callbacks keep verifying during the switch. |")
a("| 3 | Update webhook URLs at each provider to the new backend host, keeping the old host live | Traffic drains gradually. |")
a("| 4 | Rotate single-secret webhook credentials (`SENT_WEBHOOK_SECRET`, `TERMII_WEBHOOK_SECRET`, `WHATCHIMP_WEBHOOK_SECRET`, `MANYCHAT_WEBHOOK_SECRET`) | Brief verification gap; do in a low-traffic window (before 08:00 WAT / after 21:00 ET). |")
a("| 5 | Rotate outbound messaging keys (`SENT_API_KEY`, `TERMII_API_KEY`, `RESEND_API_KEY`) | Only affects new sends; queued items retry. |")
a("| 6 | Rotate Twilio API key pair (`TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`), then delete the old key | Active calls are unaffected; new REST calls use the new pair. |")
a("| 7 | Rotate payment secrets (`PAYSTACK_SECRET_KEY`, `PAYPAL_CLIENT_SECRET`, `OPAY_SECRET_KEY`) | Requires finance sign-off and a pause on payout cron jobs; verify webhook signing still validates afterwards. |")
a("| 8 | Rotate KYC and IoT credentials (Persona, Hologram, Traccar, Sarekon, EMQX) | Drain in-flight Persona inquiries first; IoT devices reconnect automatically. |")
a("| 9 | Rotate `VAPID_PRIVATE_KEY` only if compromised | Rotation invalidates every existing web-push subscription and forces re-subscribe. |")
a("")
a("## 4. Verification after each rotation")
a("")
a("| Provider | Verification |")
a("| --- | --- |")
a("| Sent.dm | `GET {base}/sent-health` returns `whatsapp_ready: true`; send a live test from Admin → Messaging and confirm queued → delivered on `/admin/sms-delivery` |")
a("| Resend | Trigger a transactional email; confirm delivery on `/admin/email-delivery` and that a `resend-events` webhook lands |")
a("| Twilio | Place an inbound test call; confirm it appears in the Call Center queue with ringing status |")
a("| Paystack / PayPal / OPay | `get-psp-config` reports `configured: true` for each; run a sandbox charge and confirm the webhook verifies |")
a("| Persona | Create a test inquiry and confirm `persona-webhook` signature verification passes |")
a("| Hologram / Traccar / Sarekon / EMQX | Admin → Provider Health shows all green; telemetry continues arriving within one cron interval |")
a("| Cron token | Confirm `process-email-queue` and `dispatch-event-notifications` keep logging runs after `CRON_SECRET` changes |")
a("")
a("## 5. Rules")
a("")
a("- Secret values are never written to the repository, this document, or `.env` files in version control. They live in the platform secret store and are injected at runtime.")
a("- `SUPABASE_SERVICE_ROLE_KEY` and the database password are not retrievable on Lovable Cloud. Do not attempt to export them.")
a("- Publishable keys (`PAYSTACK_PUBLIC_KEY`, `OPAY_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, Supabase anon/publishable) are safe in client code.")
a("- Test-only variables (`TEST_ADMIN_JWT`, `TEST_USER_A_ID`, `TEST_USER_B_ID`, `EMAIL_E2E_RECIPIENT`) must never be set in production.")
a("- Twilio is approved for **voice only**. `TWILIO_MESSAGING_ENABLED` must remain `false` until A2P messaging approval is granted.")
a("")
open(os.path.join(OUT, "CREDENTIALS.md"), "w").write("\n".join(c) + "\n")

# ---------------- CUTOVER.md ----------------
k = []
b = k.append
b("# Rentmaikar Backend Cutover Notes")
b("")
b(f"Generated {TODAY}.")
b("")
b("## 1. Domain topology")
b("")
b("| Role | Domain | Notes |")
b("| --- | --- | --- |")
b("| Frontend | `rentmaikar.com` (alias `www.rentmaikar.com`) | React SPA; only consumer of the backend API |")
b("| Backend API | `staging.rentmaikar.com` | Express gateway; canonical `PUBLIC_BACKEND_URL` |")
b("| Inbound mail | `backend.rentmaikar.com` | `support@`, `payments@`, `documents@`, `admin@`, `legal@` route to queues |")
b("| Outbound mail | `notify.rentmaikar.com` | Verified Resend sending domain |")
b("")
b("## 2. Webhook endpoints to repoint")
b("")
b("| Provider | Current endpoint | Console location |")
b("| --- | --- | --- |")
b(f"| Sent.dm (inbound) | `{GATEWAY}/api/webhooks/sent` | Sent dashboard → Webhooks |")
b(f"| Sent.dm (status) | `{GATEWAY}/api/webhooks/sent/status` | Sent dashboard → Webhooks |")
b(f"| Twilio voice | `{GATEWAY}/api/webhooks/twilio` and `{FUNCTIONS_BASE}/incoming-call-forward` | Twilio console → Phone numbers |")
b(f"| Termii | `{GATEWAY}/api/webhooks/termii` | Termii dashboard |")
b(f"| Resend events | `{FUNCTIONS_BASE}/resend-events` | Resend dashboard → Webhooks |")
b(f"| Inbound email | `{FUNCTIONS_BASE}/email-webhook` | Mail routing for `backend.rentmaikar.com` |")
b(f"| Paystack | `{FUNCTIONS_BASE}/paystack-webhook` | Paystack dashboard → Webhooks |")
b(f"| PayPal | `{FUNCTIONS_BASE}/paypal-webhook` | PayPal developer → Webhooks |")
b(f"| OPay | `{FUNCTIONS_BASE}/opay-webhook` | OPay merchant portal |")
b(f"| Persona | `{FUNCTIONS_BASE}/persona-webhook` | Persona dashboard → Webhooks |")
b(f"| Twilio call status | `{FUNCTIONS_BASE}/voip-status-callback`, `{FUNCTIONS_BASE}/recording-status-callback` | Twilio console |")
b("")
b("## 3. Cutover sequence")
b("")
b("1. Stand up the new backend host and confirm `/api/health` and `/api/domains` respond.")
b("2. Load the environment from `backend.env.template` with values transferred out-of-band.")
b("3. Point `VITE_API_BASE_URL` in the frontend at the new host (single change; see `src/lib/api-config.ts`).")
b("4. Repoint webhooks provider by provider, keeping the old host live until each provider is confirmed.")
b("5. Move pg_cron jobs last — they are the only unattended callers and must carry the current `CRON_SECRET`.")
b("6. Decommission the old host only after 24 hours with zero traffic on it.")
b("")
b("## 4. Post-cutover smoke checklist")
b("")
b("- [ ] `GET /api/health` returns `status: healthy`")
b("- [ ] `GET /api/health/diagnostics` shows every expected provider as configured")
b("- [ ] Frontend loads and an authenticated request reaches the backend with a valid bearer token")
b("- [ ] Outbound SMS sends and reaches `delivered` on `/admin/sms-delivery`")
b("- [ ] Outbound WhatsApp sends and reaches `delivered`")
b("- [ ] Transactional email sends from `notify.rentmaikar.com` and a delivery webhook lands")
b("- [ ] Inbound email to `support@backend.rentmaikar.com` reaches the inbox")
b("- [ ] Inbound voice call rings the Call Center queue")
b("- [ ] Browser softphone connects with microphone and speaker working")
b("- [ ] A sandbox payment completes and its webhook verifies")
b("- [ ] Persona inquiry creation succeeds")
b("- [ ] Telemetry continues arriving; Provider Health is green")
b("- [ ] Every pg_cron job logs a successful run within its interval")
b("")
b("## 5. Reference documents")
b("")
b("- `API-CONTRACT.md` — every endpoint, its auth mode and the secrets it reads")
b("- `openapi.yaml` — machine-readable spec of the same surface")
b("- `backend.env.template` — empty env skeleton")
b("- `CREDENTIALS.md` — credential inventory and rotation plan")
b("")
open(os.path.join(OUT, "CUTOVER.md"), "w").write("\n".join(k) + "\n")

print("docs written", len(meta))
