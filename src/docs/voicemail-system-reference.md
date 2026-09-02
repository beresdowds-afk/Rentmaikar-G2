# Rentmaikar Voicemail System Reference

## Overview

The voicemail system handles automated message drops when outbound calls reach an answering machine. It uses Twilio's Answering Machine Detection (`DetectMessageEnd`) to wait for the beep, then delivers a personalized TwiML message followed by an SMS/WhatsApp follow-up.

**Module**: `supabase/functions/_shared/voicemail-system.ts`

---

## Voicemail Scripts

### Payment Default — Day 1
| Field | Value |
|---|---|
| **Message** | "This is Rentmaikar calling regarding your payment. Your payment of [Amount] is now overdue. Please call us back at [Number] or make payment through our automated system." |
| **Callback Queue** | `payment_ivr` |
| **SMS Follow-up** | ✅ |

### Payment Default — Day 2
| Field | Value |
|---|---|
| **Message** | "URGENT: This is Rentmaikar. Your payment is now 48 hours overdue. Your vehicle may be deactivated if payment is not received. Call us immediately at [Number]." |
| **Callback Queue** | `priority_queue` |
| **SMS Follow-up** | ✅ |

### Document Expiry
| Field | Value |
|---|---|
| **Message** | "Hello, this is Rentmaikar with a reminder that your [Document] expires on [Date]. Please upload a new copy through your driver portal or call us for assistance." |
| **Callback Queue** | `document_team` |
| **SMS Link** | ✅ (dashboard upload link) |

### Welcome Call
| Field | Value |
|---|---|
| **Message** | "Welcome to Rentmaikar! We're excited to have you. Please log in to your account to complete your registration. If you need assistance, call us back at [Number]." |
| **Callback Queue** | `new_user_queue` |
| **SMS Welcome** | ✅ |

---

## Voicemail Delivery Flow

```
1. Outbound call initiated with MachineDetection: 'DetectMessageEnd'
2. Twilio detects answering machine → waits for beep
3. After beep: TwiML plays personalized voicemail script
4. voip-status-callback receives 'completed' status
5. System checks if voicemail was detected (AnsweredBy field)
6. If voicemail detected:
   a. Log to voicemail_logs table
   b. Send SMS/WhatsApp follow-up based on script config
   c. Schedule retry per call-strategy priority
```

---

## Variable Replacement

Scripts use `[Variable]` placeholders that are replaced at runtime:

| Placeholder | Source |
|---|---|
| `[Amount]` | Payment amount with currency symbol |
| `[Number]` | Regional callback number from `communication_providers` |
| `[Document]` | Document type (e.g., "driver's license", "insurance") |
| `[Date]` | Document expiry date |
| `[Name]` | User's first name |

---

## SMS Follow-Up Messages

| Script Type | SMS Content |
|---|---|
| `payment_default_day1` | "We tried to reach you about your overdue payment of [Amount]. Please call [Number] or visit your dashboard to pay." |
| `payment_default_day2` | "URGENT: Your payment is 48 hours overdue. Your vehicle may be restricted. Call [Number] immediately." |
| `document_expiry` | "Your [Document] expires [Date]. Upload a new copy at your dashboard: [Link]" |
| `welcome_call` | "Welcome to Rentmaikar! 🚗 Complete your registration at [Link]. Need help? Call [Number]." |

---

## Database: voicemail_logs

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | Target user |
| `call_sid` | TEXT | Twilio call SID |
| `script_type` | TEXT | Script key (e.g., `payment_default_day1`) |
| `personalized_message` | TEXT | Actual message delivered |
| `callback_queue` | TEXT | Queue for callback routing |
| `sms_followup_sent` | BOOLEAN | Whether SMS was sent |
| `sms_link_sent` | BOOLEAN | Whether upload link was sent |
| `voicemail_detected` | BOOLEAN | Whether AMD detected voicemail |
| `region` | TEXT | US or NG |
| `created_at` | TIMESTAMPTZ | Log timestamp |

---

## Integration with Call Strategy

The voicemail system integrates with the [Call Strategy](./call-strategy-reference.md):

- When `voip-status-callback` detects `AnsweredBy: machine_end_beep`, it triggers voicemail drop
- After voicemail delivery, the retry decision engine (`getRetryDecision()`) determines next action
- Off-hours calls automatically fall through to voicemail (USA) or SMS-only (Nigeria)
- Voicemail drops count as an attempt in the retry schedule

---

## Exports

| Function | Description |
|---|---|
| `VOICEMAIL_SCRIPTS` | Script definitions with callback queues and follow-up flags |
| `personalizeScript(template, variables)` | Replace `[Variable]` placeholders with actual values |
| `getCallbackNumber(region)` | Get regional callback number |
| `generateVoicemailTwiML(message, voice, lang)` | Generate TwiML for voicemail drop |
| `generateFollowUpSMS(scriptType, number, vars)` | Generate SMS follow-up text |
