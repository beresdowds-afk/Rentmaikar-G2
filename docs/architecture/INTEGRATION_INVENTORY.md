Rentmaikar Integration Inventory

Repository: "beresdowds-afk/Rentmaikar-G2"
Branch: "main"
Document role: Authoritative inventory of platform integrations
Status: Active
Last reviewed: 2026-10-04

---

1. Purpose

This document is the authoritative inventory of external providers, services, adapters, gateways, communication channels, IoT/tracking systems, payment services, identity/verification services, and other material integrations used or reserved by the Rentmaikar platform.

It answers:

«What integrations exist, what role does each integration serve, how is it routed, what is its operational status, and is its removal authorized?»

It does not define the general architectural principles for preserving integrations.

Those rules are defined in:

"docs/architecture/PLATFORM_PROVIDER_PRESERVATION.md"

The overall system architecture is defined in:

"docs/architecture/architectureRule.md"

---

2. Non-Negotiable Inventory Rule

An integration appearing in this inventory must be treated as an intentional platform capability unless the current implementation and authoritative architecture documentation establish otherwise.

An AI agent, developer, refactoring process, dependency-cleanup process, or automated tool MUST NOT remove, replace, merge, disable, or bypass an integration merely because:

- another provider appears to perform a similar function;
- another provider appears to be the current provider;
- the integration appears unused from one code path;
- the integration is not currently active;
- the integration appears redundant;
- the integration is regional;
- the integration is specialized;
- the integration is configured but not currently exercised;
- the integration has a fallback relationship with another provider;
- the integration is implemented through a different adapter or gateway.

Before any removal or architectural change, consult:

"docs/architecture/PLATFORM_PROVIDER_PRESERVATION.md"

and verify the current implementation.

---

3. Classification Model

The following fields are intentionally independent.

Do not use one field as a substitute for another.

3.1 Role

"role" describes what position or function the integration has within the platform.

Allowed values:

Role| Meaning
"primary"| Principal provider currently intended for the capability
"secondary"| Additional provider retained alongside the primary provider
"specialized"| Provider retained for a particular capability that is not necessarily the general-purpose provider
"regional"| Provider retained for a particular geographic market or jurisdiction
"unknown"| Role has not yet been conclusively established

"primary" does not mean that other providers are removable.

"secondary" does not mean obsolete.

"specialized" does not mean temporary.

"regional" does not mean inactive.

---

3.2 Status

"status" describes the current lifecycle/operational state of the integration.

Allowed values:

Status| Meaning
"active"| Currently operational or actively used
"dormant"| Retained but not currently exercised in normal operation
"reserved"| Intentionally retained for future, contingency, regional, or capability use
"migration"| Currently involved in an approved migration
"legacy"| Historical integration retained for compatibility, transition, or controlled reasons
"disabled"| Intentionally disabled but not authorized for deletion
"unknown"| Current status has not yet been conclusively established

Important: "fallback", "regional", "primary", "secondary", and "specialized" are not status values.

---

3.3 Routing

"routing" describes how the platform reaches or selects the integration.

Allowed values:

Routing| Meaning
"direct"| Selected directly by an authoritative backend/service
"load_balance"| Multiple providers are selected according to load-balancing logic
"failover"| Provider is selected when another provider/path fails
"regional"| Provider is selected according to geographic or jurisdictional rules
"capability_based"| Provider is selected according to capability
"manual"| Provider selection is controlled manually or operationally

Fallback

"fallback" is not a role and not a status.

Fallback is a relationship between integrations or routes.

For example:

Provider A
    ↓ primary route
Provider B
    ↓ fallback route

The inventory should record this relationship in the "fallback" field where applicable.

---

3.4 Criticality

"criticality" describes the operational importance of the integration.

Allowed values:

Criticality| Meaning
"critical"| Failure materially compromises a core platform operation
"high"| Failure significantly affects an important platform capability
"medium"| Failure affects a meaningful but non-core capability
"low"| Failure has limited operational impact

---

3.5 Removal Authorization

"removal_authorized" determines whether an integration may be removed as part of ordinary engineering work.

Allowed values:

true
false

Default:

false

If the value is "false", removal requires explicit platform-owner authorization.

An integration marked:

status: dormant

does not imply:

removal_authorized: true

Likewise:

status: legacy

does not imply that the integration may be deleted.

---

4. Inventory Record Structure

Each integration should be recorded using the following structure:

name:
category:
provider:
role:
status:
routing:
criticality:
fallback:
regions:
capabilities:
authoritative_entrypoint:
implementation_locations:
configuration_locations:
dependencies:
notes:
removal_authorized:

Field definitions

Field| Purpose
"name"| Human-readable integration name
"category"| Integration category
"provider"| External provider or internal service
"role"| Primary/secondary/specialized/regional/unknown
"status"| Active/dormant/reserved/migration/legacy/disabled/unknown
"routing"| Direct/load balance/failover/regional/capability based/manual
"criticality"| Operational importance
"fallback"| Related provider or route used as fallback
"regions"| Geographic scope
"capabilities"| Functions supplied by the integration
"authoritative_entrypoint"| Backend/service through which the integration is intended to be reached
"implementation_locations"| Relevant repository files/directories
"configuration_locations"| Relevant environment/configuration locations
"dependencies"| Other platform components required
"notes"| Important implementation or architectural notes
"removal_authorized"| Whether removal is explicitly permitted

---

5. Integration Categories

The inventory may contain multiple providers in the same category.

The existence of one provider in a category does not make another provider redundant.

Supported categories include, but are not limited to:

- "communication"
- "email"
- "sms"
- "whatsapp"
- "voice"
- "telephony"
- "identity_verification"
- "payment"
- "payment_payout"
- "iot"
- "vehicle_tracking"
- "mqtt"
- "mapping"
- "storage"
- "authentication"
- "analytics"
- "notification"
- "marketing"
- "other"

Additional categories may be introduced when the platform requires them.

---

6. Provider Inventory

«Important: This section is the current inventory of known integrations. It should be updated when integrations are added, changed, migrated, reserved, disabled, or removed.»

6.1 Communication and Messaging

Integration| Provider| Role| Status| Routing| Criticality| Fallback| Regions| Removal Authorized
Email communications| Resend| primary/specialized*| active*| capability_based*| high*| —| platform regions| false
SMS / WhatsApp communications| SENT.dm| primary/specialized*| active*| capability_based*| high*| —| platform regions| false
Voice / telephony| Twilio| primary/specialized*| active*| capability_based*| high*| —| USA/Nigeria*| false

"*" Values must be verified against the current implementation/configuration before being changed from their documented state.

Communication providers must remain independently represented even when they support overlapping capabilities.

---

6.2 Identity and Verification

Integration| Provider| Role| Status| Routing| Criticality| Fallback| Regions| Removal Authorized
Identity verification| Persona| specialized| active*| capability_based| high| —| platform regions| false

The identity-verification provider boundary is documented separately in:

"docs/architecture/PersonaResponsibilities.md"

The platform verification-state model is documented in:

"docs/architecture/IdentityVerificationArchitecture.md"

These documents describe different concerns and must not be collapsed into this inventory.

---

6.3 IoT / Vehicle Tracking

The platform may contain multiple IoT, telemetry, tracking, messaging, or device-management providers.

Each provider must be independently inventoried.

Integration| Provider| Role| Status| Routing| Criticality| Fallback| Regions| Removal Authorized
Vehicle tracking| Traccar| specialized| active*| capability_based| critical*| —| platform regions| false
IoT/device messaging| EMQX| specialized| active*| capability_based| critical*| —| platform regions| false
Cellular/device connectivity| Hologram| specialized| active*| capability_based| high*| —| platform regions| false

Responsibility documents:

- "docs/architecture/HologramResponsibilities.md"
- "docs/architecture/TraccarResponsibilities.md"
- "docs/architecture/EmqxResponsibilities.md"

These documents define provider responsibilities. This inventory defines their existence and classification.

---

6.4 Payment Services

The platform may support multiple payment service providers and payment routes.

A payment provider must not be removed simply because another payment provider is currently operational.

Integration| Provider| Role| Status| Routing| Criticality| Fallback| Regions| Removal Authorized
Payment service| OPay| regional/specialized*| active*| regional/capability_based*| high*| —| Nigeria*| false
Payment service| PayPal| regional/specialized*| active*| regional/capability_based*| high*| —| USA/Nigeria*| false

Provider-specific implementation documentation:

"docs/architecture/OPay-Integration-Specification.md"

Payment architecture and routing must be established from the current implementation rather than inferred from provider names.

---

7. Internal Integration Gateways and Adapters

External providers may not be called directly from every part of the application.

The platform may contain:

- backend gateways;
- service adapters;
- communication adapters;
- provider adapters;
- bridge services;
- interceptors;
- Cloud Run services;
- Supabase Edge Functions;
- server-side routing layers;
- other authoritative integration boundaries.

Therefore, when inspecting an integration, engineers and AI agents must determine:

User/client
    ↓
Rentmaikar application
    ↓
authoritative gateway/backend
    ↓
adapter/interceptor/service
    ↓
external provider

The exact implementation may differ by capability.

The presence of a provider SDK or provider reference in frontend source code does not, by itself, prove that the frontend directly calls that provider.

---

8. Supabase Function Invocation Inventory Rule

Whenever the repository contains:

supabase.functions.invoke(...)

the invocation must be investigated before being classified as a direct frontend-to-provider call.

The authoritative rule is:

"docs/architecture/supabase-functions-invoke-interceptor-rule.md"

The investigation must determine whether the invocation is:

1. handled by an interceptor;
2. handled by an adapter;
3. routed through the backend bridge;
4. routed through a server-side function;
5. intentionally direct;
6. legacy;
7. otherwise covered by an existing authoritative routing mechanism.

Do not replace or remove a "supabase.functions.invoke(...)" call merely because it appears to be a direct call.

First determine whether the catch-all interceptor/adapter already covers it.

---

9. Backend and Gateway Inventory

The current platform architecture includes authoritative backend/gateway layers.

Where applicable, integrations should identify the actual entrypoint rather than merely naming the external provider.

For example:

Rentmaikar client
      ↓
authoritative Rentmaikar gateway/backend
      ↓
provider adapter/service
      ↓
external provider

The architectural boundary must not be inferred solely from an implementation technology.

For example, Supabase Edge Functions may be an implementation mechanism without being the only valid architectural boundary.

---

10. Regional Integrations

A provider serving one region must not be classified as redundant solely because another provider serves another region.

Regional routing may legitimately coexist with:

- primary routing;
- secondary routing;
- specialized routing;
- failover;
- capability-based routing.

Example:

Nigeria
   ↓
Nigeria-capable provider

USA
   ↓
USA-capable provider

This does not imply that either provider is unnecessary.

Regional providers must therefore be represented individually.

---

11. Specialized Integrations

A specialized provider may perform only one part of a broader capability.

For example:

Communication
├── Email
├── SMS
├── WhatsApp
├── Voice
└── In-app messaging

Similarly:

Vehicle operations
├── Cellular connectivity
├── GPS tracking
├── MQTT/device messaging
└── Fleet/vehicle management

Providers supporting different branches of the capability tree must not be merged simply because their broad category is the same.

---

12. Multiple Providers

Multiple providers within the same category are permitted and may be intentional.

Examples include:

Communication
├── Provider A
├── Provider B
└── Provider C

Payments
├── Provider A
├── Provider B
└── Provider C

IoT / Tracking
├── Provider A
├── Provider B
└── Provider C

Possible reasons include:

- regional coverage;
- regulatory requirements;
- provider-specific capabilities;
- redundancy;
- failover;
- pricing;
- operational continuity;
- customer requirements;
- different API capabilities;
- specialized services;
- migration;
- future expansion.

The inventory records these distinctions.

The preservation policy determines when they may be removed.

---

13. Integration Relationship Model

Relationships between providers should be represented explicitly.

Example:

provider_a:
  role: primary
  status: active
  routing: direct
  fallback: provider_b

provider_b:
  role: secondary
  status: active
  routing: failover
  fallback: null

Another valid configuration:

provider_a:
  role: regional
  status: active
  routing: regional
  regions:
    - Nigeria

provider_b:
  role: regional
  status: active
  routing: regional
  regions:
    - United States

Another:

provider_a:
  role: specialized
  status: active
  routing: capability_based

provider_b:
  role: specialized
  status: active
  routing: capability_based

These configurations are not contradictory.

---

14. Unknown Does Not Mean Removable

If the repository does not currently provide enough evidence to determine:

- provider role;
- operational status;
- routing;
- criticality;
- fallback relationship;

the correct value is:

unknown

Do not infer:

unknown → unused
unknown → obsolete
unknown → duplicate
unknown → removable

Instead:

unknown → investigate

---

15. Inventory Maintenance Rules

Whenever an integration is:

- added;
- removed;
- replaced;
- migrated;
- disabled;
- activated;
- reserved;
- re-routed;
- assigned a new region;
- given a new capability;
- moved behind an adapter;
- moved behind a backend gateway;

the inventory must be reviewed and updated.

The implementation and inventory should remain consistent.

---

16. Removal Procedure

Before removing an integration:

Step 1 — Inspect the current implementation

Search the repository for:

- provider name;
- SDK/package;
- environment variables;
- configuration;
- routes;
- adapters;
- interceptors;
- backend functions;
- frontend calls;
- webhook handlers;
- database references;
- scheduled jobs;
- documentation references.

Step 2 — Check the architecture documents

At minimum inspect the relevant authoritative documents.

Step 3 — Check this inventory

Determine:

role
status
routing
criticality
fallback
regions
removal_authorized

Step 4 — Check preservation policy

Read:

"docs/architecture/PLATFORM_PROVIDER_PRESERVATION.md"

Step 5 — Establish explicit authorization

If:

removal_authorized: false

the integration must not be removed without explicit platform-owner authorization.

Step 6 — Update the inventory

Only after an authorized architectural change has been completed should the inventory be changed to reflect the new state.

---

17. Evidence Standard

Inventory values should be based on evidence from:

1. current source code;
2. current configuration;
3. current deployment configuration;
4. current architecture documentation;
5. current provider configuration;
6. explicit platform-owner decisions.

Do not infer integration status solely from:

- package installation;
- an unused import;
- a single frontend reference;
- an environment variable;
- an old document;
- a provider appearing elsewhere;
- an AI-generated code comment.

---

18. Document Ownership

This document owns:

«WHAT integrations exist and HOW they are classified.»

It does not own:

Overall architecture

"docs/architecture/architectureRule.md"

Communication architecture

"docs/architecture/CommunicationArchitecture.md"

Provider-preservation policy

"docs/architecture/PLATFORM_PROVIDER_PRESERVATION.md"

Core responsibilities

"docs/architecture/RentMaikarCoreResponsibilities.md"

Hologram responsibilities

"docs/architecture/HologramResponsibilities.md"

Traccar responsibilities

"docs/architecture/TraccarResponsibilities.md"

EMQX responsibilities

"docs/architecture/EmqxResponsibilities.md"

Persona responsibilities

"docs/architecture/PersonaResponsibilities.md"

Identity-verification architecture

"docs/architecture/IdentityVerificationArchitecture.md"

Supabase invocation/interceptor rule

"docs/architecture/supabase-functions-invoke-interceptor-rule.md"

OPay implementation

"docs/architecture/OPay-Integration-Specification.md"

---

19. Conflict Resolution

If this inventory conflicts with the current implementation:

1. do not silently change the implementation;
2. inspect the implementation;
3. inspect the relevant authoritative architecture document;
4. identify which document owns the disputed decision;
5. determine whether the inventory is stale;
6. update the inventory if appropriate;
7. if the architecture itself has changed, update the authoritative architecture document through an explicit architectural change.

An inventory discrepancy is not permission to remove an integration.

---

20. AI Agent Instruction

AI coding agents operating on Rentmaikar MUST treat this inventory as an architectural discovery document.

Before modifying an integration, the agent should establish:

What is this integration?
        ↓
What capability does it provide?
        ↓
What is its role?
        ↓
What is its status?
        ↓
How is it routed?
        ↓
Does it have a fallback relationship?
        ↓
What regions/capabilities does it serve?
        ↓
What is its criticality?
        ↓
Is removal explicitly authorized?

If any of these are unclear:

«Investigate before modifying.»

Do not simplify the architecture merely to make the code appear cleaner.

---

21. Final Principle

The integration inventory exists to make the platform's integration topology visible.

It is not a list of dependencies to clean up.

It is not a list of providers to consolidate.

It is not a list of currently preferred vendors only.

It is the record of the integrations that form, support, reserve, extend, or protect the Rentmaikar platform's operational capabilities.

Presence in this inventory means preserve and investigate first.

Absence from this inventory does not automatically mean removable.

Removal requires evidence, architectural review, and authorization.