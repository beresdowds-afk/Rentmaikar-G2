RENTMAIKAR PLATFORM — PROVIDER, CHANNEL & INTEGRATION PRESERVATION RULES

File: "PLATFORM_PROVIDER_PRESERVATION.md"
Repository: "beresdowds-afk/Rentmaikar-G2"
Status: AUTHORITATIVE ARCHITECTURAL PRESERVATION RULE
Audience: AI Studio, coding agents, developers, reviewers, maintainers, and automated refactoring systems

---

1. PURPOSE

This document establishes a mandatory architectural preservation rule for the Rentmaikar platform.

Rentmaikar intentionally supports:

- multiple communication providers;
- multiple communication channels;
- multiple IoT providers;
- multiple GPS, tracking, telematics, and vehicle-data providers;
- multiple payment service providers;
- multiple payment rails and payment methods;
- multiple authentication and verification mechanisms;
- multiple routing and delivery adapters;
- multiple regional providers;
- provider-specific integrations;
- provider failover and fallback mechanisms;
- provider-specific webhooks and callbacks;
- backend bridges and gateway adapters;
- communication-specific subsystems;
- dormant, reserved, backup, regional, or future integrations.

These integrations are not accidental duplication.

They are part of the intended Rentmaikar architecture.

PRIMARY RULE

«AI Studio, AI coding agents, automated refactoring systems, and developers MUST NOT remove, consolidate, replace, bypass, disable, simplify, or reinterpret any provider, channel, adapter, router, webhook, integration, fallback, or communication mechanism merely because another provider or mechanism appears to perform a similar function.»

Functional overlap is intentional.

Architectural redundancy is intentional.

Provider diversity is intentional.

Regional specialization is intentional.

Fallback capability is intentional.

No component may be classified as redundant without explicit architectural authorization.

---

2. NON-NEGOTIABLE PRESERVATION DIRECTIVE

«PRESERVE ALL EXISTING PROVIDERS, CHANNELS, ADAPTERS, ROUTERS, FALLBACKS, WEBHOOKS, BRIDGES, INTEGRATIONS, AND PROVIDER-SPECIFIC LOGIC UNLESS THE OWNER OF THE PLATFORM EXPLICITLY AUTHORIZES THEIR REMOVAL OR REPLACEMENT.»

An AI agent MUST NOT infer that an integration is obsolete merely because:

- another provider currently handles the same function;
- the provider is not currently receiving traffic;
- the provider appears to duplicate another integration;
- the provider is configured for only one country or region;
- the provider appears unused during a static code scan;
- the provider is implemented behind an adapter;
- the provider is invoked dynamically;
- the provider is used by a webhook;
- the provider is used only during failover;
- the provider is reserved for future deployment;
- the provider is used by administrators/support staff;
- the provider is used by marketing;
- the provider is used by authentication;
- the provider is not currently enabled in production;
- the provider is temporarily dormant.

Absence of an obvious call site is NOT evidence that an integration is unnecessary.

---

3. WHY RENTMAIKAR USES MULTIPLE PROVIDERS

Rentmaikar is a multi-region rideshare vehicle rental and management platform.

Its operational environment includes:

- vehicle owners;
- drivers;
- administrators;
- support personnel;
- marketing personnel;
- operations personnel;
- payment operations;
- vehicle tracking;
- IoT/telematics;
- identity and verification;
- customer communication;
- emergency and operational communication.

A single provider cannot necessarily provide the required:

- geographical coverage;
- regulatory compatibility;
- pricing;
- reliability;
- channel availability;
- API capability;
- payment rails;
- IoT hardware compatibility;
- vehicle compatibility;
- tracking coverage;
- messaging capabilities;
- voice capabilities;
- webhook behavior;
- SLA;
- redundancy.

Therefore, provider diversity is an architectural requirement.

---

4. MULTIPLE COMMUNICATION PROVIDERS ARE INTENTIONAL

Rentmaikar may use more than one provider for:

- SMS;
- WhatsApp;
- voice;
- email;
- transactional messaging;
- OTP delivery;
- customer notifications;
- driver notifications;
- owner notifications;
- administrator notifications;
- support communications;
- marketing communications;
- inbound messaging;
- outbound messaging;
- automated responses;
- campaign messaging;
- call-center operations;
- WebRTC/softphone operations.

Two communication providers may perform apparently similar functions while serving completely different architectural purposes.

They MUST NOT be automatically consolidated.

---

5. COMMUNICATION CHANNELS ARE DISTINCT FROM COMMUNICATION PROVIDERS

AI systems MUST distinguish between:

CHANNEL

and:

PROVIDER

A channel is the communication medium.

A provider is the service responsible for delivering or receiving communication through that medium.

Examples of channels include:

SMS
WhatsApp
Email
Voice
WebRTC
In-App Messaging
Push Notification

A provider may implement one or more of these channels.

Therefore:

«Do not remove a communication channel merely because one provider already supports another channel.»

Similarly:

«Do not remove a provider merely because another provider supports the same channel.»

---

6. MULTIPLE IOT AND TRACKING PROVIDERS ARE INTENTIONAL

Rentmaikar may support multiple:

- GPS providers;
- IoT providers;
- telematics providers;
- tracking APIs;
- vehicle-device providers;
- fleet-management systems;
- MQTT/device systems;
- immobilization systems;
- diagnostic systems.

Different providers may support different:

- hardware;
- vehicles;
- countries;
- networks;
- protocols;
- device generations;
- tracking frequencies;
- data fields;
- pricing models;
- geographic coverage;
- operational use cases.

Therefore:

«An IoT or tracking provider MUST NOT be removed merely because another tracking provider exists.»

---

7. MULTIPLE PAYMENT SERVICE PROVIDERS ARE INTENTIONAL

Rentmaikar may integrate multiple payment service providers supporting:

- rental payments;
- security deposits;
- late fees;
- subscriptions;
- training;
- insurance;
- roadside assistance;
- IoT/device charges;
- owner payouts;
- refunds;
- regional payment methods;
- card payments;
- bank transfers;
- mobile money;
- wallets;
- other payment rails.

«No payment provider may be removed merely because another payment provider can process payments.»

---

8. PROVIDER ADAPTERS, ROUTERS, BRIDGES AND INTERCEPTORS

Provider abstractions are architectural assets.

Examples include:

CommunicationAdapter
PaymentAdapter
IoTAdapter
TrackingAdapter
EmailAdapter
SMSAdapter
WhatsAppAdapter
VoiceAdapter

Where an adapter, router, gateway, backend bridge, or catch-all interceptor exists, it MUST be inspected before modifying direct service calls.

In particular, whenever the following appears:

supabase.functions.invoke(...)

AI Studio MUST first determine whether the invocation is covered by:

- a catch-all interceptor;
- adapter;
- backend bridge;
- local gateway;
- request router;
- backend function proxy;
- provider adapter.

A call that appears to be a direct Supabase invocation may already be translated or intercepted.

---

9. WEBHOOKS AND CALLBACKS

Provider integrations may depend on:

- payment webhooks;
- email webhooks;
- SMS delivery webhooks;
- WhatsApp webhooks;
- voice callbacks;
- IoT event webhooks;
- tracking event webhooks;
- verification webhooks;
- authentication webhooks.

An outbound API call and its inbound webhook are separate components.

Neither may be removed without tracing the complete integration.

---

10. PROVIDER-SPECIFIC DATA AND IDENTIFIERS

Preserve provider-specific:

provider_id
external_id
transaction_id
message_id
delivery_id
call_id
device_id
tracking_id
webhook_id
customer_reference
merchant_reference
provider_reference
provider_status
provider_metadata

These may be necessary for reconciliation, support, debugging, retries, refunds, disputes, webhook matching, and audit trails.

---

11. INTEGRATION INVENTORY

The following inventory is an authoritative architectural register template.

It should be maintained as the platform evolves.

AI Studio MUST consult this inventory before removing, replacing, merging, bypassing, or substantially modifying an integration.

If an integration is not yet fully documented, its absence from the inventory MUST NOT be interpreted as authorization to remove it.

Instead, mark it:

Inventory Status: UNKNOWN / NEEDS DISCOVERY

and preserve it until verified.

---

12. INTEGRATION INVENTORY — MASTER TEMPLATE

Copy the following table and populate one row for every significant external integration.

ID| Category| Provider / Service| Integration / Adapter| Purpose| Channels / Functions| Region(s)| Environment(s)| Status| Primary / Fallback / Regional| Inbound / Outbound / Both| Backend Route| Frontend Usage| Webhooks / Callbacks| Env Vars / Secrets| Database Dependencies| External IDs| Replacement Candidate?| Preservation Criticality| Notes
INT-001| Communication| "<provider>"| "<adapter>"| "<purpose>"| "<SMS/WhatsApp/etc.>"| "<regions>"| "<dev/staging/prod>"| "<active/dormant>"| "<primary/fallback/regional>"| "<inbound/outbound/both>"| "<route>"| "<components>"| "<URLs/events>"| "<names only; never values>"| "<tables/columns>"| "<IDs>"| "<yes/no>"| "<critical/high/medium/low>"| "<notes>"
INT-002| IoT| "<provider>"| "<adapter>"| "<purpose>"| "<GPS/telemetry/etc.>"| "<regions>"| "<envs>"| "<status>"| "<role>"| "<direction>"| "<route>"| "<usage>"| "<callbacks>"| "<secret names>"| "<dependencies>"| "<IDs>"| "<yes/no>"| "<criticality>"| "<notes>"
INT-003| Tracking| "<provider>"| "<adapter>"| "<purpose>"| "<tracking functions>"| "<regions>"| "<envs>"| "<status>"| "<role>"| "<direction>"| "<route>"| "<usage>"| "<callbacks>"| "<secret names>"| "<dependencies>"| "<IDs>"| "<yes/no>"| "<criticality>"| "<notes>"
INT-004| Payment| "<provider>"| "<adapter>"| "<purpose>"| "<payment methods>"| "<regions>"| "<envs>"| "<status>"| "<role>"| "<direction>"| "<route>"| "<usage>"| "<webhooks>"| "<secret names>"| "<dependencies>"| "<IDs>"| "<yes/no>"| "<criticality>"| "<notes>"

INVENTORY RULE

Never put actual credentials, API keys, tokens, passwords, private keys, or secrets in this inventory.

Record only the name/location of the secret, for example:

STRIPE_SECRET_KEY
TWILIO_AUTH_TOKEN
PAYSTACK_SECRET_KEY

Never record the actual secret value.

---

13. PROVIDER INVENTORY TEMPLATE

Use this section when documenting each provider individually.

provider_id: "PROVIDER-XXX"

provider_name: "<provider name>"

category:
  - communication
  - payment
  - iot
  - tracking
  - authentication
  - email
  - sms
  - whatsapp
  - voice
  - other

services:
  - "<service>"

purpose: |
  <Explain why this provider exists.>

channels:
  - "<channel>"

functions:
  - "<function>"

regions:
  - "<country / region>"

environments:
  - development
  - staging
  - production

status:
  - active
  - dormant
  - fallback
  - regional
  - reserved
  - migration
  - unknown

routing_role:
  - primary
  - secondary
  - fallback
  - regional
  - specialized

traffic_direction:
  - inbound
  - outbound
  - bidirectional

frontend_dependencies:
  - "<component/path>"

backend_dependencies:
  - "<service/path>"

adapter:
  name: "<adapter name>"
  path: "<path>"

gateway:
  name: "<gateway/bridge name>"
  path: "<path>"

webhooks:
  - name: "<webhook>"
    route: "<route>"
    purpose: "<purpose>"

callbacks:
  - name: "<callback>"
    route: "<route>"
    purpose: "<purpose>"

environment_variables:
  - "<SECRET_NAME>"
  - "<CONFIG_NAME>"

database_dependencies:
  - "<table>"
  - "<column>"

provider_identifiers:
  - "<identifier type>"

fallback_relationships:
  primary_provider: "<provider>"
  fallback_providers:
    - "<provider>"

regional_relationships:
  regions:
    - "<region>"
  regional_provider: true

replacement:
  replacement_authorized: false
  replacement_provider: null
  migration_plan: null

preservation:
  criticality: critical
  removable_without_authorization: false
  mergeable_without_authorization: false
  bypassable_without_authorization: false

notes: |
  <Additional architectural information.>

---

14. COMMUNICATION INVENTORY TEMPLATE

Every communication provider/channel should be documented using:

communication_integration_id: "COMM-XXX"

provider: "<provider>"

provider_role:
  - primary
  - fallback
  - regional
  - specialized
  - legacy
  - reserved

channels:
  - sms
  - whatsapp
  - email
  - voice
  - webrtc
  - in_app
  - push
  - other

direction:
  - inbound
  - outbound
  - bidirectional

use_cases:
  - authentication
  - otp
  - transactional
  - support
  - marketing
  - operational
  - emergency

users:
  - customer
  - driver
  - owner
  - admin
  - support
  - operations

regions:
  - "<region>"

adapter: "<adapter>"

backend_route: "<route>"

webhook_routes:
  - "<route>"

callback_routes:
  - "<route>"

environment_variables:
  - "<SECRET_NAME>"

fallback_provider: "<provider or null>"

notes: |
  <Why this integration exists and what must not be changed.>

---

15. PAYMENT INVENTORY TEMPLATE

payment_integration_id: "PAY-XXX"

provider: "<provider>"

role:
  - collection
  - payout
  - refund
  - regional
  - fallback
  - specialized

payment_purposes:
  - rental
  - security_deposit
  - late_fee
  - subscription_training
  - subscription_insurance
  - subscription_roadside
  - iot_device
  - other

payment_methods:
  - card
  - bank_transfer
  - mobile_money
  - wallet
  - other

currencies:
  - "<currency>"

regions:
  - "<region>"

adapter: "<adapter>"

backend_route: "<route>"

webhooks:
  - "<webhook>"

environment_variables:
  - "<SECRET_NAME>"

database_dependencies:
  - "<table>"

provider_identifiers:
  - transaction_reference
  - customer_reference
  - payment_reference

fallback_provider: "<provider or null>"

reconciliation_required: true

refund_support: true

payout_support: false

preservation_criticality: critical

notes: |
  <Payment-specific architectural notes.>

---

16. IOT / TRACKING INVENTORY TEMPLATE

iot_tracking_integration_id: "IOT-XXX"

provider: "<provider>"

category:
  - gps
  - tracking
  - telematics
  - iot
  - immobilization
  - diagnostics
  - device_management

hardware:
  - "<device model>"
  - "<device family>"

vehicle_types:
  - "<vehicle type>"

data:
  - location
  - speed
  - ignition
  - mileage
  - battery
  - diagnostics
  - geofence
  - movement
  - tamper
  - immobilization
  - other

regions:
  - "<region>"

adapter: "<adapter>"

backend_route: "<route>"

webhooks:
  - "<webhook>"

environment_variables:
  - "<SECRET_NAME>"

database_dependencies:
  - "<table>"

device_identifiers:
  - device_id
  - tracker_id
  - vehicle_id
  - provider_vehicle_id

polling:
  enabled: true
  interval: "<interval>"

event_driven:
  enabled: true

fallback_provider: "<provider or null>"

preservation_criticality: critical

notes: |
  <IoT/tracking-specific notes.>

---

17. WEBHOOK INVENTORY

Every provider webhook should be independently recorded.

ID| Provider| Webhook| Route| Direction| Event Types| Authentication| Signature Verification| Consumer| Retry Behavior| Criticality| Status
WH-001| "<provider>"| "<name>"| "<route>"| Inbound| "<events>"| "<method>"| "<yes/no>"| "<service>"| "<strategy>"| Critical| Active
WH-002| "<provider>"| "<name>"| "<route>"| Inbound| "<events>"| "<method>"| "<yes/no>"| "<service>"| "<strategy>"| High| Active

WEBHOOK PRESERVATION RULE

«A webhook must be treated as an independent production dependency even if no obvious frontend code references it.»

---

18. CALLBACK INVENTORY

ID| Provider| Callback| Route / URL| Trigger| Consumer| Criticality| Status| Notes
CB-001| "<provider>"| "<callback>"| "<route>"| "<event>"| "<service>"| Critical| Active| "<notes>"
CB-002| "<provider>"| "<callback>"| "<route>"| "<event>"| "<service>"| High| Active| "<notes>"

---

19. ENVIRONMENT CONFIGURATION INVENTORY

Do not record secret values.

Record only configuration names and ownership.

Variable| Provider| Purpose| Used By| Environment| Secret?| Required?| Status
"<VARIABLE>"| "<provider>"| "<purpose>"| "<service>"| Production| Yes| Yes| Active
"<VARIABLE>"| "<provider>"| "<purpose>"| "<service>"| Staging| Yes| Yes| Active
"<VARIABLE>"| "<provider>"| "<purpose>"| "<service>"| Development| No| Optional| Active

RULE

An environment variable MUST NOT be deleted merely because a frontend search does not find it.

---

20. ROUTING INVENTORY

Document how provider traffic flows through the platform.

Route ID| Entry Point| Gateway / Bridge| Adapter| Provider| Channel| Region| Direction| Fallback| Status
ROUTE-001| "<entry>"| "<gateway>"| "<adapter>"| "<provider>"| SMS| "<region>"| Outbound| "<provider>"| Active
ROUTE-002| "<entry>"| "<gateway>"| "<adapter>"| "<provider>"| Payment| "<region>"| Outbound| "<provider>"| Active

---

21. DEPENDENCY MAP TEMPLATE

For each integration, document the dependency chain:

USER / SYSTEM EVENT
        │
        ▼
FRONTEND / BACKEND ENTRY POINT
        │
        ▼
SERVICE / DOMAIN LOGIC
        │
        ▼
GATEWAY / BRIDGE
        │
        ▼
ADAPTER
        │
        ▼
ROUTER
        │
        ├───────────────┐
        ▼               ▼
PRIMARY PROVIDER     FALLBACK PROVIDER
        │               │
        └───────┬───────┘
                ▼
        EXTERNAL SERVICE
                │
                ▼
        WEBHOOK / CALLBACK
                │
                ▼
        RENTMAIKAR BACKEND

The actual implementation may differ.

The purpose of this diagram is to prevent an AI agent from interpreting one layer as the entire integration.

---

22. PROVIDER RELATIONSHIP MATRIX

Use this matrix to document intentional overlap.

Capability| Provider A| Provider B| Provider C| Provider D| Reason for Multiple Providers
SMS| ✓| ✓| | | Regional coverage / failover
WhatsApp| ✓| | ✓| | Channel specialization
Email| | ✓| | ✓| Transactional / marketing separation
Voice| ✓| | ✓| | Telephony / redundancy
GPS| ✓| ✓| | | Hardware / regional coverage
Tracking| ✓| ✓| ✓| | Device compatibility
Card payments| ✓| ✓| | | Regional / fallback
Bank transfer| | ✓| ✓| | Local payment rails
Mobile money| | ✓| ✓| | Regional payment requirements

IMPORTANT

A checkmark in the same capability column does not indicate duplication that should be removed.

It indicates intentional provider overlap.

---

23. REGIONAL PROVIDER MATRIX

Region| Communication| Payment| IoT| Tracking| Voice| Email| Fallback Strategy
Nigeria| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<strategy>"
United States| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<strategy>"
Other| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<providers>"| "<strategy>"

This matrix exists specifically to prevent an AI system from assuming that the globally preferred provider is appropriate for every region.

---

24. FALLBACK MATRIX

Function| Primary| Secondary| Tertiary| Trigger| Automatic?| Manual Override?
SMS| "<provider>"| "<provider>"| "<provider>"| "<failure>"| Yes| Yes
Payment| "<provider>"| "<provider>"| "<provider>"| "<failure>"| Yes| Yes
GPS| "<provider>"| "<provider>"| "<provider>"| "<failure>"| Yes| Yes
Voice| "<provider>"| "<provider>"| "<provider>"| "<failure>"| Yes| Yes

---

25. INTEGRATION STATUS DEFINITIONS

Use the following controlled vocabulary.

ACTIVE

Currently expected to process production traffic.

DORMANT

Implemented but not currently processing normal traffic.

FALLBACK

Used when another provider fails or becomes unavailable.

REGIONAL

Used for a specific geographic market.

SPECIALIZED

Used for a specific function, hardware type, channel, or workflow.

RESERVED

Maintained for future activation or planned operational use.

MIGRATION

Participating in an ongoing provider migration.

LEGACY

Still required for existing functionality or historical compatibility.

UNKNOWN

Integration status has not yet been sufficiently established.

UNKNOWN integrations MUST be preserved.

---

26. INTEGRATION CRITICALITY

Use:

CRITICAL

Removing it can cause production outage, loss of money, loss of tracking, loss of communication, or loss of core platform capability.

HIGH

Removing it can significantly degrade a major workflow.

MEDIUM

Removal affects a secondary workflow.

LOW

Removal affects a non-critical or optional workflow.

Criticality MUST NOT be used to authorize removal.

It only indicates impact.

---

27. INVENTORY CHANGE LOG

Every inventory change should be recorded.

Date| Integration ID| Change| Previous State| New State| Reason| Authorized By| Code Change| Migration Required
"<date>"| "<ID>"| "<change>"| "<state>"| "<state>"| "<reason>"| "<owner>"| "<commit/PR>"| Yes/No

---

28. PROVIDER REMOVAL RECORD

If a provider is ever legitimately removed, retain a historical record.

removal_record:
  integration_id: "<ID>"
  provider: "<provider>"
  category: "<category>"

  removal_authorized: true

  authorized_by: "<platform owner>"

  authorization_date: "<date>"

  reason: |
    <explicit reason>

  replacement_provider: "<provider>"

  affected_regions:
    - "<region>"

  affected_channels:
    - "<channel>"

  affected_workflows:
    - "<workflow>"

  migration_completed: true

  rollback_available: true

  rollback_plan: |
    <rollback>

  final_commit: "<commit or PR>"

  final_status: removed

This record ensures that future AI agents understand that a provider was deliberately removed rather than accidentally omitted.

---

29. AI INVENTORY DISCOVERY PROCEDURE

When asked to modify or remove a provider-related integration, AI Studio should perform the following discovery sequence.

STEP 1 — Search the inventory

Search this document for:

provider name
service name
adapter name
route
webhook
environment variable
database table

STEP 2 — Search the repository

Search for:

provider name
SDK/package name
API hostname
adapter name
service name
webhook route
callback route
environment variable
provider-specific identifier

STEP 3 — Inspect architecture

Trace:

frontend
→ backend
→ gateway
→ bridge
→ adapter
→ router
→ provider
→ webhook/callback

STEP 4 — Inspect configuration

Check:

.env.example
deployment configuration
CI/CD
Cloud Run
Supabase
backend configuration
feature flags

STEP 5 — Determine provider role

Classify it as:

primary
fallback
regional
specialized
dormant
reserved
legacy
unknown

STEP 6 — Only then evaluate the requested modification.

---

30. AI REMOVAL SAFETY CHECK

Before removing an integration, AI Studio MUST be able to answer all of the following:

[ ] What provider is being removed?
[ ] What exact functionality does it provide?
[ ] What channels does it provide?
[ ] What regions depend on it?
[ ] What users depend on it?
[ ] Is it primary?
[ ] Is it fallback?
[ ] Is it regional?
[ ] Is it specialized?
[ ] Is it dormant?
[ ] Is it reserved?
[ ] What adapter represents it?
[ ] What backend routes reference it?
[ ] What frontend routes reference it?
[ ] What webhooks reference it?
[ ] What callbacks reference it?
[ ] What environment variables configure it?
[ ] What database structures reference it?
[ ] What external identifiers depend on it?
[ ] Does a catch-all interceptor cover it?
[ ] Does a backend bridge cover it?
[ ] Does another provider actually replace every capability?
[ ] Has removal been explicitly authorized?
[ ] Is there a migration plan?
[ ] Is there a rollback plan?

If any critical answer is unknown:

«DO NOT REMOVE THE INTEGRATION.»

---

31. FINAL PRESERVATION DIRECTIVE

The integration inventory exists to make architectural intent machine-readable.

It is not merely documentation.

It is a change-control boundary.

The following principle applies:

«If an integration exists but its purpose is not yet fully understood, preserve it and document the uncertainty. Do not delete it to make the codebase appear cleaner.»

The correct response to uncertainty is:

DISCOVER → DOCUMENT → VERIFY

not:

ASSUME → DELETE

---

32. FINAL AI STUDIO RULE

When an AI agent sees multiple providers performing similar functions, it MUST interpret the situation as:

POSSIBLE INTENTIONAL REDUNDANCY

rather than:

DUPLICATE CODE

until proven otherwise.

ABSOLUTE RULE

«NONE OF THE FOLLOWING MAY BE REMOVED, MERGED, BYPASSED, REPLACED, OR DISABLED WITHOUT EXPLICIT PLATFORM-OWNER AUTHORIZATION:»

- communication providers;
- communication channels;
- payment providers;
- payment rails;
- IoT providers;
- GPS providers;
- tracking providers;
- telematics providers;
- authentication providers;
- provider adapters;
- provider routers;
- backend bridges;
- gateways;
- catch-all interceptors;
- fallbacks;
- webhooks;
- callbacks;
- provider-specific configuration;
- provider-specific identifiers;
- provider-related database structures;
- regional provider integrations;
- dormant or reserved integrations.

«PRESERVE FIRST. SIMPLIFY ONLY WITH EXPLICIT AUTHORIZATION.»

---

33. INVENTORY MAINTENANCE PRINCIPLE

Whenever a new provider or integration is added, the inventory should be updated as part of the same change.

Whenever an integration changes role, its inventory record should be updated.

Whenever an integration is deliberately removed, a removal record should be retained.

The inventory should therefore remain a living architectural register.

---

34. INVENTORY OWNERSHIP

Inventory owner: "<Platform Owner / Architecture Owner>"

Technical owner: "<Technical Lead>"

Last reviewed: "<YYYY-MM-DD>"

Next review: "<YYYY-MM-DD>"

Inventory version: "1.0"

Repository: "beresdowds-afk/Rentmaikar-G2"

---

35. MASTER INVENTORY — START HERE

Populate this section as the authoritative high-level register.

ID| Category| Provider| Purpose| Region| Role| Status| Adapter| Backend| Webhook| Fallback| Criticality| Authorized Removal?
INT-001| Communication| "<provider>"| "<purpose>"| "<region>"| Primary| Active| "<adapter>"| "<service>"| "<webhook>"| "<provider>"| Critical| No
INT-002| Communication| "<provider>"| "<purpose>"| "<region>"| Fallback| Active| "<adapter>"| "<service>"| "<webhook>"| "<provider>"| High| No
INT-003| IoT| "<provider>"| "<purpose>"| "<region>"| Primary| Active| "<adapter>"| "<service>"| "<webhook>"| "<provider>"| Critical| No
INT-004| Tracking| "<provider>"| "<purpose>"| "<region>"| Regional| Active| "<adapter>"| "<service>"| "<webhook>"| "<provider>"| Critical| No
INT-005| Payment| "<provider>"| "<purpose>"| "<region>"| Primary| Active| "<adapter>"| "<service>"| "<webhook>"| "<provider>"| Critical| No
INT-006| Payment| "<provider>"| "<purpose>"| "<region>"| Fallback| Active| "<adapter>"| "<service>"| "<webhook>"| "<provider>"| Critical| No

---

36. FINAL STATEMENT

Rentmaikar's provider ecosystem is intentionally multi-provider and multi-channel.

The existence of multiple providers is an architectural capability that enables:

- resilience;
- redundancy;
- failover;
- regional operation;
- provider independence;
- channel diversity;
- hardware compatibility;
- payment flexibility;
- communication flexibility;
- operational continuity;
- future migration;
- disaster recovery;
- scalability.

Therefore:

DO NOT "CLEAN UP" THE PROVIDER ARCHITECTURE BY REMOVING THINGS THAT LOOK DUPLICATIVE.

DO NOT ASSUME ONE PROVIDER REPLACES ANOTHER.

DO NOT ASSUME AN UNUSED-LOOKING INTEGRATION IS OBSOLETE.

DO NOT REMOVE ANY INTEGRATION WITHOUT EXPLICIT AUTHORIZATION.

WHEN IN DOUBT, PRESERVE IT AND ADD IT TO THE INVENTORY.

---

END OF "PLATFORM_PROVIDER_PRESERVATION.md"