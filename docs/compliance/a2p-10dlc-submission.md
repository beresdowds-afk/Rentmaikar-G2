# Rentmaikar — A2P 10DLC Campaign Resubmission Packet

Last updated: 2026-08-14

## 1. Brand / campaign basics

| Field | Value |
|---|---|
| Campaign use case | **MIXED** |
| Sub-use cases | Customer Care, Account Notification, Delivery/Service Notification |
| Website | https://www.rentmaikar.com |
| Privacy Policy URL | https://www.rentmaikar.com/privacy |
| Terms & Conditions URL | https://www.rentmaikar.com/terms |
| SMS opt-in / program page | https://www.rentmaikar.com/sms-opt-in |
| Embedded links | **YES** (links to rentmaikar.com pages/receipts) |
| Embedded phone numbers | **NO** |
| Age-gated content | NO |
| Direct lending / loan arrangement | NO |
| Affiliate marketing | NO |
| Number pooling | NO (unless >49 numbers) |
| Opt-in type | **Web form (digital opt-in)** |
| Help/Stop handling | Twilio Advanced Opt-Out (keywords left blank) |

## 2. Campaign description (paste as-is)

> Rentmaikar is a vehicle rental platform connecting rideshare drivers with vehicle
> owners in the United States and Nigeria. This campaign sends text messages only to
> users who created an account on rentmaikar.com and explicitly checked an optional
> SMS consent checkbox. Messages cover account and identity verification, rental
> application and approval status, vehicle pickup and inspection scheduling, payment
> reminders and receipts, agreement renewals, and customer support replies. A separate
> optional checkbox covers promotional messages about vehicle availability and offers.
> SMS consent is never a condition of creating an account, renting a vehicle, or using
> any Rentmaikar service.

## 3. Opt-in mechanism description (paste as-is)

> End users opt in on the Rentmaikar website at https://www.rentmaikar.com/auth,
> https://www.rentmaikar.com/driver-registration and
> https://www.rentmaikar.com/owner-registration, and on the standalone public opt-in
> page https://www.rentmaikar.com/sms-opt-in. During account creation and
> registration the user sees a dedicated "Text message (SMS) consent — optional"
> block containing two separate checkboxes, both unchecked by default and both
> independent of Terms acceptance: one for service/transactional SMS and one for
> promotional SMS. Consent is not a condition of purchase or service. Users can also
> opt in or out at any time from Profile Settings > SMS consent & preferences at
> https://www.rentmaikar.com/profile-settings. Every opt-in and opt-out is stored with
> the phone number, the exact disclosure text and version shown, the page it was
> captured from, the timestamp and the user agent.

## 4. Exact on-site checkbox wording (matches production)

Service SMS (optional, unchecked by default):

> I agree to receive text messages from Rentmaikar regarding my account, vehicle
> rentals, applications, reservations, payments, customer support and service updates.
> Message frequency varies. Message and data rates may apply. Reply STOP to opt out or
> HELP for help. Consent is not a condition of purchasing or using Rentmaikar services.
> See our Terms and Privacy Policy.

Promotional SMS (optional, unchecked by default):

> I would like to receive optional promotional text messages from Rentmaikar,
> including special offers, vehicle availability and rental opportunities. Message
> frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP
> for help.

Header shown above both checkboxes:

> Text message (SMS) consent — optional. SMS consent is optional and is not required
> to create an account, rent a vehicle, submit an application or use Rentmaikar services.

## 5. Sample messages (use 3–5)

1. `Rentmaikar: Your verification code is 481920. It expires in 10 minutes. Reply STOP to opt out, HELP for help.`
2. `Rentmaikar: Your driver application has been approved. Sign in at rentmaikar.com to complete your documents and pickup details. Reply STOP to opt out.`
3. `Rentmaikar: Your rental payment of $210.00 is due on Fri Aug 21. Pay at rentmaikar.com/payments. Msg&data rates may apply. Reply STOP to opt out.`
4. `Rentmaikar: Vehicle pickup confirmed for Sat Aug 22, 10:00 AM. Details: rentmaikar.com/dashboard. Reply STOP to opt out, HELP for help.`
5. `Rentmaikar: New vehicles are available in your city this week. See them at rentmaikar.com/catalogue. Reply STOP to opt out.` (promotional — sent only to promotional opt-ins)

## 6. Program keywords (published on /sms-opt-in and in the consent block)

| Keyword | Meaning | Reply |
|---|---|---|
| START | Re-subscribe after opting out | `Rentmaikar: You are re-subscribed to Rentmaikar text messages. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.` |
| STOP | Opt out of all Rentmaikar text messages | `Rentmaikar: You have been unsubscribed and will receive no further messages. Reply START to re-subscribe.` |
| HELP | Get support contact details | `Rentmaikar: For help email support@rentmaikar.com or visit rentmaikar.com/contact. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.` |

(Leave the opt-in keyword / opt-in message fields blank — opt-in is web-based. STOP/HELP/START are handled by Twilio Advanced Opt-Out.)

## 6b. Opt-in timing disclosure (published verbatim on /sms-opt-in)

- Consent takes effect immediately when the user checks the box and submits the form.
- Verification codes are sent within seconds of the user requesting one.
- Account, application, payment and rental service messages start as soon as the related
  event happens on the account — typically within minutes.
- Payment reminders are sent up to 72 hours before a due date, then at 12-hour intervals
  until the payment clears.
- Optional promotional messages are sent no more than a few times per month.
- Messages are only sent 9:00 AM - 9:00 PM ET (US) or 8:00 AM - 8:00 PM WAT (Nigeria),
  except for security/verification codes the user requested.
- Opting out takes effect immediately via STOP or Profile Settings.

## 7. Privacy Policy / Terms language already published

Both `/privacy` and `/terms` (USA and Nigeria variants) contain an "SMS / Text Message Program" section including:

> Rentmaikar does not sell, rent, or share mobile phone numbers or SMS consent
> information with third parties or affiliates for their own marketing or promotional
> purposes.

plus message frequency, message and data rates, STOP/HELP instructions, and how to withdraw consent.

## 8. Evidence to attach to the review

- Screenshot of the SMS consent block on `/driver-registration` (both checkboxes unchecked).
- Screenshot of `https://www.rentmaikar.com/sms-opt-in` showing the optional form, keywords and timing.
- Screenshot of `/profile-settings` SMS consent & preferences panel with consent history.
- Screenshot of the SMS section on `/privacy` and `/terms`.
- Optional: a row export from the consent audit log showing phone number, consent type,
  disclosure version, source page and timestamp.

## 9. Where this lives in the codebase

- Public opt-in page: `src/pages/SmsOptIn.tsx` (route `/sms-opt-in`, linked in the site footer)
- Keywords + timing block: `src/components/registration/SmsProgramDetails.tsx`
- Disclosure text + audit writer: `src/lib/sms-consent.ts`
- Registration/signup checkboxes: `src/components/registration/SmsConsentCheckboxes.tsx`
- Profile management + history: `src/components/profile/SmsConsentPanel.tsx`
- Audit table: `public.sms_consent_records`
- Disclosure version currently in production: `2026-08-14.v1`
