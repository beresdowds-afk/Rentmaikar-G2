Account Creation and Verification Rules

Purpose

Define the mandatory account creation and verification workflow for the RentMaikar platform.

This specification applies to all user types unless explicitly overridden by platform policy.

---

1. Account Creation Sources

User accounts may be created through:

- Public user registration portals
- Administrator-created accounts
- Invitation-based registration
- Business onboarding workflows
- API-based account creation (future)

Regardless of the source, every account must follow the same verification rules.

---

2. Email Verification

Email verification is mandatory whenever an email address is associated with an account.

This applies equally to:

- Self-registered users
- Administrator-created users
- Business accounts
- Drivers
- Vehicle owners
- Fleet managers
- Corporate administrators

Until the email address is verified, the account shall remain in an Email Pending Verification state, with access limited according to platform policy.

---

3. Phone Number Verification

Phone number verification is required whenever a phone number is provided during registration or later added to an account.

Verification shall be performed using a One-Time Password (OTP) delivered by SMS or another approved communication channel.

If no phone number is provided during registration, phone verification is not required at that stage. However, once a phone number is added, verification must be completed before the number is considered trusted.

---

4. Relationship to Persona Verification

Email verification and phone verification are preliminary contact verification mechanisms.

They do not replace Persona identity verification.

Persona verification remains the authoritative identity validation process for users who require regulated identity checks.

A user may therefore have:

- Verified email
- Verified phone number
- Persona verification pending

These are separate verification states and must be tracked independently.

---

5. Persona Verification

Persona verification shall remain responsible for validating identity documents and regulated identity information, including:

- Government-issued identification
- Driver's licence verification
- Passport verification
- Selfie and liveness verification
- Business identity verification (where applicable)
- Regulatory compliance checks

Completion of email or phone verification must never automatically mark Persona verification as complete.

---

6. Driver Referee Verification

Driver referee verification is an onboarding and trust assessment process.

It must not:

- Create user accounts
- Activate user accounts
- Replace email verification
- Replace phone verification
- Replace Persona verification

Driver referee verification may only begin after a valid user account exists.

---

7. Payment Proxy Verification

Payment proxy verification validates a trusted individual or organisation that may make payments on behalf of a driver or customer.

It shall not:

- Create user accounts
- Activate accounts
- Replace email verification
- Replace phone verification
- Replace Persona verification

Payment proxy verification is an optional operational workflow that occurs only after account creation.

---

8. Verification Status Model

Each account shall maintain independent verification states, including:

- Email Verification
- Phone Verification
- Persona Verification
- Driver Referee Verification (where applicable)
- Payment Proxy Verification (where applicable)

Each status shall be stored and managed independently so that completing one verification does not automatically complete another.

---

9. Access Control

Platform permissions may depend on verification status.

Examples include:

- Limited access before email verification
- Additional functionality after phone verification
- Driver onboarding requiring Persona verification
- Vehicle rental eligibility requiring successful identity validation

Verification requirements should be enforced according to business policy for each user role and transaction type.

---

10. Guiding Principle

Account creation establishes a platform identity.

Email verification and phone verification confirm communication channels.

Persona verification confirms legal identity.

Driver referee verification establishes professional trust.

Payment proxy verification establishes financial delegation.

These are distinct processes and must remain independent while contributing to the platform's overall trust and security model.
