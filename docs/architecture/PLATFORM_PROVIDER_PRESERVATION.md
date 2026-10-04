RENTMAIKAR PLATFORM — PROVIDER, CHANNEL & INTEGRATION PRESERVATION RULES

File: "PLATFORM_PROVIDER_PRESERVATION.md"
Repository: "beresdowds-afk/Rentmaikar-G2"
Branch: "main"
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

The following rule has the highest priority when modifying Rentmaikar:

«PRESERVE ALL EXISTING PROVIDERS, CHANNELS, ADAPTERS, ROUTERS, FALLBACKS, WEBHOOKS, BRIDGES, INTEGRATIONS, AND PROVIDER-SPECIFIC LOGIC UNLESS THE OWNER OF THE PLATFORM EXPLICITLY AUTHORIZES THEIR REMOVAL OR REPLACEMENT.»

An AI agent MUST NOT infer that an integration is obsolete merely because:

- another provider currently handles the same function;
- the provider is not currently receiving traffic;
- the provider is not referenced from an obvious frontend component;
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
- the provider is used by a backend service rather than the frontend;
- the provider is represented by configuration rather than an obvious function call;
- the provider is not currently enabled in production;
- the provider is temporarily dormant.

Absence of an obvious call site is NOT evidence that an integration is unnecessary.

---

3. WHY RENTMAIKAR USES MULTIPLE PROVIDERS

Rentmaikar is a multi-region rideshare vehicle rental and management platform.

Its operational environment includes:

- United States operations;
- Nigerian operations;
- potentially additional African markets;
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

Rentmaikar may use more than one provider for communication services.

Communication providers may support:

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
- WebRTC/softphone operations;
- provider-specific delivery mechanisms.

Examples of communication-provider roles may include, but are not limited to:

- CPaaS providers;
- SMS providers;
- WhatsApp providers;
- email providers;
- voice/telephony providers;
- authentication messaging providers;
- marketing messaging providers;
- specialized regional providers.

IMPORTANT

Two communication providers may perform apparently similar functions while serving completely different architectural purposes.

For example:

Provider A
    ↓
SMS delivery

Provider B
    ↓
WhatsApp delivery

Provider C
    ↓
Voice / telephony

Provider D
    ↓
Email

Provider E
    ↓
Regional or fallback communication

They MUST NOT be automatically consolidated.

---

5. COMMUNICATION CHANNELS ARE DISTINCT FROM COMMUNICATION PROVIDERS

AI systems MUST distinguish between:

CHANNEL

and:

PROVIDER

A channel is the communication medium.

A provider is the service responsible for delivering or receiving communication through that medium.

For example:

SMS
WhatsApp
Email
Voice
WebRTC
In-App Messaging
Push Notification

are channels.

A provider may implement one or more of those channels.

Therefore:

«Do not remove a communication channel merely because one provider already supports another channel.»

Similarly:

«Do not remove a provider merely because another provider supports the same channel.»

---

6. REQUIRED COMMUNICATION CHANNEL PRESERVATION

The architecture must preserve the ability to support multiple communication channels, including where implemented:

6.1 SMS

Used for:

- OTP;
- authentication;
- driver communication;
- owner communication;
- operational alerts;
- payment notifications;
- emergency notifications;
- transactional messages;
- support communication;
- marketing where legally permitted.

6.2 WhatsApp

Used for:

- customer communication;
- driver communication;
- owner communication;
- support;
- notifications;
- conversational workflows;
- marketing where legally permitted;
- automated responses.

6.3 Email

Used for:

- transactional messages;
- account communication;
- support;
- inbound communication;
- outbound communication;
- attachments;
- administrative notifications;
- operational communication;
- marketing.

Inbound and outbound email MUST remain architecturally distinct.

6.4 Voice / Telephony

Used for:

- customer support;
- driver support;
- owner support;
- call-center operations;
- inbound calls;
- outbound calls;
- IVR;
- call routing;
- active-call management;
- softphone/WebRTC operation.

6.5 In-App Messaging

Used for:

- support;
- operational communication;
- system messages;
- driver-owner communication;
- administrative communication;
- conversation history;
- automated responses.

6.6 WebRTC / Softphone

Where implemented, this is a communication mechanism and MUST NOT be removed merely because a conventional telephone integration also exists.

6.7 Push / Other Channels

If present in the repository, these MUST also be preserved.

---

7. INBOUND AND OUTBOUND COMMUNICATION MUST NOT BE COLLAPSED

Rentmaikar distinguishes between:

INBOUND

and:

OUTBOUND

communication.

This distinction is architectural.

Inbound communication can originate from:

- email;
- SMS;
- WhatsApp;
- voice;
- support channels;
- in-app messaging;
- external communication providers.

Outbound communication can originate from:

- application events;
- administrators;
- support agents;
- marketing workflows;
- automation;
- transactional events;
- authentication;
- payment events;
- vehicle events.

RULE

«Do not merge inbound and outbound pipelines merely because both ultimately produce messages.»

Inbound communication may require:

- webhook processing;
- identity resolution;
- thread matching;
- attachment processing;
- conversation creation;
- autoresponders;
- routing;
- escalation;
- support assignment.

Outbound communication may require:

- template selection;
- provider selection;
- channel selection;
- delivery;
- retry;
- delivery status;
- compliance checks;
- campaign handling.

---

8. MESSAGE CENTRE PRESERVATION

If the repository contains a Message Centre or Communication Centre, its role MUST be preserved.

The Message Centre may unify the user-facing presentation of multiple communication types without eliminating their underlying provider-specific architecture.

Conceptually:

                 MESSAGE CENTRE
                       │
        ┌──────────────┼──────────────┐
        │              │              │
       SMS          WhatsApp         Email
        │              │              │
     Provider A     Provider B     Provider C

The UI may present these as a unified conversation system.

That does NOT mean the underlying providers should be unified into one provider.

---

9. CALL CENTRE PRESERVATION

If the repository contains a Call Centre, Voice Centre, Communication Hub, Unified Telephone Card, softphone, WebRTC, Twilio Voice, or related voice infrastructure:

«Preserve the entire voice architecture unless explicitly instructed otherwise.»

This includes:

- voice access tokens;
- voice devices;
- call state;
- active call management;
- call answering;
- call termination;
- IVR;
- TwiML or equivalent provider instructions;
- callback URLs;
- provider webhooks;
- call records;
- presence;
- softphone state;
- WebRTC state;
- inbound calls;
- outbound calls.

A conventional telephone provider and a browser-based softphone are NOT necessarily duplicates.

---

10. MULTIPLE IOT PROVIDERS ARE INTENTIONAL

Rentmaikar may support multiple IoT and telematics providers.

These can include:

- GPS providers;
- vehicle tracking providers;
- telematics providers;
- IoT device providers;
- vehicle diagnostic providers;
- immobilization providers;
- fleet management providers;
- hardware manufacturers;
- device communication providers;
- MQTT-based systems;
- GPS APIs;
- third-party tracking APIs.

WHY MULTIPLE IOT PROVIDERS MAY EXIST

Different providers may support:

- different hardware;
- different vehicle models;
- different countries;
- different networks;
- different protocols;
- different device generations;
- different tracking frequencies;
- different battery requirements;
- different pricing;
- different data fields;
- different reliability levels;
- different geographic coverage;
- different operational use cases.

Therefore:

«An IoT provider MUST NOT be removed merely because another tracking provider exists.»

---

11. TRACKING DATA MUST NOT BE ASSUMED TO COME FROM ONE SOURCE

The platform may receive:

GPS location
Vehicle status
Ignition state
Speed
Mileage
Battery state
Device status
Geofence events
Movement events
Tamper events
Diagnostic information
Immobilization state
Telemetry

from different providers or devices.

AI systems MUST NOT assume that:

one vehicle = one provider = one device = one data source

The actual architecture may be:

Vehicle
   │
   ├── IoT Device A
   │       └── Provider A
   │
   ├── IoT Device B
   │       └── Provider B
   │
   └── Native / External Data
           └── Provider C

This is valid and may be intentional.

---

12. MULTIPLE PAYMENT SERVICE PROVIDERS ARE INTENTIONAL

Rentmaikar may integrate multiple payment service providers (PSPs).

These may support:

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

Examples of provider roles may include:

PSP A
PSP B
PSP C
Bank / Payment Rail
Wallet Provider
Regional Payment Provider
Payout Provider

RULE

«No payment provider may be removed merely because another payment provider can process payments.»

---

13. PAYMENT PROVIDER SELECTION MUST REMAIN FLEXIBLE

Payment routing may depend on:

- country;
- currency;
- payment method;
- transaction type;
- customer;
- owner;
- driver;
- merchant;
- settlement requirements;
- payout requirements;
- transaction value;
- provider availability;
- provider fees;
- provider status;
- regulatory requirements.

Therefore the architecture should permit:

Transaction
     │
     ▼
Payment Adapter
     │
     ├── Provider A
     ├── Provider B
     ├── Provider C
     └── Regional Provider

The existence of multiple adapters is intentional.

---

14. PAYMENT PURPOSES MUST NOT BE COLLAPSED

Where implemented, the following payment purposes must remain distinguishable:

rental
security_deposit
late_fee
subscription_training
subscription_insurance
subscription_roadside
iot_device
other

AI systems MUST NOT replace these with a generic:

payment

unless explicitly instructed.

Different payment purposes may require:

- different providers;
- different accounting;
- different authorization;
- different refunds;
- different reconciliation;
- different notifications;
- different settlement rules.

---

15. OWNER PAYOUTS MUST REMAIN DISTINCT FROM CUSTOMER PAYMENTS

Customer payment collection and owner payout are not necessarily the same operation.

Conceptually:

Customer
   │
   ▼
Payment Collection
   │
   ▼
Rentmaikar
   │
   ▼
Owner Payout

A payment provider used for collection does not automatically replace a provider or backend process used for payouts.

Provider-specific payout architecture MUST be preserved.

---

16. REGIONAL PROVIDERS MUST NOT BE REMOVED

Rentmaikar operates across different geographical markets.

A provider may exist specifically because of:

- Nigeria;
- United States;
- DMV region;
- local payment rails;
- local communication requirements;
- local telecommunications;
- regional regulations;
- regional pricing;
- regional device availability.

Therefore:

«A provider that appears unnecessary in one region may be essential in another region.»

AI Studio MUST inspect regional routing before removing any provider.

---

17. FAILOVER AND REDUNDANCY ARE FEATURES

Redundancy is not technical waste.

For mission-critical operations, multiple providers may provide:

Primary
   ↓
Fallback
   ↓
Secondary fallback

or:

Provider A ─┐
Provider B ─┼──> Routing / Adapter
Provider C ─┘

This may protect against:

- provider outage;
- API failure;
- rate limits;
- regional outage;
- account suspension;
- network failure;
- pricing changes;
- provider deprecation;
- regulatory changes;
- provider-specific defects.

RULE

«Do not remove fallback providers simply because the primary provider currently works.»

---

18. DORMANT PROVIDERS MUST BE PRESERVED

A provider may currently appear inactive because:

- it is not enabled in the current environment;
- it is a fallback;
- production traffic is currently routed elsewhere;
- credentials are not currently configured;
- a feature is not currently active;
- the provider is reserved for a region;
- the provider is awaiting commercial activation;
- the provider is being retained for migration;
- it is required for disaster recovery.

Therefore:

«Inactive does not mean obsolete.»

No dormant integration may be deleted without explicit authorization.

---

19. CONFIGURATION DOES NOT MEAN UNUSED

Provider configuration may exist in:

.env
.env.example
GitHub Actions secrets
Cloud Run environment variables
Supabase secrets
backend configuration
frontend configuration
provider configuration objects
database tables
feature flags
routing tables
adapter registries

An AI agent MUST inspect configuration and dependency relationships before concluding that a provider is unused.

---

20. PROVIDER ADAPTERS ARE ARCHITECTURAL ASSETS

Where the platform contains an adapter pattern, preserve it.

Examples:

CommunicationAdapter
PaymentAdapter
IoTAdapter
TrackingAdapter
EmailAdapter
SMSAdapter
WhatsAppAdapter
VoiceAdapter

Adapters permit the platform to change providers without rewriting the entire application.

The desired architecture is:

Application
     │
     ▼
Domain Adapter
     │
     ├── Provider A
     ├── Provider B
     └── Provider C

NOT:

Application
     │
     └── Hard-coded Provider A

AI Studio MUST NOT replace an abstraction layer with direct provider calls simply because doing so appears shorter.

---

21. CATCH-ALL INTERCEPTORS AND ROUTERS MUST BE PRESERVED

Rentmaikar contains or may contain catch-all routing/adapter mechanisms designed to intercept or translate calls.

These mechanisms are especially important when evaluating:

supabase.functions.invoke(...)

MANDATORY REVIEW RULE

Whenever AI Studio or a developer encounters:

supabase.functions.invoke(...)

the system MUST FIRST determine whether the function call is already covered by:

- a catch-all interceptor;
- adapter;
- backend bridge;
- local gateway;
- request router;
- backend function proxy;
- provider adapter;
- communication gateway.

DO NOT ASSUME

The following assumption is prohibited:

supabase.functions.invoke(...)
        ↓
direct Supabase dependency
        ↓
must be removed

Instead:

supabase.functions.invoke(...)
        ↓
Check interceptor / adapter
        ↓
Covered?
   ┌────┴────┐
  YES        NO
   │          │
preserve     investigate
existing     routing
architecture

A call that appears to be a direct Supabase invocation may already be translated or intercepted.

---

22. BACKEND BRIDGE ARCHITECTURE MUST BE PRESERVED

Where the platform uses a backend bridge, gateway, or operational gateway, AI systems MUST NOT bypass it.

The intended architecture may include:

rentmaikar.com
      │
      ▼
rentmaikar-g2
      │
      ▼
BACKEND_URL
      │
      ▼
rentmaikar-backend
      │
      ├── Communication Providers
      ├── Payment Providers
      ├── IoT Providers
      ├── Tracking Providers
      └── Other Services

The frontend MUST NOT be converted to direct provider calls merely to simplify code.

---

23. FRONTEND PROVIDER ACCESS MUST BE REVIEWED BEFORE MODIFICATION

Before changing frontend service calls, inspect:

1. gateway;
2. bridge;
3. adapter;
4. interceptor;
5. routing layer;
6. backend endpoint;
7. provider adapter;
8. webhook;
9. authentication;
10. environment configuration.

Only after this chain has been understood should a provider-related call be modified.

---

24. WEBHOOKS ARE FIRST-CLASS ARCHITECTURAL COMPONENTS

Provider integrations may depend on webhooks.

Examples include:

payment webhook
email webhook
SMS delivery webhook
WhatsApp webhook
voice callback
IoT event webhook
tracking event webhook
verification webhook
authentication webhook

A webhook MUST NOT be removed because the corresponding outbound API call still exists.

Outbound and inbound provider communication are separate flows.

---

25. CALLBACK URLs MUST BE PRESERVED

Provider callback URLs may be required for:

- voice;
- payment;
- email;
- SMS;
- WhatsApp;
- IoT;
- tracking;
- verification.

Changing or deleting a callback can silently break production even if the frontend builds successfully.

Therefore:

«Never delete or alter provider callback routes without tracing their external provider configuration.»

---

26. PROVIDER-SPECIFIC DATA MUST NOT BE DESTROYED

Different providers may return different schemas.

Do not assume:

Provider A response
=
Provider B response

Provider-specific fields may be required.

Normalize data at the adapter/domain boundary while preserving provider-specific information where necessary.

Preferred:

Provider Response
       │
       ▼
Provider Adapter
       │
       ▼
Normalized Domain Model
       │
       ├── provider_id
       ├── provider_reference
       ├── provider_status
       ├── provider_metadata
       └── domain fields

Do not discard provider references merely because they are not immediately displayed.

---

27. PROVIDER IDENTIFIERS MUST BE PRESERVED

Provider-specific identifiers can include:

provider_id
external_id
transaction_id
message_id
delivery_id
call_id
device_id
vehicle_device_id
tracking_id
webhook_id
customer_reference
merchant_reference

These may be necessary for:

- reconciliation;
- support;
- debugging;
- refunds;
- dispute handling;
- webhook matching;
- retries;
- provider API calls;
- audit trails.

Do not remove them merely because Rentmaikar has its own internal IDs.

---

28. COMMUNICATION ROUTING MUST REMAIN DATA-DRIVEN

Do not hard-code provider selection unless the existing architecture explicitly requires it.

Provider selection may depend on:

country
region
channel
message type
user role
transaction type
provider health
provider availability
provider capability
cost
fallback state
configuration

Prefer routing rules and adapters over hard-coded assumptions.

---

29. DO NOT REPLACE MULTI-PROVIDER ARCHITECTURE WITH A SINGLE "BEST" PROVIDER

An AI agent may be tempted to conclude:

«"Provider X already does everything, so Providers Y and Z can be removed."»

This conclusion is prohibited unless explicitly authorized.

The platform may intentionally maintain several providers because:

- Provider X is primary;
- Provider Y is fallback;
- Provider Z is regional;
- Provider A supports another channel;
- Provider B supports another payment rail;
- Provider C supports legacy devices;
- Provider D supports a different operational workflow.

The correct architecture may therefore look redundant.

That redundancy is intentional.

---

30. DO NOT REMOVE INTEGRATIONS BASED ONLY ON STATIC SEARCH

A static search showing no obvious invocation is insufficient evidence.

Before removing an integration, inspect:

direct references
dynamic imports
configuration
environment variables
adapter registries
routing tables
webhooks
callbacks
scheduled jobs
background workers
database records
feature flags
backend services
Cloud Run configuration
GitHub Actions
Supabase functions
provider dashboards/configuration

If external configuration cannot be verified, the integration must be treated as potentially active.

---

31. DO NOT REMOVE DATABASE STRUCTURES SUPPORTING PROVIDERS

Provider-related tables, columns, enums, records, and metadata may appear unused.

They may support:

- provider selection;
- provider health;
- routing;
- reconciliation;
- historical records;
- migration;
- fallback;
- audit;
- regional configuration.

Do not delete provider-related database structures without an explicit migration plan and authorization.

---

32. DO NOT REMOVE ENVIRONMENT VARIABLES

An environment variable that appears unused in frontend source code may be consumed by:

- backend;
- Cloud Run;
- Edge Function;
- CI/CD;
- webhook handler;
- worker;
- provider adapter;
- scheduled process.

Do not delete environment variables merely because a local code search does not reveal an obvious use.

---

33. DO NOT REMOVE CI/CD SECRETS

Provider credentials and configuration may be injected through:

GitHub Actions secrets
Cloud Run secrets
Supabase secrets
deployment environment variables

A secret not visible in source code is not evidence that the provider is unused.

---

34. SECURITY DOES NOT JUSTIFY PROVIDER REMOVAL

Security improvements are encouraged.

However:

«Improve the security of an integration rather than deleting the integration merely because it requires security hardening.»

Examples:

BAD:
Remove provider because its key is exposed.

GOOD:
Move provider key to secure backend secret storage.

BAD:
Remove webhook because verification is weak.

GOOD:
Add signature verification and replay protection.

---

35. DO NOT MOVE PROVIDER CREDENTIALS TO THE FRONTEND

Where a provider requires secret credentials:

Frontend
   ↓
Backend Gateway
   ↓
Provider

is preferred over:

Frontend
   ↓
Secret Provider Credential
   ↓
Provider

Provider integrations should remain behind the appropriate backend security boundary.

---

36. COMMUNICATION, MARKETING, AND TRANSACTIONAL MESSAGING MUST REMAIN DISTINGUISHABLE

Rentmaikar may have different communication engines for:

Transactional communication

Examples:

- OTP;
- payment confirmation;
- rental confirmation;
- account notification;
- operational alert.

Support communication

Examples:

- customer support;
- driver support;
- owner support;
- inbound conversations.

Marketing communication

Examples:

- campaigns;
- promotional SMS;
- WhatsApp campaigns;
- email campaigns.

These may share providers while using different routing, permissions, templates, and workflows.

Do not collapse them simply because they use the same transport.

---

37. AUTHENTICATION COMMUNICATION MUST BE PRESERVED

Authentication and verification may depend on communication providers.

This can include:

- phone verification;
- OTP;
- account confirmation;
- recovery communication;
- identity verification notifications.

The authentication communication path must not be replaced with an unrelated messaging implementation without explicit authorization.

---

38. OTP ARCHITECTURE MUST NOT BE SIMPLIFIED WITHOUT REVIEW

Where Rentmaikar uses its own OTP generation/verification architecture, do not automatically replace it with a provider-native OTP mechanism.

Before changing OTP:

1. inspect the OTP generator;
2. inspect verification;
3. inspect storage;
4. inspect expiration;
5. inspect retry rules;
6. inspect rate limits;
7. inspect communication provider routing;
8. inspect backend bridge;
9. inspect audit logs.

---

39. PROVIDER HEALTH AND OBSERVABILITY MUST BE PRESERVED

Multi-provider systems require visibility into provider health.

Preserve:

- logs;
- status;
- errors;
- delivery status;
- provider response codes;
- retry information;
- provider latency;
- webhook events;
- transaction references;
- call references;
- device references.

Do not remove observability simply because the provider integration "works."

---

40. PROVIDER FAILURES MUST NOT BE HIDDEN

An adapter should not silently turn all provider failures into generic success responses.

Where appropriate, preserve:

provider
operation
status
error code
error message
request reference
external reference
retry status
fallback status

This information is important for operations and support.

---

41. RETRIES AND FALLBACKS MUST BE PRESERVED

Provider calls may use:

retry
backoff
fallback
secondary provider
dead-letter handling
manual retry

Do not remove retry/fallback mechanisms during refactoring.

A shorter implementation is not necessarily a better implementation.

---

42. NO "CLEANUP" WITHOUT ARCHITECTURAL PROOF

The following phrases are NOT sufficient justification for removing an integration:

- "unused";
- "duplicate";
- "redundant";
- "legacy";
- "unnecessary";
- "can be simplified";
- "another service already handles this";
- "not imported anywhere";
- "not currently used";
- "not needed for MVP";
- "we can add it later";
- "the new provider replaces it."

Before removal, there must be explicit architectural evidence and authorization.

---

43. REQUIRED PRE-REMOVAL INVESTIGATION

Before removing any provider, channel, adapter, router, webhook, or integration, AI Studio MUST answer:

A. What does it provide?

B. Which channels does it support?

C. Which regions does it support?

D. Which users or roles depend on it?

E. Is it primary, secondary, fallback, regional, legacy, or reserved?

F. Is it referenced through an adapter?

G. Is it referenced dynamically?

H. Does it have a webhook?

I. Does it have an external callback?

J. Does it have environment configuration?

K. Does it have database configuration?

L. Does it participate in CI/CD?

M. Does another provider actually replace every one of its functions?

N. Is its replacement explicitly authorized?

If these questions cannot be answered, DO NOT REMOVE THE INTEGRATION.

---

44. REQUIRED CHANGE PROTOCOL

Any proposed provider removal or replacement MUST be presented as:

PROVIDER CHANGE PROPOSAL

Provider:
Role:
Channels:
Regions:
Current consumers:
Backend routes:
Frontend routes:
Adapters:
Webhooks:
Environment variables:
Database dependencies:
Fallback relationships:
Replacement provider:
Functional equivalence:
Migration impact:
Rollback plan:
Authorization required:

No provider should be deleted without this analysis.

---

45. PRESERVE THE EXISTING ARCHITECTURE BEFORE OPTIMIZING IT

The correct order of work is:

1. DISCOVER
2. DOCUMENT
3. UNDERSTAND
4. VERIFY
5. TEST
6. OPTIMIZE

NOT:

1. SEARCH
2. ASSUME
3. DELETE
4. REPLACE

---

46. AI STUDIO MODIFICATION RULE

When AI Studio is asked to repair, refactor, modernize, optimize, simplify, or migrate Rentmaikar code:

AI STUDIO MUST:

- inspect existing architecture first;
- preserve provider diversity;
- preserve channel diversity;
- preserve routing;
- preserve adapters;
- preserve bridges;
- preserve fallbacks;
- preserve webhooks;
- preserve callbacks;
- preserve configuration;
- preserve provider-specific data;
- preserve regional behavior;
- preserve backend boundaries;
- preserve authentication and verification;
- preserve communication workflows;
- preserve payment workflows;
- preserve IoT/tracking workflows.

AI STUDIO MUST NOT:

- consolidate providers automatically;
- replace multiple providers with one provider;
- remove "duplicate" integrations;
- remove dormant providers;
- remove regional providers;
- remove fallback providers;
- bypass adapters;
- bypass backend bridges;
- expose provider secrets;
- hard-code provider selection;
- delete provider webhooks;
- delete provider callbacks;
- delete provider configuration;
- delete provider-specific IDs;
- delete provider-related database structures;
- assume static code search proves an integration is unused.

---

47. "DO NOT INVENT" AND "DO NOT REMOVE"

AI Studio must follow two simultaneous principles:

DO NOT INVENT

Do not invent:

- new providers;
- new routing rules;
- new credentials;
- new phone numbers;
- new email addresses;
- new payment providers;
- new communication providers;
- new IoT providers;
- new tracking providers.

DO NOT REMOVE

Do not remove:

- existing providers;
- existing channels;
- existing routing;
- existing adapters;
- existing fallbacks;
- existing webhooks;
- existing callbacks;
- existing provider configuration;
- existing provider-specific functionality.

The repository is the source of truth for what currently exists.

---

48. PRESERVE PROVIDER-AGNOSTIC DOMAIN LOGIC

Business logic should not become dependent on one provider unnecessarily.

Preferred:

Rental
   ↓
Payment Service
   ↓
Payment Adapter
   ↓
Provider

instead of:

Rental
   ↓
Provider X API

Similarly:

Notification
   ↓
Communication Service
   ↓
Channel Adapter
   ↓
Provider

and:

Vehicle
   ↓
Tracking Service
   ↓
Tracking Adapter
   ↓
IoT Provider

This separation is deliberate.

---

49. PROVIDER SWITCHING IS AN ARCHITECTURAL CAPABILITY

The platform should be capable, where supported by its existing architecture, of changing providers without rewriting core business logic.

Therefore:

Provider abstraction
+
Provider adapter
+
Provider-specific implementation

is preferable to provider-specific business logic spread throughout the application.

Do not flatten this architecture for convenience.

---

50. TESTING REQUIREMENT

Any change affecting providers must test more than compilation.

At minimum, where applicable:

lint
typecheck
unit tests
integration tests
production build
provider adapter tests
routing tests
webhook tests
authentication tests
communication tests
payment tests
IoT/tracking tests
deployment tests

A successful build does not prove that provider architecture has been preserved.

---

51. PRODUCTION DEPLOYMENT REQUIREMENT

Before deploying changes involving providers:

Verify:

Frontend
   ↓
rentmaikar-g2
   ↓
BACKEND_URL
   ↓
rentmaikar-backend
   ↓
Provider Adapter
   ↓
External Provider

Where applicable.

Do not assume that local development behavior represents production routing.

---

52. DNS AND GATEWAY PRESERVATION

Provider-related communication should continue through the established production gateway architecture.

Do not change DNS, gateway routing, Cloud Run routing, or backend routing merely to simplify provider access.

Any infrastructure change must preserve:

- public frontend behavior;
- admin access;
- backend routing;
- provider callbacks;
- webhook reachability;
- authentication;
- communication delivery.

---

53. EXTERNAL PROVIDER CONFIGURATION IS PART OF THE ARCHITECTURE

The source repository may not contain the complete configuration for an external provider.

External systems may contain:

- webhook URLs;
- callback URLs;
- phone numbers;
- domains;
- sender identities;
- API applications;
- payment configurations;
- device registrations;
- IoT configurations;
- routing rules.

Therefore:

«Repository code alone is not always sufficient evidence that an integration is unused.»

---

54. DOCUMENTATION IS NOT A SUBSTITUTE FOR IMPLEMENTATION

This document protects existing architecture.

It does not authorize an AI system to create placeholder providers merely because the documentation mentions them.

Only preserve providers and integrations actually present in the repository, configuration, infrastructure, or established architecture.

---

55. WHEN IN DOUBT, PRESERVE

The default decision rule is:

Is this provider/channel/integration definitely unnecessary
AND
has its removal been explicitly authorized?

        YES → removal may be considered
        NO  → PRESERVE

The burden of proof is on removal.

Not preservation.

---

56. ARCHITECTURAL PRINCIPLE

Rentmaikar is not designed around:

«"one provider per function."»

It is designed around:

«"multiple interchangeable, complementary, regional, specialized, and fallback providers connected through controlled adapters and routing."»

This is a feature of the platform.

---

57. FINAL AI STUDIO DIRECTIVE

When modifying Rentmaikar, treat the following as protected architectural assets:

┌─────────────────────────────────────────────┐
│ COMMUNICATION PROVIDERS                     │
├─────────────────────────────────────────────┤
│ SMS                                         │
│ WhatsApp                                    │
│ Email                                       │
│ Voice                                       │
│ WebRTC / Softphone                          │
│ In-App Messaging                            │
│ Marketing Communication                     │
│ Transactional Communication                 │
│ Support Communication                       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ IOT / TRACKING                              │
├─────────────────────────────────────────────┤
│ GPS Providers                               │
│ IoT Providers                               │
│ Telematics Providers                        │
│ Tracking APIs                               │
│ Vehicle Devices                             │
│ MQTT / Device Communication                 │
│ Device-Specific Integrations                │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ PAYMENTS                                    │
├─────────────────────────────────────────────┤
│ Payment Service Providers                   │
│ Payment Rails                               │
│ Regional Payment Providers                  │
│ Collection Providers                        │
│ Payout Providers                            │
│ Payment Adapters                            │
│ Payment Webhooks                            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ ARCHITECTURAL CONTROL                       │
├─────────────────────────────────────────────┤
│ Backend Gateway                             │
│ Backend Bridge                              │
│ Provider Adapters                           │
│ Catch-All Interceptors                      │
│ Routing                                     │
│ Failover                                    │
│ Webhooks                                    │
│ Callbacks                                   │
│ Configuration                               │
│ Provider IDs                                │
│ Regional Routing                            │
│ Observability                               │
└─────────────────────────────────────────────┘

ABSOLUTE RULE

«NONE OF THE ABOVE MAY BE REMOVED, MERGED, BYPASSED, REPLACED, OR DISABLED BY AI STUDIO OR ANY AUTOMATED CODING AGENT WITHOUT EXPLICIT AUTHORIZATION FROM THE PLATFORM OWNER.»

---

58. REQUIRED PRE-COMMIT CHECK

Before committing any change that touches communication, payment, IoT, tracking, authentication, or provider-related code, the agent must confirm:

[ ] No provider was removed.
[ ] No communication channel was removed.
[ ] No payment provider was removed.
[ ] No IoT provider was removed.
[ ] No tracking provider was removed.
[ ] No fallback was removed.
[ ] No adapter was bypassed.
[ ] No gateway was bypassed.
[ ] No webhook was removed.
[ ] No callback was removed.
[ ] No provider-specific identifier was removed.
[ ] No provider environment variable was removed.
[ ] No provider secret was moved to the frontend.
[ ] No regional routing was removed.
[ ] No inbound communication path was collapsed into outbound.
[ ] No outbound communication path was collapsed into inbound.
[ ] No communication channel was confused with a provider.
[ ] No payment purpose was collapsed unnecessarily.
[ ] Every supabase.functions.invoke(...) encountered was checked
    against the existing catch-all interceptor/adapter.
[ ] Existing backend bridge routing remains intact.
[ ] Existing production gateway routing remains intact.
[ ] Tests/build still pass.

---

59. FINAL AUTHORIZATION RULE

Only the platform owner may authorize a deliberate architectural reduction.

A valid authorization must identify:

WHAT is being removed
WHY it is being removed
WHAT replaces it
WHICH regions are affected
WHICH channels are affected
WHICH users are affected
WHICH integrations are affected
HOW migration will occur
HOW rollback will occur

Until that authorization exists:

PRESERVE THE EXISTING ARCHITECTURE.

---

END OF PRESERVATION SPECIFICATION

Rentmaikar principle:

«Redundancy is not duplication when it provides resilience, regional coverage, provider independence, channel diversity, operational continuity, or future interoperability.»

«Do not simplify away capabilities merely because they are not obvious from a single code path.»

«Inspect first. Understand the routing. Preserve the architecture. Change only with authorization.»