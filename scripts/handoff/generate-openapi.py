import os, json, re, yaml, importlib.util, sys

spec_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "generate-handoff-docs.py")).read()

ROOT = "/dev-server"
OUT = os.path.join(ROOT, "docs/handoff")
PROJECT_REF = "bwvocmhcledbwqlpcswp"
FUNCTIONS_BASE = f"https://{PROJECT_REF}.supabase.co/functions/v1"
GATEWAY = "https://staging.rentmaikar.com"

meta = json.load(open("/tmp/handoff/functions.json"))

# reuse grouping + describe from gen.py by exec'ing it in a sandbox namespace
ns = {}
exec(compile(spec_src.split("# ---------------- API-CONTRACT.md ----------------")[0], "gen", "exec"), ns)
group_of = ns["group_of"]
describe = ns["describe"]
auth_label = ns["auth_label"]
CRON = ns["CRON"]
verify_jwt = ns["verify_jwt"]

def sec_for(name, m):
    s = []
    if "provider-signature" in m["auth"]:
        s.append({"providerSignature": []})
    if "cron-token" in m["auth"]:
        s.append({"cronToken": []})
    s.append({"supabaseJwt": []})
    return s

TAG_DESC = {
    "Gateway": "Express API gateway routes served from the backend host.",
    "Webhooks": "Provider callbacks verified by HMAC signature over the raw body.",
    "Auth, Identity & Verification": "Sign-in, phone/email verification, referees, API keys and user administration.",
    "Persona KYC": "Persona identity-verification inquiries, templates, reconciliation and expiry scans.",
    "Payments & Payouts": "PayPal, Paystack and OPay charges, payouts, subscriptions and reconciliation.",
    "Messaging: SMS / WhatsApp / CPaaS": "Sent.dm-first SMS/WhatsApp dispatch with Twilio and Termii fallbacks, inbound handling and DLQ replay.",
    "Email": "Resend delivery, queue processing, inbound routing, suppression and unsubscribe handling.",
    "VoIP, IVR & Call Center": "Twilio voice sessions, browser softphone tokens, IVR flows, recordings and call queue.",
    "IoT, Telemetry & Tracking": "Hologram SIMs, Traccar/GPSANDTRACK GPS, EMQX MQTT ingestion and provisioning workers.",
    "Notifications, Tasks & Scheduling": "Event fan-out, push notifications, reminders and generated admin tasks.",
    "AI & Media (ElevenLabs, Lovable AI)": "Text-to-speech, speech-to-text, voice listings and agent tokens.",
    "Admin & Platform Operations": "Region build-out, vehicle sync, document generation and internal reconciliation.",
    "Other / Uncategorised": "Endpoints not yet assigned to a domain group.",
}

paths = {}

def gw(path, method, summary, desc, security, tag):
    paths.setdefault(path, {})[method] = {
        "tags": [tag],
        "operationId": re.sub(r"[^a-zA-Z0-9]+", "_", method + path).strip("_"),
        "summary": summary,
        "description": desc,
        "security": security,
        "responses": {
            "200": {"description": "Success", "content": {"application/json": {"schema": {"type": "object"}}}},
            "400": {"$ref": "#/components/responses/BadRequest"},
            "401": {"$ref": "#/components/responses/Unauthorized"},
            "500": {"$ref": "#/components/responses/ServerError"},
        },
    }

gw("/api/health", "get", "Gateway liveness", "Status, service name, version, uptime and environment.", [], "Gateway")
gw("/api/health/diagnostics", "get", "Provider configuration matrix",
   "Booleans indicating which CPaaS, payment and IoT providers are configured, plus domain topology. Never returns secret values.", [], "Gateway")
gw("/api/domains", "get", "Active domain topology", "Frontend, backend, inbound and outbound mail domains.", [], "Gateway")
gw("/api/cpaas/send", "post", "Send an SMS/WhatsApp/RCS message",
   "Dispatches through Sent.dm first, falling back to Twilio (USA voice-approved account) or Termii (Nigeria).",
   [{"supabaseJwt": []}], "Gateway")
paths["/api/cpaas/send"]["post"]["requestBody"] = {
    "required": True,
    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/CpaasSendRequest"}}},
}
for p, label in [("/api/webhooks/sent", "Sent.dm inbound message"),
                 ("/api/webhooks/sent/status", "Sent.dm delivery status"),
                 ("/api/webhooks/twilio", "Twilio voice/status callback"),
                 ("/api/webhooks/termii", "Termii delivery callback")]:
    gw(p, "post", label, "Provider webhook. Raw body required for signature verification.",
       [{"providerSignature": []}], "Webhooks")

for name in sorted(meta):
    m = meta[name]
    d = describe(name) or f"Edge function `{name}`."
    extra = []
    extra.append(f"Auth: {auth_label(name, m)}.")
    if name in CRON:
        extra.append("Invoked by pg_cron: " + ", ".join(CRON[name]) + ".")
    extra.append("Secrets read: " + (", ".join(m["env"]) if m["env"] else "none") + ".")
    op = {
        "tags": [group_of(name)],
        "operationId": re.sub(r"[^a-zA-Z0-9]+", "_", name),
        "summary": name,
        "description": d + "\n\n" + " ".join(extra),
        "security": sec_for(name, m),
        "requestBody": {
            "required": False,
            "content": {"application/json": {"schema": {"type": "object", "additionalProperties": True}}},
        },
        "responses": {
            "200": {"description": "Success", "content": {"application/json": {"schema": {"type": "object", "additionalProperties": True}}}},
            "400": {"$ref": "#/components/responses/BadRequest"},
            "401": {"$ref": "#/components/responses/Unauthorized"},
            "500": {"$ref": "#/components/responses/ServerError"},
        },
    }
    entry = {"post": op}
    if "GET" in m["methods"]:
        g = json.loads(json.dumps(op))
        g["operationId"] += "_get"
        g.pop("requestBody", None)
        entry["get"] = g
    paths[f"/functions/v1/{name}"] = entry

err = {
    "description": "Error",
    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}},
}

doc = {
    "openapi": "3.1.0",
    "info": {
        "title": "Rentmaikar Backend API",
        "version": "1.0.0",
        "description": (
            "Complete server-side surface of the Rentmaikar platform: the Express API gateway "
            f"and all {len(meta)} Supabase Edge Functions.\n\n"
            "Two hosts are served by this spec. Gateway paths (`/api/...`) are served from "
            f"`{GATEWAY}`. Edge function paths (`/functions/v1/...`) are served from "
            f"`https://{PROJECT_REF}.supabase.co`.\n\n"
            "Most edge functions run with the platform's `verify_jwt` disabled and validate the "
            "caller's Supabase JWT in code. Webhook endpoints authenticate by provider HMAC "
            "signature over the raw request body. Scheduled workers authenticate with the shared "
            "`CRON_SECRET` token.\n\n"
            "No credential values appear in this document."
        ),
        "contact": {"name": "Rentmaikar / INTE-GRITTY LLC", "url": "https://rentmaikar.com"},
        "license": {"name": "Proprietary - INTE-GRITTY LLC", "url": "https://rentmaikar.com/terms"},
    },
    "servers": [
        {"url": GATEWAY, "description": "API gateway (Express)"},
        {"url": f"https://{PROJECT_REF}.supabase.co", "description": "Supabase Edge Functions host"},
    ],
    "tags": [{"name": t, "description": TAG_DESC.get(t, f"{t} endpoints.")}
             for t in ["Gateway", "Webhooks"] + sorted({group_of(n) for n in meta})],
    "paths": paths,
    "components": {
        "securitySchemes": {
            "supabaseJwt": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT",
                            "description": "Supabase user access token."},
            "cronToken": {"type": "apiKey", "in": "header", "name": "x-cron-token",
                          "description": "Shared CRON_SECRET used by pg_cron-triggered workers."},
            "providerSignature": {"type": "apiKey", "in": "header", "name": "x-signature",
                                  "description": "Provider HMAC signature over the raw body. Header name varies by provider (Sent, Resend, Termii, Persona, Paystack, PayPal, OPay, Twilio)."},
        },
        "responses": {
            "BadRequest": dict(err, description="Invalid request payload"),
            "Unauthorized": dict(err, description="Missing or invalid credentials"),
            "ServerError": dict(err, description="Unhandled server error"),
        },
        "schemas": {
            "Error": {
                "type": "object",
                "properties": {"error": {"type": "string"}, "message": {"type": "string"}},
            },
            "CpaasSendRequest": {
                "type": "object",
                "required": ["to", "channel"],
                "properties": {
                    "to": {"type": "array", "items": {"type": "string"}, "description": "E.164 destinations"},
                    "channel": {"type": "string", "enum": ["sms", "whatsapp", "rcs"]},
                    "text": {"type": "string"},
                    "template": {
                        "type": "object",
                        "properties": {"id": {"type": "string"},
                                       "parameters": {"type": "object", "additionalProperties": True}},
                    },
                    "sender_id": {"type": "string"},
                    "metadata": {"type": "object", "additionalProperties": True},
                },
            },
        },
    },
}

with open(os.path.join(OUT, "openapi.yaml"), "w") as f:
    yaml.safe_dump(doc, f, sort_keys=False, width=100, allow_unicode=True)
print("paths:", len(paths))
