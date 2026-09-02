# Rentmaikar Call Strategy Reference

## Overview

The call strategy module (`supabase/functions/_shared/call-strategy.ts`) governs all outbound system call behavior — retry logic, time-of-day restrictions, and multi-channel escalation.

---

## Retry Schedules by Priority

| Priority | Attempts (Today) | Intervals (minutes) | Next-Day Retry | Max Total Attempts |
|---|---|---|---|---|
| **Critical** | 5 | 0, 5, 15, 30, 60 | ✅ | 10 |
| **High** | 3 | 0, 30, 120 | ✅ | 6 |
| **Medium** | 2 | 0, 240 | ✅ | 4 |
| **Low** | 1 | 0 | ❌ | 2 |

### Call Type → Priority Mapping

| Call Type | Priority |
|---|---|
| `accident_detection` | Critical |
| `security_alert` | Critical |
| `vehicle_shutdown` | Critical |
| `payment_default_stage3` | High |
| `payment_default_stage2` | High |
| `document_expiry_5day` | High |
| `payment_default_stage1` | Medium |
| `document_expiry_7day` | Medium |
| `document_expiry_15day` | Medium |
| `vehicle_return_reminder` | Medium |
| `inspection_reminder` | Medium |
| `document_expiry_30day` | Low |
| `payout_confirmation` | Low |
| `welcome_call` | Low |

---

## Time-Based Calling Restrictions

| Region | Calling Hours | Timezone | Restricted Hours Action |
|---|---|---|---|
| **USA** | 9:00 AM – 9:00 PM | America/New_York | Voicemail only |
| **Nigeria** | 8:00 AM – 8:00 PM | Africa/Lagos | SMS only |

When a call is attempted outside calling hours:
1. The fallback channel (SMS for Nigeria, voicemail for USA) is used immediately
2. A retry is scheduled for the next day at the start of the calling window

---

## Channel Escalation Ladder

When voice calls fail, the system escalates through channels:

| Attempt | Primary Channel | Fallback Channel |
|---|---|---|
| 1 | Call | SMS |
| 2 | Call | WhatsApp |
| 3 | Call | Email |
| 4 | SMS | WhatsApp |
| 5 | WhatsApp | Email |

---

## Smart Calling Algorithm

```
initiateCall(user, callType):
  1. Determine region from phone (+1 → US, +234 → NG)
  2. Select provider: US → Twilio, NG → Termii
  3. Check calling hours for region
     → If outside hours: send SMS/voicemail (via regional provider), schedule next-day retry
  4. Check user preferences
     → If sms_only: send SMS (Twilio for US, Termii for NG), return
  5. Get priority from callType
  6. Loop through retry schedule:
     → US: Attempt call via Twilio Voice API
     → NG: Attempt call via Termii Voice API (/sms/otp/call)
     → On success: log and return
     → On busy/no-answer: wait interval, retry
  7. If all call attempts fail: escalate channel (SMS/WhatsApp via regional provider)
  8. If channel escalation exhausted + nextDay enabled:
     → Schedule retry at start of next calling window
  9. If fully exhausted: mark as permanently failed
```

---

## Implementation Details

### Shared Module
- **File**: `supabase/functions/_shared/call-strategy.ts`
- **Exports**: `RETRY_SCHEDULES`, `TIME_RESTRICTIONS`, `CHANNEL_ESCALATION`, `getCallPriority()`, `isWithinCallingHours()`, `getRetryDecision()`, `getNextDayRetryTimestamp()`

### Provider Selection
- **USA (+1):** Twilio Voice API, Twilio SMS, Twilio WhatsApp
- **Nigeria (+234):** Termii Voice API (`/sms/otp/call`), Termii SMS, Termii WhatsApp

### Integration Point
- **voip-status-callback**: Uses `getRetryDecision()` on every `busy`/`no-answer` status to determine retry timing, channel escalation, or next-day scheduling. Handles callbacks from both Twilio and Termii.
- All outbound-calling edge functions detect region (`+1` or `+234`) and route to the appropriate provider before initiating calls.

### Retry Record Structure
Retry calls are inserted into `voip_calls` with:
- `status: 'pending'`
- `started_at: <future timestamp>` (calculated from retry interval or next-day window)
- `direction: 'outbound'`
- `region: 'usa' | 'nigeria'` (determines provider for retry)
- Original `call_type`, `receiver_id` preserved for continuity
