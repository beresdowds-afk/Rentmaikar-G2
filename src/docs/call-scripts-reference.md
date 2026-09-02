# Rentmaikar Localized Call Scripts Reference

## Overview

All outbound IVR calls and automated messages use region-aware, multilingual scripts. Language selection is determined by user profile preferences and phone country code routing (+1 → USA, +234 → Nigeria).

---

## Nigeria-Specific Scripts

### Police Report Reminder

| Language | Script |
|---|---|
| **Pidgin** | Oya o, your police report dey expire soon. Abeg upload new one make we no suspend your vehicle. |
| **Yoruba** | Ìròyìn olópàá rẹ̀ fẹ́ parí. Jọ̀wọ́ gbé tuntun síbẹ̀ kí a má ba à dá dúró. |
| **English** | Your police report is expiring soon. Please upload a new one to continue renting. |

### Payment Reminder (Overdue)

| Language | Script |
|---|---|
| **Pidgin** | Your payment don overdue. Make you pay now or your vehicle go shut down. |
| **Hausa** | Biyanku ya kare. Ku biya yanzu ko motar za ta tsaya. |
| **English** | Your payment is overdue. Pay now to avoid vehicle shutdown. |

### TwiML Integration (Nigeria)

```xml
<!-- Police Report Reminder IVR — Nigeria -->
<Response>
  <Gather numDigits="1" action="/functions/v1/expiry-notification-ivr?type=police_report&region=NG" method="POST">
    <Say voice="Polly.Aditi" language="en-NG">
      Your police report is expiring soon. Please upload a new one to continue renting.
      Press 1 to receive an upload link by SMS.
      Press 2 to request an extension.
      Press 3 to speak with a support agent.
    </Say>
  </Gather>
  <Say>We did not receive a response. Goodbye.</Say>
</Response>

<!-- Payment Overdue IVR — Nigeria -->
<Response>
  <Gather numDigits="1" action="/functions/v1/payment-default-ivr?region=NG" method="POST">
    <Say voice="Polly.Aditi" language="en-NG">
      Your payment is overdue. Pay now to avoid vehicle shutdown.
      Press 1 to receive a payment link.
      Press 2 to speak with support.
    </Say>
  </Gather>
  <Say>We did not receive a response. Your vehicle may be restricted.</Say>
</Response>
```

---

## USA-Specific Scripts

### Background Check Pending

| Language | Script |
|---|---|
| **English** | Your background check is pending approval. We'll notify you once verified. |
| **Spanish** | Su verificación de antecedentes está pendiente. Le notificaremos una vez verificada. |

### Insurance Reminder

| Language | Script |
|---|---|
| **English** | Your insurance policy expires on [Date]. Please upload your new insurance documents. |
| **Spanish** | Su póliza de seguro vence el [Date]. Por favor, suba sus nuevos documentos de seguro. |

### TwiML Integration (USA)

```xml
<!-- Insurance Expiry IVR — USA -->
<Response>
  <Gather numDigits="1" action="/functions/v1/expiry-notification-ivr?type=insurance&region=US" method="POST">
    <Say voice="Polly.Joanna" language="en-US">
      Your insurance policy is expiring soon. Please upload your new insurance documents.
      Press 1 to receive an upload link by text.
      Press 2 to request an extension.
      Press 3 to speak with a support agent.
    </Say>
  </Gather>
  <Say>We did not receive a response. Goodbye.</Say>
</Response>

<!-- Spanish variant -->
<Response>
  <Gather numDigits="1" action="/functions/v1/expiry-notification-ivr?type=insurance&region=US&lang=es" method="POST">
    <Say voice="Polly.Lupe" language="es-US">
      Su póliza de seguro está por vencer. Por favor, suba sus nuevos documentos de seguro.
      Presione 1 para recibir un enlace de carga por mensaje de texto.
      Presione 2 para solicitar una extensión.
      Presione 3 para hablar con un agente de soporte.
    </Say>
  </Gather>
  <Say>No recibimos una respuesta. Adiós.</Say>
</Response>
```

---

## Emergency Scripts

### Accident Detection

| Stage | Script |
|---|---|
| **Initial Alert** | We've detected an accident alert from your vehicle. Emergency services have been notified. Remain calm and await assistance. |
| **Follow-Up** | An ambulance has been dispatched to your location. ETA: [Time]. Stay on the line. |

### Breakdown Assistance

| Stage | Script |
|---|---|
| **Initial** | Roadside assistance has been dispatched. Your vehicle location has been shared with our partner mechanic. |
| **IVR Options** | Press 1 if you need a tow truck. Press 2 if you've already resolved the issue. Press 3 for police assistance. |

### Security Alert (Unauthorized Movement)

| Stage | Script |
|---|---|
| **Alert** | Security alert: Unauthorized movement detected. Vehicle immobilization in progress. |
| **Verification** | Press 1 if this is you driving. Press 2 for the security team. |

### Emergency TwiML Templates

```xml
<!-- Accident Detection IVR -->
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna" language="en-US">
    EMERGENCY ALERT. We have detected an accident from your vehicle.
    Emergency services have been notified. Remain calm and await assistance.
  </Say>
  <Gather numDigits="1" action="/functions/v1/iot-accident-detection?step=followup" method="POST">
    <Say>
      Press 1 to confirm you are okay.
      Press 2 if you need immediate medical assistance.
      Press 3 to speak with our emergency team.
    </Say>
  </Gather>
  <Say>Stay on the line. Help is on the way.</Say>
  <Dial>+1XXXXXXXXXX</Dial>
</Response>

<!-- Breakdown Assistance IVR -->
<Response>
  <Say voice="Polly.Joanna" language="en-US">
    Roadside assistance has been dispatched. Your vehicle location has been shared with our partner mechanic.
  </Say>
  <Gather numDigits="1" action="/functions/v1/iot-accident-detection?step=breakdown" method="POST">
    <Say>
      Press 1 if you need a tow truck.
      Press 2 if you have already resolved the issue.
      Press 3 for police assistance.
    </Say>
  </Gather>
  <Say>We did not receive a response. A support agent will call you shortly.</Say>
</Response>

<!-- Security Alert IVR (Unauthorized Movement) -->
<Response>
  <Say voice="Polly.Matthew" language="en-US">
    SECURITY ALERT. Unauthorized movement has been detected on your vehicle.
    Vehicle immobilization is in progress.
  </Say>
  <Gather numDigits="1" action="/functions/v1/shutdown-warning-ivr?type=security" method="POST" timeout="10">
    <Say>
      Press 1 if this is you driving.
      Press 2 to connect with our security team immediately.
    </Say>
  </Gather>
  <Say>No response received. Vehicle immobilization will proceed. An administrator has been alerted.</Say>
</Response>
```

---

## Language-Voice Mapping

| Region | Language | Twilio Voice | Voice Code |
|---|---|---|---|
| USA | English | Polly.Joanna | `en-US` |
| USA | Spanish | Polly.Lupe | `es-US` |
| Nigeria | English | Polly.Aditi | `en-NG` |
| Nigeria | Pidgin | Polly.Aditi (English fallback) | `en-NG` |
| Nigeria | Yoruba | Polly.Aditi (English fallback) | `en-NG` |
| Nigeria | Hausa | Polly.Aditi (English fallback) | `en-NG` |

> **Note:** Twilio does not natively support Pidgin, Yoruba, or Hausa TTS. IVR menus for these languages use English TTS with Nigerian accent. SMS/WhatsApp follow-ups are sent in the user's preferred language using the templates above.

---

## Script Selection Logic

```
1. Detect user phone country code (+1 / +234)
2. Load user language preference from profile
3. Match to available script variant:
   - If exact language match → use localized script
   - If no match → fallback to English (regional accent)
4. For IVR: select Twilio Polly voice from mapping table
5. For SMS/WhatsApp: use full localized text template
```

---

## Cross-Reference

| Script Category | Edge Function | IVR Handler |
|---|---|---|
| Police Report Reminder | `process-expiry-notifications` | `expiry-notification-ivr` |
| Payment Overdue | `process-payment-defaults` | `payment-default-ivr` |
| Insurance Reminder | `process-expiry-notifications` | `expiry-notification-ivr` |
| Background Check | `send-approval-notification` | — (SMS/email only) |
| Accident Detection | `iot-accident-detection` | inline TwiML |
| Breakdown Assistance | `iot-accident-detection` | inline TwiML |
| Security Alert | `vehicle-shutdown-warning` | `shutdown-warning-ivr` |
| Vehicle Return | `vehicle-return-reminder` | `vehicle-return-ivr` |
