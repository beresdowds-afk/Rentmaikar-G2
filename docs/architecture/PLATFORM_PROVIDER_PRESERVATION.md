Rentmaikar Platform Provider Preservation Policy

Repository: "beresdowds-afk/Rentmaikar-G2"
Branch: "main"
Document role: Authoritative provider and integration preservation policy
Status: Active
Last reviewed: 2026-10-04

---

1. Purpose

Rentmaikar is intentionally designed to support multiple external providers, services, communication channels, regional services, specialized capabilities, and integration paths.

This document establishes the rule that these integrations must not be removed, consolidated, replaced, bypassed, or reclassified merely because another integration appears to provide a similar capability.

The purpose of this policy is to prevent accidental architectural degradation during:

- AI-assisted development;
- code generation;
- refactoring;
- dependency cleanup;
- migration;
- provider replacement;
- performance optimization;
- security changes;
- frontend/backend restructuring;
- automated code modification.

This document defines the preservation policy.

The actual list and classification of integrations is maintained separately in:

"docs/architecture/INTEGRATION_INVENTORY.md"

---

2. Core Preservation Principle

«Every intentionally retained provider, service, channel, adapter, gateway, or integration must be presumed architecturally significant until the current implementation and authoritative architecture documentation establish otherwise.»

Similarity of functionality is not sufficient evidence of redundancy.

The following are not, by themselves, valid reasons to remove an integration:

- another provider performs a similar function;
- another provider appears to be the primary provider;
- the provider is currently dormant;
- the provider is currently used only in one region;
- the provider is used by only one feature;
- the provider is used only as a fallback;
- the provider is specialized;
- the provider appears to be a legacy integration;
- the provider has few references in the frontend;
- the provider is accessed through an adapter;
- the provider is accessed through a backend service rather than directly;
- an AI agent cannot immediately determine its purpose.

When the purpose is unclear:

«Investigate. Do not remove.»

---

3. What Must Be Preserved

The preservation rule applies to all intentional integration categories, including but not limited to:

Communication

- Email
- SMS
- WhatsApp
- Voice
- Telephony
- In-app messaging
- Notifications
- Marketing communication

Payments

- Payment providers
- Payment gateways
- Payment adapters
- Payout providers
- Regional payment services
- Payment fallback routes

IoT and Vehicle Operations

- Cellular connectivity
- GPS/vehicle tracking
- MQTT
- Device management
- Telemetry
- Fleet-management integrations
- IoT messaging providers

Identity and Verification

- Identity verification providers
- Document verification
- KYC/identity services
- Verification adapters
- Verification webhooks

Platform Services

- Authentication
- Storage
- Mapping
- Analytics
- Monitoring
- Notification services
- Other intentionally retained external services

---

4. Multiple Providers Are Intentional

Rentmaikar may maintain multiple providers for the same broad capability.

For example:

Communication
├── Provider A
├── Provider B
└── Provider C

or:

Payments
├── Provider A
├── Provider B
└── Provider C

or:

IoT / Tracking
├── Provider A
├── Provider B
└── Provider C

This is not automatically duplication.

Multiple providers may exist for:

- regional coverage;
- regulatory requirements;
- provider-specific capabilities;
- redundancy;
- failover;
- service continuity;
- pricing;
- availability;
- technical compatibility;
- customer requirements;
- specialized functions;
- migration;
- future expansion.

Therefore:

«One provider must not be substituted for another without an explicit architectural decision.»

---

5. Multiple Communication Channels Are Intentional

Communication channels are not interchangeable merely because they deliver messages.

For example:

Communication
├── Email
├── SMS
├── WhatsApp
├── Voice
└── In-app messaging

Each channel may have different:

- delivery characteristics;
- user expectations;
- authentication requirements;
- operational purposes;
- geographic availability;
- cost;
- provider dependencies;
- message types;
- regulatory considerations.

An implementation that consolidates channels simply because they are all "messaging" may destroy intentional platform functionality.

---

6. Multiple IoT and Tracking Services Are Intentional

IoT, connectivity, tracking, telemetry, and messaging services may represent different layers of the platform.

For example:

Vehicle / IoT ecosystem
├── Cellular connectivity
├── Device communication
├── MQTT messaging
├── GPS tracking
└── Fleet/vehicle data

A provider operating in one layer must not be assumed to replace another provider operating in a different layer.

The architectural responsibility documents for these services must be consulted before modification.

Relevant documents include:

- "docs/architecture/HologramResponsibilities.md"
- "docs/architecture/TraccarResponsibilities.md"
- "docs/architecture/EmqxResponsibilities.md"

---

7. Multiple Payment Providers Are Intentional

Payment providers may coexist because of:

- country;
- currency;
- payment method;
- customer segment;
- settlement requirements;
- payout requirements;
- provider capability;
- regulatory requirements;
- operational redundancy;
- future expansion.

Therefore:

«A payment provider must not be removed simply because another payment provider can process payments.»

Provider-specific implementation documentation must be respected.

For example:

"docs/architecture/OPay-Integration-Specification.md"

---

8. Provider Role and Provider Status Are Different

Provider classification must not combine independent concepts.

Role

Role describes what position or function a provider has.

Allowed roles:

primary
secondary
specialized
regional
unknown

Status

Status describes the provider's lifecycle or operational state.

Allowed statuses:

active
dormant
reserved
migration
legacy
disabled
unknown

These concepts must not be merged.

For example:

role: secondary
status: active

is valid.

Likewise:

role: regional
status: active

is valid.

And:

role: specialized
status: dormant

is valid.

---

9. Fallback Is a Routing Relationship

"fallback" is neither a role nor a status.

It describes a relationship between routes or providers.

For example:

Primary Provider
      ↓
failure
      ↓
Fallback Provider

A provider designated as a fallback is therefore not automatically:

unused
obsolete
legacy
removable

Fallback infrastructure is part of operational resilience.

---

10. Regional Does Not Mean Redundant

A provider serving a particular geography may coexist with providers serving other geographies.

For example:

Nigeria
    ↓
Regional Provider A

United States
    ↓
Regional Provider B

Neither provider should be removed merely because the other provides the same general category of service.

Regional routing must be preserved where intentionally designed.

---

11. Specialized Does Not Mean Redundant

A specialized provider may exist because it performs a particular capability better or differently from a general-purpose provider.

For example:

General communication provider
        +
Specialized communication provider

or:

General payment provider
        +
Regional payment provider

The existence of overlapping functionality does not establish redundancy.

---

12. Dormant, Reserved, and Legacy Integrations

A provider can remain intentionally retained even when it is not currently active.

Dormant

The provider remains part of the platform but is not currently exercised in normal operation.

Reserved

The provider is intentionally retained for future, regional, contingency, or specialized use.

Migration

The provider is participating in an approved migration.

Legacy

The provider is retained for compatibility, transition, or historical operational reasons.

Disabled

The provider is intentionally disabled but has not been authorized for deletion.

None of these states automatically authorizes removal.

---

13. Unknown Means Investigate

When an AI agent or developer cannot determine the purpose, role, status, or routing of an integration, the correct action is not removal.

The correct action is investigation.

The agent should inspect:

- source code;
- configuration;
- environment variables;
- adapters;
- interceptors;
- backend routes;
- webhooks;
- scheduled jobs;
- database references;
- deployment configuration;
- architecture documentation;
- integration inventory.

If uncertainty remains, retain the integration and report the uncertainty.

---

14. Adapters, Gateways, and Interceptors Must Be Preserved

A provider may not be called directly from the component currently being inspected.

The platform may use:

- backend gateways;
- service adapters;
- provider adapters;
- communication bridges;
- interceptors;
- Cloud Run services;
- Supabase Edge Functions;
- server-side services;
- routing layers.

Therefore:

«Do not infer the complete integration path from a single source file.»

The expected conceptual pattern may be:

Client
   ↓
Rentmaikar application
   ↓
Authoritative gateway/backend
   ↓
Adapter / service / interceptor
   ↓
External provider

The actual implementation must be inspected before changing the route.

---

15. Supabase Function Invocation Preservation Rule

Whenever the repository contains:

supabase.functions.invoke(...)

the invocation must first be checked against:

"docs/architecture/supabase-functions-invoke-interceptor-rule.md"

The agent must determine whether the invocation is covered by:

- a catch-all interceptor;
- an adapter;
- a backend bridge;
- a server-side route;
- an Edge Function;
- another authoritative routing mechanism.

Do not automatically classify the invocation as an unacceptable direct frontend integration.

Do not replace it merely because a different backend route exists.

The existing interception/routing architecture must be understood first.

---

16. Do Not Bypass the Authoritative Backend Boundary

Where an integration is intentionally routed through an authoritative Rentmaikar backend or gateway, new code must not bypass that boundary merely because direct provider access appears simpler.

Before introducing or changing a provider call, determine:

1. the authoritative entrypoint;
2. the existing adapter;
3. the existing bridge;
4. the existing interceptor;
5. authentication requirements;
6. authorization requirements;
7. logging requirements;
8. error handling;
9. fallback behavior;
10. regional routing.

Architectural simplification must not bypass established controls.

---

17. No Silent Provider Substitution

An AI agent or developer must not silently replace:

Provider A

with:

Provider B

even if Provider B appears to offer the same API capability.

Provider substitution can change:

- geographic coverage;
- pricing;
- compliance;
- credentials;
- delivery;
- webhooks;
- API behavior;
- failure modes;
- data handling;
- customer experience;
- fallback behavior.

Provider replacement therefore requires an explicit architectural decision.

---

18. No Automatic Dependency Cleanup

A package, SDK, environment variable, route, adapter, or provider reference must not be removed solely because:

- it has few references;
- it is not imported by the currently inspected component;
- it appears unused by static analysis;
- another SDK performs a similar function;
- the provider is dormant;
- an AI code scanner reports it as redundant.

The complete integration path must first be established.

---

19. Removal Authorization

The default rule is:

removal_authorized: false

An integration may only be removed when all of the following are satisfied:

1. its purpose has been established;
2. its current implementation has been inspected;
3. its architecture documentation has been reviewed;
4. its inventory entry has been reviewed;
5. dependent routes and services have been checked;
6. fallback and regional relationships have been checked;
7. the removal is explicitly authorized;
8. replacement behavior, if any, is defined;
9. tests and deployment checks are completed.

A provider being marked:

dormant

or:

legacy

does not satisfy these requirements.

---

20. Relationship With the Integration Inventory

The documents have different responsibilities.

"PLATFORM_PROVIDER_PRESERVATION.md"

Answers:

«Why must integrations be preserved, and what rules govern changes to them?»

"INTEGRATION_INVENTORY.md"

Answers:

«What integrations currently exist, and how are they classified?»

Therefore:

- this document should not contain the complete provider inventory;
- the inventory should not reproduce this entire policy;
- changes to one should not automatically result in duplication in the other.

---

21. Relationship With the Overall Architecture

The overall architecture remains governed by:

"docs/architecture/architectureRule.md"

This preservation policy does not override the overall architecture.

Instead, it protects intentional integration boundaries while architectural changes are being made.

If a genuine architectural change is approved, the relevant architecture documents and inventory must be updated together.

---

22. AI Agent Mandatory Workflow

Before modifying or removing any provider or integration:

1. Inspect current repository state
          ↓
2. Identify the integration
          ↓
3. Find its inventory entry
          ↓
4. Read the relevant architecture document
          ↓
5. Identify adapters / bridges / interceptors
          ↓
6. Identify dependencies and consumers
          ↓
7. Identify regional / specialized / fallback relationships
          ↓
8. Determine whether removal is authorized
          ↓
9. Make the smallest justified change
          ↓
10. Update affected documentation
          ↓
11. Run validation

An agent must not skip directly from:

"I found a provider"

to:

"I should remove it."

---

23. Required Behavior When Documentation and Code Appear to Conflict

If an architecture document and the current implementation appear inconsistent:

Do not silently choose one.

Instead:

1. inspect the current implementation;
2. identify whether the documentation is stale;
3. identify the authoritative document for the disputed subject;
4. inspect related adapters and routes;
5. determine whether an architectural change has already occurred;
6. report the discrepancy;
7. update the appropriate authoritative documentation when the intended architecture is established.

Documentation conflict is a reason to investigate, not a reason to simplify.

---

24. Security and Reliability Preservation

Provider preservation also applies to the controls surrounding integrations.

Do not weaken or bypass:

- authentication;
- authorization;
- RLS;
- server-side credentials;
- webhook verification;
- provider signatures;
- secrets management;
- audit logging;
- rate limiting;
- retry logic;
- idempotency;
- failure handling;
- fallback routing.

A provider migration or refactor is not permission to weaken these controls.

---

25. Final Rule

The Rentmaikar integration architecture is intentionally extensible and multi-provider.

Therefore:

«Do not remove what you do not understand.»

«Do not consolidate providers merely because their capabilities overlap.»

«Do not confuse primary/secondary/specialized/regional roles with active/dormant/reserved/migration/legacy statuses.»

«Do not treat fallback as a provider status.»

«Do not bypass adapters, gateways, bridges, or interceptors.»

«Whenever "supabase.functions.invoke(...)" is encountered, check the authoritative interceptor/adapter rule before treating it as a direct call.»

«Do not substitute providers without an explicit architectural decision.»

«When uncertain, preserve first and investigate.»

This policy exists to ensure that AI-assisted development and ordinary engineering changes improve Rentmaikar without unintentionally removing capabilities, resilience, regional coverage, provider diversity, communication channels, or established integration boundaries.