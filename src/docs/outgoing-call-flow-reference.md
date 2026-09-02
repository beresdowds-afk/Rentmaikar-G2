# Rentmaikar Outgoing Call Flow — Reference

## Architecture Overview

```mermaid
graph TB
    subgraph "Trigger Sources"
        A1[Payment Default Stage 1] --> T[Trigger Queue]
        A2[Payment Default Stage 2] --> T
        A3[Payment Default Stage 3] --> T
        B1[Document Expiry Alert] --> T
        B2[Insurance Renewal] --> T
        C1[Vehicle Return Reminder] --> T
        C2[Rental Extension Offer] --> T
        D1[Owner Payout Confirmation] --> T
        D2[Driver Welcome Call] --> T
        E1[Emergency Alert] --> T
        E2[Vehicle Shutdown Warning] --> T
    end

    subgraph "Call Scheduling System"
        T --> S[Call Scheduler]
        S --> P{Priority Level}
        
        P -->|Critical| Q1[Immediate Queue]
        P -->|High| Q2[15min Queue]
        P -->|Medium| Q3[1hr Queue]
        P -->|Low| Q4[Scheduled Batch]
        
        Q1 --> R[Call Dispatcher]
        Q2 --> R
        Q3 --> R
        Q4 --> R
    end

    subgraph "Call Preparation"
        R --> U[Fetch User Context]
        U --> V[Load User Profile]
        V --> W[Check Timezone]
        W --> X[Language Selection]
        X --> Y[Generate Dynamic Script]
        
        Y --> Z[Prepare Call Data]
        Z --> AA[Store in Call Queue]
    end

    subgraph "Call Execution Engine"
        AA --> AB1{Region Detection}
        AB1 -->|USA +1| AB2[Twilio Voice API]
        AB1 -->|Nigeria +234| AB3[Termii Voice API]
        
        AB2 --> AC{Call Attempt}
        AB3 --> AC
        
        AC -->|Answered| AD[Connect Call]
        AC -->|Busy| AE[Schedule Retry]
        AC -->|No Answer| AF[Voicemail Drop]
        AC -->|Invalid| AG[Mark Invalid]
        
        AD --> AH[IVR Handler]
    end

    subgraph "Call Flow by Type"
        AH --> AI{Call Type}
        
        AI -->|Payment Default| BJ[Default Collection Flow]
        AI -->|Document Reminder| BK[Document Update Flow]
        AI -->|Vehicle Related| BL[Vehicle Management Flow]
        AI -->|Payment Confirmation| BM[Payment Confirmation Flow]
        AI -->|Emergency| BN[Emergency Alert Flow]
    end

    subgraph "Post-Call Processing"
        BJ --> BO[Log Call Outcome]
        BK --> BO
        BL --> BO
        BM --> BO
        BN --> BO
        
        BO --> BP[Update Database]
        BP --> BQ[Schedule Follow-up]
        BQ --> BR[Send Summary SMS]
        BR --> BS[Update Analytics]
    end
```

## Payment Default Escalation — Detailed Sequence

```mermaid
sequenceDiagram
    participant S as System
    participant Q as Queue
    participant C as Caller
    participant A as Agent/IVR
    participant DB as Database
    
    Note over S,DB: STAGE 1 - Initial Warning
    
    S->>Q: Hourly cron check
    Q->>DB: Find defaulted drivers
    DB->>Q: Return list of defaulters
    Q->>C: Initiate VoIP call with IVR
    
    alt Call Answered
        C->>A: Hello?
        A->>C: "This is Rentmaikar regarding your payment"
        A->>C: "Your payment of $X is now overdue"
        A->>C: "Press 1 to make payment now"
        A->>C: "Press 2 to speak with support"
        
        alt Payment Option (Press 1)
            C->>A: Press 1
            A->>C: "Payment link sent to your phone via SMS"
            A->>DB: Log IVR interaction
            S->>C: Send payment link SMS
        else Support Option (Press 2)
            C->>A: Press 2
            A->>C: Connect to support number
            A->>DB: Log support request
        end
    else No Answer
        Q->>C: Leave voicemail TwiML
        Q->>S: Schedule retry (15min, max 3x)
        S->>C: Send SMS reminder
    end
    
    Note over S,DB: STAGE 2 - Escalation
    
    S->>Q: Next notification interval
    Q->>C: Second VoIP call with IVR
    A->>C: "Urgent: payment still outstanding"
    A->>C: "Vehicle deactivation in Xh"
    
    Note over S,DB: STAGE 3 - Critical / Lockdown
    
    S->>Q: Final notification interval
    Q->>C: Critical VoIP call
    A->>C: "Immediate action required"
    A->>C: "Vehicle will be disabled when parked"
    
    alt Payment Received
        S->>C: "Payment confirmed - vehicle active"
        S->>DB: Resolve default, clear lockdown
    else No Payment
        S->>DB: Mark deactivation_eligible
        S->>C: Send lockdown warning SMS
    end
```

## Business Rules — Escalation Timing

| Plan Type | Overdue Window | Stage 1 | Stage 2 | Stage 3 (Lockdown) | Consequence |
|---|---|---|---|---|---|
| **Daily** | 24 hours | 8h overdue | 16h overdue | 24h overdue | Daily plan eligibility **permanently revoked** |
| **Weekly** | 36 hours | 12h overdue | 24h overdue | 36h overdue | Downgraded to **Daily plan** permanently |

### Key Enforcement Rules

- **10% administrative fine** on all late payments (driver must consent)
- **Vehicle lockdown** only when telemetry confirms: speed = 0, ignition OFF
- **Payment-to-unlock latency**: Under 30 seconds
- If vehicle is moving at lockdown time: queued and re-checked every 10-15 minutes
- Daily plan eligibility is **permanently revoked** after any default

## Implementation Mapping

### Currently Implemented Triggers

| Trigger | Edge Function | VoIP + IVR? | SMS/WhatsApp? |
|---|---|---|---|
| Payment Default Stage 1 | `process-payment-defaults` | ✅ Press 1/2 IVR | ✅ |
| Payment Default Stage 2 | `process-payment-defaults` | ✅ Press 1/2 IVR | ✅ |
| Payment Default Stage 3 | `process-payment-defaults` | ✅ Press 1/2 IVR | ✅ |
| Document Expiry (30-day) | `process-expiry-notifications` | ✅ IVR (Press 1/2/3) | ✅ Email/SMS/WhatsApp |
| Document Expiry (15-day) | `process-expiry-notifications` | ✅ IVR (Priority) | ✅ Email/SMS/WhatsApp |
| Document Expiry (7-day) | `process-expiry-notifications` | ✅ IVR (Urgent) | ✅ Email/SMS/WhatsApp |
| Document Expiry (5-day) | `process-expiry-notifications` | ✅ Critical Alert + Admin | ✅ + Account Restriction |
| Insurance Renewal (30/15/7/5) | `process-expiry-notifications` | ✅ (all tiers) | ✅ |
| Pre-Due Payment Reminders | `process-predue-reminders` | ❌ | ✅ WhatsApp/Email |
| Emergency (IoT Accident) | `iot-accident-detection` | ❌ (SMS only) | ✅ |

### Edge Functions Involved

| Function | Role |
|---|---|
| `process-payment-defaults` | Hourly cron — escalation, SMS/WhatsApp + VoIP with IVR (Twilio for USA, Termii for Nigeria) |
| `payment-default-ivr` | IVR callback — handles Press 1 (payment SMS) / Press 2 (connect support). USA: Twilio `<Gather>`, Nigeria: Termii voice flow |
| `expiry-notification-ivr` | IVR callback — handles Press 1 (upload link SMS) / Press 2 (extension request) / Press 3 (connect agent). Provider selected by region |
| `voip-status-callback` | Status webhook — retry logic (3x @ 15min), post-call summary SMS. Routes via Twilio (USA) or Termii (Nigeria) |
| `expiry-notification-ivr` | IVR callback — Press 1 (upload SMS) / Press 2 (extension) / Press 3 (agent). Region-aware provider |
| `process-expiry-notifications` | Daily 8 AM UTC — 30/15/7/5-day expiry alerts with VoIP+IVR via Twilio (USA) or Termii (Nigeria), document-type routing, account restriction at 5-day |
| `process-predue-reminders` | Hourly — friendly pre-due WhatsApp/email reminders (72h→12h before due) |
| `vehicle-return-reminder` | Daily — calls drivers 24h before rental end with IVR. USA: Twilio Voice, Nigeria: Termii Voice |
| `vehicle-return-ivr` | IVR callback — Press 1 (confirm return + SMS) / Press 2 (extension check) / Press 3 (issue) / Press 4 (agent). Region-aware |
| `vehicle-shutdown-warning` | CRITICAL — immediate call with moving/parked-aware flow + SMS + admin alert. USA: Twilio, Nigeria: Termii |
| `shutdown-warning-ivr` | IVR callback — Moving: Press 1 (pulled over) / Press 2 (emergency). Parked: Press 1 (dispute) / Press 2 (agent). Region-aware provider |
| `process-daily-debits` | Daily 12:01 AM — payment success/failure notifications to drivers via SMS/WhatsApp/email (Twilio for USA, Termii for Nigeria) |
| `process-owner-payouts` | Friday 5 PM — weekly payout confirmation/pending notifications to vehicle owners |
| `process-inspection-reminders` | Quarterly 1st of quarter — vehicle inspection due reminders to owners |

### Batch Notification Schedules

| Schedule | Edge Function | Cron | Description |
|---|---|---|---|
| Daily Payment Debits (12:01 AM) | `process-daily-debits` | `1 0 * * *` | Notifies drivers of successful/failed daily payment processing |
| Weekly Owner Payouts (Fri 5 PM) | `process-owner-payouts` | `0 17 * * 5` | Sends payout confirmation/pending notifications to vehicle owners |
| Document Expiry Batch (Daily 8 AM) | `process-expiry-notifications` | `0 8 * * *` | Multi-tier (30/15/7/5-day) document expiry alerts with VoIP+IVR |
| Quarterly Inspections (1st of quarter) | `process-inspection-reminders` | `0 10 1 */3 *` | Vehicle inspection due reminders to owners |

### Voicemail System

Dynamic voicemail drops with AMD detection and SMS follow-ups. See **[voicemail-system-reference.md](./voicemail-system-reference.md)** for:
- Script definitions (payment default day 1/2, document expiry, welcome call)
- Variable replacement and personalization
- SMS follow-up templates per script type
- `voicemail_logs` table schema and logging flow

### Localized Call Scripts

All outbound calls use region-aware multilingual scripts. See **[call-scripts-reference.md](./call-scripts-reference.md)** for:
- Nigeria scripts (Pidgin, Yoruba, Hausa, English)
- USA scripts (English, Spanish)
- Emergency scripts (Accident, Breakdown, Security)
- TwiML templates with Twilio Polly voice mapping (USA), Termii voice templates (Nigeria)
- Language selection logic and fallback rules

### Not Yet Implemented (Blueprint Only)

| Trigger | Notes |
|---|---|
| Rental Extension Offer | Partially handled via vehicle-return-ivr Press 2 |
| Driver Welcome Call | Requires onboarding automation trigger |

### Call Strategy & Retry Logic

The smart calling algorithm is implemented in `supabase/functions/_shared/call-strategy.ts`. See **[call-strategy-reference.md](./call-strategy-reference.md)** for:
- Priority-based retry schedules (Critical: 5 attempts/10 max, High: 3/6, Medium: 2/4, Low: 1/2)
- Time-zone calling restrictions (USA: 9AM–9PM ET, Nigeria: 8AM–8PM WAT)
- 5-step channel escalation ladder (Call → SMS → WhatsApp → Email)
- Smart calling algorithm with off-hours fallback and next-day scheduling

### Call Execution Flow

1. Edge function creates `voip_calls` record with `status: 'pending'`, `caller_role: 'system'`
2. `isWithinCallingHours(region)` checked — if outside hours, fallback channel used + next-day retry scheduled
3. Region detection: `+1` → Twilio, `+234` → Termii
4. **USA (+1):** Twilio REST API called with `<Gather>` TwiML pointing to IVR handler
5. **Nigeria (+234):** Termii Voice API called (`/sms/otp/call`) with message text and callback
6. Answering Machine Detection enabled (Twilio: `MachineDetection: DetectMessageEnd`)
7. `StatusCallback` → `voip-status-callback` receives real-time updates from both providers
8. On answered: IVR menu plays, user presses option key
9. On busy/no-answer: `getRetryDecision()` calculates priority-based retry interval or channel escalation
10. On completion: duration logged, summary SMS sent (via Twilio or Termii based on region)
11. On max retries exhausted: channel escalation ladder applied, then marked as permanently failed
