RentMaikar Routing, Bridge, Adapter & Interceptor Architecture

Repository: "beresdowds-afk/Rentmaikar-G2"
Branch: "main"
Path: "docs/architecture/ROUTING_BRIDGE_ADAPTER_ARCHITECTURE.md"
Status: Architectural Authority / Preservation Document
Scope: Existing routing, bridge, adapter, interceptor, controller, gateway, ingress and provider-selection mechanisms

---

1. Purpose

This document defines the roles, responsibilities, boundaries and relationships of the existing routers, bridges, adapters, interceptors, controllers, gateways and provider-selection services in RentMaikar.

Its primary purpose is architectural preservation.

It is not permission to redesign, consolidate, replace, remove or simplify existing routing mechanisms.

RentMaikar contains multiple communication channels, providers, execution engines, regional configurations and architectural boundaries. Components that appear to perform similar functions may nevertheless exist at different architectural layers and therefore must not be treated as duplicates.

The following principle is mandatory:

«A component must not be removed, consolidated, bypassed or replaced merely because another component appears to perform a related function. Its architectural boundary, callers, callees, exports, routing role, provider relationships, fallback behavior and security responsibilities must first be established.»

---

2. Architectural Authority

This document operates within the wider RentMaikar architecture.

The current architectural authority hierarchy is:

1. "architectureRule.md"
2. "CommunicationArchitecture.md"
3. "ROUTING_BRIDGE_ADAPTER_ARCHITECTURE.md"
4. "INTEGRATION_INVENTORY.md"
5. "PLATFORM_PROVIDER_PRESERVATION.md"
6. Component-specific responsibility and provider documents

Where a component-specific implementation detail conflicts with a higher-level architectural rule, the conflict must be investigated rather than silently resolved by deleting or bypassing the component.

---

3. Core Architectural Principle

RentMaikar uses several distinct mechanisms:

- Router
- Bridge
- Adapter
- Interceptor
- Controller
- Gateway
- Webhook/Ingress Router
- Provider Selector
- Service
- Queue
- Provider

These terms are architectural classifications, not interchangeable naming conventions.

A router does not automatically replace a bridge.

A bridge does not automatically replace an adapter.

An adapter does not automatically replace a provider.

A controller does not automatically replace a router.

A gateway does not automatically replace a backend service.

A webhook ingress router does not automatically replace an outbound communication router.

A service that performs provider failover does not necessarily replace the higher-level router that selected the communication capability.

---

4. Definitions

4.1 Router

A router determines where an operation should go based on capability, channel, region, recipient, provider configuration, operational state, routing strategy or another defined routing criterion.

Examples include:

- CPaaS routing
- call receiver assignment
- backend function dispatch
- webhook event classification
- inbound email routing

A router may select a service, provider, operator, execution engine or processing path.

---

4.2 Bridge

A bridge crosses an architectural boundary between otherwise separate systems or layers.

Examples include:

- frontend ↔ backend communication bridge
- backend bridge RPC layer
- MQTT telemetry bridge
- Traccar telemetry bridge
- backend email bridge
- inbound email webhook boundary

A bridge should not be removed merely because the systems on either side can technically communicate without it.

The bridge may provide:

- authentication
- retry behavior
- state management
- reconciliation
- protocol translation
- security boundaries
- observability
- failure handling
- compatibility
- controlled entry points

---

4.3 Adapter

An adapter translates one interface or provider-specific implementation into an interface expected by another layer.

Examples include:

- TwiML telephony adapter
- Softphone adapter
- Server REST telephony adapter
- SAREKON location adapter
- marketing provider adapters

Adapters preserve provider or execution-engine differences while allowing higher layers to operate through a common interface.

---

4.4 Interceptor

An interceptor transparently observes, captures, redirects or augments an existing call before or instead of the original implementation.

The RentMaikar Supabase invocation interceptor is particularly important.

The existence of:

supabase.functions.invoke(...)

does not by itself establish a direct browser-to-Supabase execution path.

The interceptor must be examined first.

---

4.5 Controller

A controller coordinates execution and may select among multiple execution engines or adapters.

The "TelephonyController" is an example.

It is not equivalent to the call assignment router.

---

4.6 Gateway

A gateway is a controlled architectural entry point through which requests cross into another service or system.

The RentMaikar operational backend gateway is a distinct architectural concept from the internal backend routers and services behind it.

---

4.7 Webhook / Ingress Router

An ingress router receives external events and determines how they should be classified and processed.

This is fundamentally different from an outbound router.

Examples include:

- provider webhook routing
- inbound email routing
- SENT.dm inbound-message classification

---

5. Canonical Routing Model

The following conceptual model must be preserved:

User / Browser / Mobile Client
            |
            v
   Frontend Gateway / Bridge
            |
            v
     Backend API Entry
            |
            +----------------------+
            |                      |
            v                      v
    Function Router          Capability Router
            |                      |
            v                      v
       Backend Service       Provider / Channel
            |                      |
            v                      v
       External System       Provider Adapter

This is a conceptual model only.

It does not authorize restructuring the actual implementation into this exact sequence.

Some existing paths intentionally bypass one or more layers because they serve different architectural purposes.

---

6. Current Frontend Backend Bridge

Implementation

Primary implementation:

src/lib/backend-bridge.ts

Responsibility

The frontend backend bridge provides resilient communication between the RentMaikar frontend and backend infrastructure.

It manages backend connectivity states including:

- "DIRECT"
- "STAGING_FALLBACK"
- "RECONNECTING"
- "OFFLINE"

It provides controlled invocation and recovery behavior rather than exposing every frontend component directly to backend infrastructure.

Important Responsibilities

The bridge may provide:

- backend endpoint invocation
- retry behavior
- connectivity detection
- staging fallback
- reconciliation
- bridge state management
- backend function invocation
- controlled administrative communication
- loss-of-contact handling

Relationship

Conceptually:

Frontend
   |
   v
src/lib/backend-bridge.ts
   |
   v
rentmaikar-g2 operational gateway
   |
   v
rentmaikar-backend

The staging environment remains an administrative/fallback path and must not be silently promoted to the public operational path.

---

7. Backend Bridge Router

Implementation

backend/src/routes/bridge.ts

Supporting Component

backend/src/services/bridgeManager.ts

Responsibility

The backend bridge router exposes controlled bridge/RPC operations.

Existing bridge operations include functions such as:

- "/call"
- "/listen"
- "/respond"
- "/reconcile"

and bridge actions including:

- health
- domains
- ping
- CPaaS simulation
- diagnostics
- custom operations

Relationship

Frontend Backend Bridge
        |
        v
Backend Bridge Router
        |
        v
BridgeManager
        |
        v
Backend / External Systems

The backend bridge router and the frontend backend bridge are related but are not the same component.

---

8. Supabase Functions Invocation Interceptor

Implementation

src/integrations/supabase/client.ts

Governing Rule

supabase-functions-invoke-interceptor-rule.md

Responsibility

The interceptor modifies the effective execution path of:

supabase.functions.invoke(...)

It must therefore be treated as an architectural routing mechanism.

For configured local gateway functions, invocation can be redirected to:

/api/functions/:functionName

Other invocations may initially use the original Supabase invocation and then use local gateway/backend fallback behavior when the configured failure conditions occur.

Mandatory Interpretation Rule

«Never classify a "supabase.functions.invoke(...)" call as a direct frontend-to-Supabase call until the interceptor in "src/integrations/supabase/client.ts" and the governing interceptor rule have been examined.»

This rule applies to:

- human developers
- AI coding agents
- automated refactoring tools
- architecture auditors
- migration tools

---

9. Backend Functions Router

Implementation

backend/src/routes/functions.ts

Responsibility

The backend functions router provides controlled dispatch for backend function calls.

It exposes routes including:

/api/functions/:functionName
/functions/:functionName
/functions/v1/:functionName

It maintains:

AUTHORITATIVE_BACKEND_FUNCTIONS

Authoritative backend functions are handled by backend/local implementations.

Non-authoritative functions may be proxied to Supabase Edge Functions according to the existing implementation.

Architectural Role

This is a function-dispatch router/gateway.

It is not merely an Express route collection.

It establishes an important boundary between:

Frontend invocation
        |
        v
Local Backend Function Gateway
        |
        +---- authoritative backend implementation
        |
        +---- Supabase Edge Function proxy

---

10. CPaaS Router

Frontend Implementation

src/services/cpaasRouterService.ts

Exports:

cpaasRouter

Responsibility

The frontend CPaaS router handles communication-provider and communication-capability selection.

Relevant capabilities include:

- SMS
- WhatsApp
- RCS
- provider overrides
- regional provider configuration
- failover
- SENT.dm
- Twilio
- Termii

Important Rule

The CPaaS router must not be confused with the backend CPaaS router.

---

11. Backend CPaaS Router

Implementation

backend/src/routes/cpaas.ts

Exports:

cpaasRouter

Responsibility

Provides backend CPaaS API entry points, including:

/api/cpaas/send

The current backend implementation uses the backend SENT.dm client.

Relationship

The frontend and backend CPaaS routers occupy different layers:

Frontend CPaaS Router
        |
        v
Backend API / CPaaS Router
        |
        v
Backend Communication Service
        |
        v
Provider

They must not be merged merely because both are named "cpaasRouter".

---

12. SMS Service and Provider Failover

Implementation

backend/src/services/smsService.ts

Responsibility

The SMS service is an operational communication service with provider failover.

Current provider relationships include:

- SENT.dm
- Twilio
- Termii

Regional configuration is resolved through the platform's communication-provider configuration.

Architectural Role

This service is not simply another router.

It performs provider execution and failover.

Conceptually:

Capability / Channel Routing
        |
        v
SMS Service
        |
        +---- SENT.dm
        |
        +---- Twilio
        |
        +---- Termii

The existence of provider failover here must be preserved.

---

13. Call Queue

Implementation

src/hooks/useCallQueue.ts

Responsibility

The call queue determines the order and priority in which calls should be considered for assignment.

It incorporates information such as:

- "voip_calls"
- "voice_call_requests"
- caller identity
- region
- urgency
- FIFO ordering
- realtime updates
- polling fallback

Classification

The call queue is a call ordering/queue layer.

It is not the same as:

- call router
- telephony controller
- telephony adapter
- telephony provider

---

14. Call Router

Implementation

src/hooks/useCallRouter.ts

Responsibility

The call router manages assignment of calls to available human/operator receivers.

Responsibilities include:

- available receiver discovery
- routing strategy
- longest-idle assignment
- FIFO assignment
- regional matching
- receiver status
- ring timeout
- call assignment logging
- chime behavior

Classification

This is a call assignment router.

It answers:

«Which eligible receiver/operator should receive this call?»

It does not answer:

«Which telephony provider or execution engine should technically establish the call?»

That responsibility belongs elsewhere.

---

15. Telephony Controller

Implementation

src/lib/telephony/TelephonyController.ts

Responsibility

The Telephony Controller coordinates the technical execution of a call and selects among available execution mechanisms.

Existing execution mechanisms include:

SoftphoneAdapter
ServerRestAdapter
TwiMLAdapter

The controller also coordinates:

- call start
- call end
- reconciliation
- canonical active-session state

Classification

The Telephony Controller is an execution controller, not the call-assignment router.

---

16. Telephony Adapters

The current telephony adapter layer includes:

src/lib/telephony/adapters/TwiMLAdapter.ts
src/lib/telephony/adapters/SoftphoneAdapter.ts
src/lib/telephony/adapters/ServerRestAdapter.ts

Responsibility

Each adapter provides a distinct execution mechanism behind the telephony controller.

TwiML Adapter

Uses the backend bridge for relevant backend/voice operations.

Softphone Adapter

Provides softphone/WebRTC-oriented execution.

Server REST Adapter

Provides server-side REST-based execution.

Mandatory Preservation Rule

These adapters must not be collapsed simply because they all establish or control calls.

They represent different execution paths.

---

17. Backend Email Bridge

Implementation

The backend email bridge is implemented through the backend function-routing layer and its authenticated internal bridge mechanism.

Relevant implementation:

backend/src/routes/functions.ts

The authoritative backend function list includes:

send-outbound-email

The route uses:

X-RentMaikar-Internal-Secret

validated against:

RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET

and the authenticated internal email bridge mechanism.

Responsibility

The backend email bridge provides a trusted server-to-server boundary for outbound platform email.

It must remain distinct from:

- inbound email routing
- Cloudflare email ingress
- Resend inbound processing
- generic CPaaS routing
- frontend direct email delivery

---

18. Outbound Email Architecture

Outbound Email Service

Implementation:

backend/src/services/emailService.ts

The service handles outbound email delivery and related platform email functions.

The configured outbound identity is:

notify.rentmaikar.com

The service integrates with Resend and handles concerns including:

- sender normalization
- reply-to preservation
- delivery logging
- delivery status
- transactional email generation
- authentication-related email handling

Canonical Outbound Path

The intended architectural relationship is:

Frontend
   |
   v
Backend Bridge
   |
   v
Backend Functions Router
   |
   v
send-outbound-email
   |
   v
Authenticated Internal Email Bridge
   |
   v
Email Service
   |
   v
Resend
   |
   v
notify.rentmaikar.com
   |
   v
Recipient

This is an outbound path.

---

19. Inbound Email Architecture

Inbound email is intentionally separate from outbound email.

The inbound infrastructure uses:

backend.rentmaikar.com

and the Cloudflare email routing infrastructure.

Relevant implementation includes:

cloudflare/email-router/src/worker.js

The worker handles email ingress concerns including:

- MIME parsing
- sender extraction
- recipient extraction
- subject extraction
- body extraction
- header extraction
- attachment handling
- signed webhook payload creation
- webhook delivery
- fallback handling

Canonical Inbound Relationship

External Sender
       |
       v
backend.rentmaikar.com
       |
       v
Cloudflare Email Routing
       |
       v
Cloudflare Email Worker
       |
       v
Signed Webhook
       |
       v
Backend Inbound Email Processing
       |
       v
Inbound Email Service
       |
       v
Message Centre / Unified Inbox

Mandatory Separation Rule

«Inbound email and outbound email must not be collapsed into a single routing path.»

"backend.rentmaikar.com" and "notify.rentmaikar.com" have different architectural purposes.

---

20. Webhook Router

Implementation

backend/src/routes/webhooks.ts

Responsibility

The webhook router provides provider-specific ingress routes.

Existing integrations include webhook handling for providers such as:

- SENT.dm
- Twilio
- PayPal
- Paystack
- OPay
- Persona
- Termii

The SENT.dm webhook path also distinguishes inbound communication events from delivery/status events.

Classification

This is an external event ingress/classification router.

It must not be confused with outbound messaging routing.

---

21. MQTT Bridge

Implementation

src/services/mqttBridge.ts

Responsibility

The MQTT bridge crosses between MQTT/IoT telemetry and RentMaikar's internal orchestration.

It is a true architectural bridge because it crosses a transport/system boundary.

It must remain distinct from:

- EMQX itself
- Traccar
- SAREKON
- vehicle business logic
- map services

---

22. Traccar Bridge

Implementation

src/services/traccarBridge.ts

Responsibility

The Traccar bridge translates or transfers Traccar tracking information into RentMaikar's internal orchestration.

Traccar is the tracking-server ecosystem.

The bridge is the integration boundary.

These are different architectural objects.

---

23. SAREKON Integration

Relevant implementations include:

supabase/functions/_shared/sarekon-client.ts
supabase/functions/_shared/location-adapters/sarekon.ts
backend/src/services/sarekonService.ts
src/services/sarekonAutoSyncService.ts
supabase/functions/sarekon-location-worker/
supabase/functions/sarekon-admin/

Responsibilities

SAREKON-related components support functions including:

- device synchronization
- device linking
- location
- fleet scanning
- telemetry
- vehicle association
- worker processing

Architectural Rule

SAREKON must not be treated as synonymous with:

- Traccar
- EMQX
- MQTT
- Hologram
- OpenStreetMap

These systems occupy different architectural responsibilities.

---

24. Marketing Router and Provider Adapters

Backend Router

backend/src/routes/marketing.ts

Exports:

marketingRouter

Provider Adapters

Existing provider integrations include adapters for systems such as:

- Meta
- Google Ads
- TikTok Ads
- LinkedIn
- SENT.dm
- Resend
- Twilio
- ManyChat

Classification

Marketing Router
       |
       v
Marketing Service / Capability
       |
       +---- Provider Adapter
       +---- Provider Adapter
       +---- Provider Adapter

Provider adapters must not be mistaken for marketing routers.

---

25. Payment Gateway / Provider Selection

Implementation

src/lib/payment-gateway.ts

Responsibility

The payment gateway provides regional and capability-based payment provider selection.

Existing provider relationships include:

- PayPal
- Paystack
- OPay

Classification

This is a payment gateway/provider-selection mechanism.

It must not be assumed to be interchangeable with:

- CPaaS router
- backend function router
- webhook router
- payment provider itself

---

26. Portal Router

Implementation

backend/src/routes/portal.ts

Responsibility

The portal router provides administrative portal functions including:

- authentication/session handling
- invitations
- bridge control
- bridge testing
- allowed-origin control
- auto-disconnect
- platform health

Classification

This is an administrative control router.

It must not be confused with the operational communication routers.

---

27. Relationship Between Major Routing Components

The following matrix defines the intended distinction.

Component| Primary Question Answered| Classification
"backend-bridge.ts"| How does the frontend communicate with backend infrastructure?| Frontend bridge
"bridge.ts"| How are bridge/RPC operations exposed?| Backend bridge router
"bridgeManager.ts"| How is bridge state/control managed?| Bridge manager
"client.ts" interceptor| Should/where should a Supabase function invocation actually execute?| Interceptor
"functions.ts"| Which backend implementation should handle a function invocation?| Function router
"cpaasRouterService.ts"| Which communication capability/provider path should be selected?| CPaaS router
"cpaas.ts"| Where does a backend CPaaS request enter?| Backend API router
"smsService.ts"| Which SMS provider should execute/fail over?| Communication service
"useCallQueue.ts"| Which call should be handled next?| Queue
"useCallRouter.ts"| Which receiver/operator should receive the call?| Call assignment router
"TelephonyController.ts"| Which technical telephony execution mechanism should be used?| Controller
"TwiMLAdapter.ts"| How is TwiML-based telephony executed?| Adapter
"SoftphoneAdapter.ts"| How is softphone execution performed?| Adapter
"ServerRestAdapter.ts"| How is server REST telephony executed?| Adapter
Backend email bridge| How is trusted server-side outbound email communication crossed?| Specialized bridge
"emailService.ts"| How is outbound email delivered?| Service
Cloudflare email worker| How is inbound email transformed and delivered internally?| Ingress router/adapter
"webhooks.ts"| How are external provider events classified?| Webhook router
"mqttBridge.ts"| How does MQTT telemetry enter internal orchestration?| Bridge
"traccarBridge.ts"| How does Traccar data enter internal orchestration?| Bridge
SAREKON adapters/services| How is SAREKON integrated?| Provider/integration adapters/services
"marketing.ts"| Where do marketing operations enter the backend?| Marketing router
Marketing provider adapters| How is each marketing provider implemented?| Adapters
"payment-gateway.ts"| Which payment provider/path is appropriate?| Gateway/provider selector
"portal.ts"| How are administrative portal operations controlled?| Admin router

---

28. Communication Routing Layers

RentMaikar communication should be understood as multiple layers rather than one universal router.

                    COMMUNICATION
                         |
          +--------------+--------------+
          |              |              |
         Email           SMS         Voice/Call
          |              |              |
      +---+---+          |          +---+---+
      |       |          |          |       |
   Inbound Outbound   CPaaS       Queue  Router
      |       |          |          |       |
 Cloudflare  Email    SMS Service  |   Receiver
 Worker      Service      |          |   Assignment
      |       |           |          |
      |     Resend     Providers    |
      |                              |
 Message Centre                Telephony
                                  |
                              Controller
                                  |
                       +----------+----------+
                       |          |          |
                    Softphone   REST       TwiML

This is a conceptual representation.

It does not authorize changing existing implementation paths.

---

29. Provider Selection and Failover

Provider selection may occur at different layers.

Examples:

Frontend CPaaS routing
        |
        v
Backend CPaaS entry
        |
        v
Communication service
        |
        +---- Primary provider
        |
        +---- Fallback provider

A provider's existence as a fallback does not make it redundant.

A regional provider configuration does not make a global provider redundant.

A specialized provider does not become removable merely because another provider supports the same nominal channel.

---

30. Regional Routing

RentMaikar operates across multiple geographic markets.

Routing may therefore depend on:

- country
- region
- capability
- provider availability
- provider configuration
- operational status
- fallback rules
- regulatory requirements
- recipient characteristics

AI agents must not replace regional provider selection with a single global provider without architectural review.

---

31. Security Boundaries

Routing and bridging components may also exist to enforce security boundaries.

Examples include:

- authenticated backend bridges
- internal email bridge secrets
- allowed-origin checks
- backend-only provider credentials
- controlled webhook ingress
- frontend/backend separation

Security-bearing routing components must not be removed during refactoring merely because the underlying provider API can technically be called directly.

---

32. Authentication of the Backend Email Bridge

The outbound email bridge contains an internal authentication boundary.

The relevant mechanism includes:

X-RentMaikar-Internal-Secret

validated against:

RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET

Successful authentication establishes trusted server-side email bridge access.

This boundary must be preserved.

Frontend code must not bypass it by directly implementing privileged server-side email delivery.

---

33. No Direct Provider Credential Leakage

Provider credentials and privileged provider operations must remain behind their intended backend boundary.

The presence of a provider adapter does not authorize exposing its credentials to browser code.

AI agents must distinguish:

frontend routing metadata

from:

server-side provider credentials

and:

server-side provider execution

---

34. No Silent Router Consolidation

The following types of changes are prohibited without explicit architectural review:

- merging frontend and backend routers
- replacing a bridge with a direct provider call
- deleting an adapter because another adapter exists
- deleting a fallback provider because another provider is primary
- moving provider credentials to the frontend
- replacing inbound email with outbound email logic
- bypassing the backend email bridge
- replacing call assignment with telephony execution
- replacing call queue logic with call router logic
- replacing telephony adapters with a single provider implementation
- replacing the Supabase interceptor with direct invocation
- removing webhook classification because a provider service already exists
- removing SAREKON because Traccar exists
- removing Traccar because MQTT exists
- removing MQTT because EMQX exists
- treating Hologram as a substitute for telematics/tracking systems
- treating OpenStreetMap as a substitute for tracking or telemetry systems

---

35. Mandatory Supabase Invocation Procedure

Whenever an AI agent encounters:

supabase.functions.invoke(...)

it must perform the following sequence.

Step 1 — Locate the invocation

Identify:

- function name
- caller
- calling layer
- expected operation

Step 2 — Inspect the interceptor

Inspect:

src/integrations/supabase/client.ts

Step 3 — Check the governing rule

Inspect:

supabase-functions-invoke-interceptor-rule.md

Step 4 — Determine routing coverage

Determine whether the invocation is:

1. intercepted locally,
2. routed through "/api/functions/:functionName",
3. handled by an authoritative backend function,
4. proxied to Supabase,
5. subject to local-gateway fallback,
6. subject to backend-bridge fallback,
7. or genuinely direct.

Step 5 — Only then classify the invocation

Do not label it:

«“direct frontend Supabase call”»

until the above analysis establishes that classification.

---

36. Mandatory AI-Agent Preservation Rules

AI agents working on RentMaikar must obey the following rules.

Rule 1 — Inspect Before Changing

Inspect the current repository implementation before proposing routing changes.

---

Rule 2 — Preserve Existing Boundaries

Do not collapse components merely because they appear similar.

---

Rule 3 — Trace Callers and Callees

Before removing or replacing a component, establish:

- who calls it
- what it calls
- what it exports
- what depends on it
- which providers it controls
- which fallbacks it provides
- which security boundary it establishes

---

Rule 4 — Preserve Provider Diversity

Existing providers may represent:

- primary provider
- secondary provider
- fallback provider
- regional provider
- specialized provider
- reserved provider
- migration provider

Do not infer redundancy from provider similarity.

---

Rule 5 — Preserve Incoming and Outgoing Paths

Inbound and outbound communication are separate architectural flows.

This is especially mandatory for email.

---

Rule 6 — Preserve Authentication Boundaries

Do not bypass backend authentication, internal bridge secrets, webhook validation or origin controls merely to simplify routing.

---

Rule 7 — Do Not Rename Away Architectural Meaning

A component's name does not determine its architectural role.

Inspect its actual implementation.

---

Rule 8 — Do Not Create a Universal Router

RentMaikar intentionally contains multiple routing layers.

A new universal router must not be introduced merely to make the code appear simpler.

---

Rule 9 — Do Not Delete Unknown Components

If a component's role is unclear:

UNKNOWN ≠ REDUNDANT

Investigate it.

---

Rule 10 — Document Architectural Conflicts

If implementation and documentation disagree, document the discrepancy and investigate it.

Do not silently rewrite either side.

---

37. Change-Control Procedure

Before changing any routing, bridge, adapter or interceptor:

1. Identify the component

Record its exact repository path.

2. Identify its classification

Determine whether it is:

- router
- bridge
- adapter
- interceptor
- controller
- gateway
- queue
- service
- webhook router
- provider

3. Trace upstream callers

Determine which components depend on it.

4. Trace downstream dependencies

Determine what it invokes.

5. Identify providers

Determine all providers and fallback providers involved.

6. Identify security boundaries

Determine whether credentials, authentication, signatures, secrets or origin controls are involved.

7. Check architecture documents

At minimum inspect:

architectureRule.md
CommunicationArchitecture.md
ROUTING_BRIDGE_ADAPTER_ARCHITECTURE.md
INTEGRATION_INVENTORY.md
PLATFORM_PROVIDER_PRESERVATION.md

and any component-specific responsibility document.

8. Check the Supabase interceptor rule when applicable

For every:

supabase.functions.invoke(...)

follow the mandatory invocation procedure.

9. Test all affected paths

Testing must include relevant:

- primary paths
- fallback paths
- regional paths
- authentication paths
- inbound paths
- outbound paths
- provider paths

10. Only then modify

No architectural component should be removed or bypassed before this procedure is completed.

---

38. Relationship to Communication Architecture

This document complements:

CommunicationArchitecture.md

The communication architecture defines the wider system relationship between communication, connectivity, telematics, tracking, mapping and RentMaikar Core.

This document defines the implementation-level routing and boundary mechanisms used to connect those responsibilities.

The two documents must not be treated as competing architectures.

---

39. Relationship to Provider Preservation

This document must be read together with:

PLATFORM_PROVIDER_PRESERVATION.md

The routing architecture identifies where providers participate.

The preservation policy defines when existing providers and integrations may be removed or replaced.

Together they establish:

Routing role
      +
Provider role
      +
Preservation requirement

---

40. Relationship to Integration Inventory

This document identifies architectural routing mechanisms.

INTEGRATION_INVENTORY.md

provides the broader integration inventory, including provider status, routing mode, criticality and preservation information.

A router or bridge that interacts with an integration must not be treated as proof that the underlying integration is removable.

---

41. Architectural Vocabulary

The following vocabulary should be used consistently.

Term| Meaning
Router| Determines where an operation should go
Bridge| Crosses a system or architectural boundary
Adapter| Translates or implements an interface for a provider/execution mechanism
Interceptor| Captures or redirects an existing call
Controller| Coordinates execution among mechanisms
Gateway| Controlled entry point into another system/layer
Queue| Determines ordering/priority
Webhook Router| Classifies inbound external events
Provider Selector| Selects an appropriate provider
Service| Performs a business/operational capability
Provider| External or internal system executing a capability

---

42. Final Architectural Rule

The following rule is authoritative for work involving RentMaikar routing:

«Do not simplify the architecture by deleting components that appear to overlap. First determine whether the components operate at different architectural layers, cross different boundaries, provide different fallbacks, serve different regions, handle different directions of communication, protect different security boundaries, or translate different provider interfaces.»

In particular:

Router ≠ Bridge
Bridge ≠ Adapter
Adapter ≠ Provider
Interceptor ≠ Direct Invocation
Controller ≠ Router
Queue ≠ Call Router
Call Router ≠ Telephony Controller
Inbound Email ≠ Outbound Email
Provider ≠ Provider Adapter
Tracking ≠ Telematics
Telemetry Transport ≠ Tracking Server
Connectivity ≠ Telematics

The architecture must preserve these distinctions unless an explicit, reviewed architectural change authorizes otherwise.

---

43. Mandatory AI-Agent Checklist

Before modifying routing infrastructure, an AI agent must be able to answer YES to all applicable questions:

- [ ] Did I inspect the current implementation?
- [ ] Did I identify the exact file and exported component?
- [ ] Did I identify whether it is a router, bridge, adapter, interceptor, controller, gateway, queue or service?
- [ ] Did I inspect its callers?
- [ ] Did I inspect its downstream dependencies?
- [ ] Did I identify all providers involved?
- [ ] Did I identify primary and fallback providers?
- [ ] Did I check regional routing?
- [ ] Did I check inbound versus outbound direction?
- [ ] Did I check security/authentication boundaries?
- [ ] Did I inspect the Supabase invocation interceptor where applicable?
- [ ] Did I inspect the governing architecture documents?
- [ ] Did I preserve existing provider integrations?
- [ ] Did I preserve existing fallback behavior?
- [ ] Did I test the affected path?
- [ ] Did I document any implementation/documentation discrepancy?

If any applicable answer is NO, the component must not be treated as redundant or safe to remove.

---

44. Summary

RentMaikar's routing architecture is intentionally layered.

The principal relationships are:

Frontend
   |
   +--> Backend Bridge
   |
   +--> Supabase Invocation Interceptor
             |
             v
       Backend Functions Router
             |
       +-----+----------------------+
       |                            |
       v                            v
 Capability Routers             Backend Services
       |                            |
       +--------+-------------------+
                |
                v
        Provider / Adapter
                |
                v
        External Platform

For communication:

Messaging
   |
   +--> CPaaS Router
   |       |
   |       +--> SMS Service
   |       +--> WhatsApp / RCS
   |       +--> Provider Failover
   |
   +--> Email
   |       |
   |       +--> OUTBOUND
   |       |      Backend Email Bridge
   |       |             |
   |       |          Email Service
   |       |             |
   |       |           Resend
   |       |
   |       +--> INBOUND
   |              Cloudflare Email Router
   |                     |
   |                  Webhook
   |                     |
   |                Inbound Processing
   |                     |
   |                Message Centre
   |
   +--> Voice
           |
           +--> Call Queue
           |
           +--> Call Router
           |
           +--> Telephony Controller
                    |
                    +--> Softphone Adapter
                    +--> Server REST Adapter
                    +--> TwiML Adapter

For vehicle connectivity and telemetry:

Hologram
   |
Connectivity
   |
   +-----------------------------+
                                 |
SAREKON ---- Telematics ---- Traccar
                                 |
                                 v
                              MQTT/EMQX
                                 |
                                 v
                         RentMaikar Bridges
                                 |
                                 v
                         RentMaikar Core

OpenStreetMap
      |
      +---- Geographic / mapping data

These systems are related but are not interchangeable.

The architectural objective is not to minimize the number of components. The objective is to preserve clear boundaries, controlled routing, provider resilience, security, regional capability and reliable communication across the entire RentMaikar platform.
