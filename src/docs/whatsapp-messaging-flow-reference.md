# Rentmaikar Messaging Flow — Reference

## Architecture Overview

```mermaid
graph TB
    subgraph "Inbound Message Sources"
        TW_IN[Twilio Webhook — USA +1] -->|form-data| TWH[twilio-webhook]
        TM_IN[Termii Webhook — Nigeria +234] -->|JSON| TMH[termii-webhook]
    end

    subgraph "Message Router"
        TWH --> MR{Message Router}
        TMH --> MR
        MR -->|Self-Service Command| WC[whatsapp-commands]
        MR -->|General Message| UI[Unified Inbox DB]
    end

    subgraph "WhatsApp Self-Service — whatsapp-commands"
        WC --> CMD{Command Parser}
        CMD -->|PAY / PAYMENT| PAY[Payment Handler]
        CMD -->|STATUS| STA[Rental Status]
        CMD -->|BALANCE| BAL[Balance Lookup]
        CMD -->|HELP / SUPPORT| HLP[Help Menu]
        CMD -->|1 — BOOKING| BK[Booking Support]
        CMD -->|2| PS[Payment Support]
        CMD -->|3| VS[Vehicle Support]
        CMD -->|4 — HUMAN| HUM[Escalate to Agent]
        CMD -->|Unknown| MENU[Self-Service Menu]
    end

    subgraph "Outbound Message Dispatch"
        ADMIN[Admin Reply — send-inbox-reply] --> RD{Region Detect}
        AUTO[Automated Alerts — send-sms-notification] --> RD
        RD -->|+1 USA| TWILIO_OUT[Twilio Messages API]
        RD -->|+234 Nigeria| TERMII_OUT[Termii SMS/WhatsApp API]
    end

    subgraph "Outbound Templates — whatsapp-templates.ts"
        T1[Booking Confirmed]
        T2[Payment Reminders — 72h/60h/48h/36h/24h/12h]
        T3[Payment Overdue — 8h/16h/24h]
        T4[Weekly Overdue — 12h/24h/36h]
        T5[Vehicle Locked / Unlocked]
        T6[Plan Downgraded]
        T7[Self-Service Menu / Payment Link / Status / Help]
        T8[Driver Welcome / Onboarding]
    end
```

## Provider Stack

| Component | USA (+1) | Nigeria (+234) | Social Platforms |
|---|---|---|---|
| **Inbound Webhook** | `twilio-webhook` (form-data) | `termii-webhook` (JSON) | Platform-specific webhooks (planned) |
| **Outbound SMS** | Twilio Messages API | Termii `/api/sms/send` | N/A |
| **Outbound WhatsApp** | Twilio `whatsapp:` prefix | Termii `channel: "whatsapp"` | N/A |
| **Self-Service Commands** | `whatsapp-commands` (via Twilio) | `whatsapp-commands` (via Termii) | N/A |
| **Admin Replies** | `send-inbox-reply` → Twilio | `send-inbox-reply` → Termii | Planned per-platform API |

## Social Messaging Channels (Prepared — API Not Yet Connected)

| Platform | Channel Key | Status | API Required |
|---|---|---|---|
| Facebook Messenger | `facebook_messenger` | UI Ready | Meta Graph API (Pages) |
| Instagram Messenger | `instagram` | UI Ready | Meta Graph API (Instagram Business) |
| LinkedIn Messenger | `linkedin` | UI Ready | LinkedIn Marketing API |
| Google Chat | `google_chat` | UI Ready | Google Chat API (Workspace) |
| TikTok Messages | `tiktok` | UI Ready | TikTok for Business API |

Configuration for each platform is stored in the `social_messaging_configs` table and manageable by admins.

## Inbound Flow

### USA (+1) — Twilio
1. User sends WhatsApp/SMS to Twilio number
2. Twilio POSTs form-data to `twilio-webhook`
3. Webhook detects channel (`whatsapp:` prefix → WhatsApp)
4. Message saved to `inbox_conversations` + `inbox_messages`
5. Realtime subscription notifies admin Unified Inbox

### Nigeria (+234) — Termii
1. User sends WhatsApp/SMS to Termii number
2. Termii POSTs JSON to `termii-webhook`
3. Webhook normalizes phone to `+234...` format
4. If message is a known command → forwards to `whatsapp-commands`
5. Otherwise → saves to `inbox_conversations` + `inbox_messages`
6. Realtime subscription notifies admin Unified Inbox

## Outbound Flow

### Admin Replies (send-inbox-reply)
```
Admin types reply in Unified Inbox
  → Frontend calls send-inbox-reply edge function
    → Detects phone region:
      +234 → Termii /api/sms/send (channel: "whatsapp" or "generic")
      +1   → Twilio Messages API (whatsapp: prefix or SMS)
    → Updates inbox_messages with external_id + provider metadata
```

### Automated Notifications (send-sms-notification)
```
Edge function triggers notification (e.g., payment reminder)
  → Calls send-sms-notification with phone + channel + type
    → Detects phone region:
      +234 → Termii
      +1   → Twilio
    → Sends message using regional provider
```

## Self-Service Commands (whatsapp-commands)

| Command | Action |
|---|---|
| `PAY` / `PAYMENT` | Generate secure payment link |
| `STATUS` | Show active rental details |
| `BALANCE` | Show outstanding payment balance |
| `HELP` / `SUPPORT` | Display help menu |
| `OK` / `DONE` | Acknowledge confirmation |
| `1` / `BOOKING` | Booking support info |
| `2` | Payment support info |
| `3` | Vehicle support info |
| `4` / `HUMAN` | Escalate to live agent → creates inbox conversation |
| *Unknown* | Display self-service menu |

## Message Templates

All templates are defined in `supabase/functions/_shared/whatsapp-templates.ts` and include:

- **Booking**: Confirmed, Owner Notified, Pickup Reminder, Return Reminder
- **Pre-Due Reminders**: 72h, 60h, 48h, 36h, 24h, 12h before payment due
- **Overdue (Daily)**: 8h, 16h, 24h final warning
- **Overdue (Weekly)**: 12h, 24h, 36h final warning
- **Lockdown**: Vehicle locked, Vehicle unlocked, Plan downgraded
- **Self-Service**: Menu, Payment link, Rental status, Help, Driver welcome
- **Price Negotiation**: Submitted (driver/owner), Approved, Rejected, Counter Offer, Locked, Modification Requested, Modification Processed

## Edge Function Config (config.toml)

```toml
[functions.twilio-webhook]
verify_jwt = false

[functions.termii-webhook]
verify_jwt = false

[functions.whatsapp-commands]
verify_jwt = false
```

All inbound webhooks have JWT verification disabled to allow unauthenticated delivery from external providers.

## WhatsApp Platform Configuration

### Provider API Settings

| Setting | USA (Twilio) | Nigeria (Termii) |
|---|---|---|
| **API Version** | Twilio REST v2010 | Termii v1 |
| **Base URL** | `https://api.twilio.com/2010-04-01/` | `https://api.ng.termii.com/api/` |
| **Auth Method** | Basic Auth (SID:Token) | API Key in body |
| **WhatsApp Format** | `whatsapp:+1XXXXXXXXXX` prefix | `channel: "whatsapp"` field |
| **SMS Format** | Direct phone number | `channel: "generic"` field |

### Webhook Endpoints

| Webhook | Provider | URL Pattern | Format |
|---|---|---|---|
| **Incoming Messages** | Twilio | `{SUPABASE_URL}/functions/v1/twilio-webhook` | form-data |
| **Incoming Messages** | Termii | `{SUPABASE_URL}/functions/v1/termii-webhook` | JSON |
| **Message Status** | Twilio | `{SUPABASE_URL}/functions/v1/voip-status-callback` | form-data |
| **WhatsApp Commands** | Internal | `{SUPABASE_URL}/functions/v1/whatsapp-commands` | JSON / form-data |

### Rate Limits

| Limit | Twilio (USA) | Termii (Nigeria) |
|---|---|---|
| **Per Second** | 80 messages | 50 messages |
| **Per Day** | 1,000,000 | 500,000 |
| **Concurrent** | 50 | 30 |
| **Template Messages** | Unlimited (approved) | Subject to approval |

### Regional Numbers

| Region | WhatsApp Number | Provider | SMS Sender |
|---|---|---|---|
| USA (+1) | Twilio WhatsApp-enabled number | Twilio | `TWILIO_PHONE_NUMBER` |
| Nigeria (+234) | Termii WhatsApp-enabled number | Termii | `TERMII_SENDER_ID` |

### Message Types Supported

| Type | Description | Provider Support |
|---|---|---|
| **Text** | Plain text messages | Twilio ✅ / Termii ✅ |
| **Template** | Pre-approved templates | Twilio ✅ / Termii ✅ |
| **Interactive** | Buttons & list menus | Twilio ✅ / Termii (via text fallback) |
| **Media** | Images, documents, audio | Twilio ✅ / Termii ✅ |

## Secrets Required

| Secret | Provider | Usage |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio | USA outbound messages |
| `TWILIO_AUTH_TOKEN` | Twilio | USA outbound auth |
| `TWILIO_PHONE_NUMBER` | Twilio | USA sender number |
| `TERMII_API_KEY` | Termii | Nigeria outbound messages |
| `TERMII_SENDER_ID` | Termii | Nigeria sender ID (default: "Rentmaikar") |
