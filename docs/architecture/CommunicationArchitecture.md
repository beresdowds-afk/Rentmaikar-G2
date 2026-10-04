RentMaikar Connectivity, Telematics, Tracking & Mapping Architecture

Document role: Canonical architecture for vehicle connectivity, device telemetry, GPS/tracking, MQTT messaging, mapping/geospatial services, and their integration with the RentMaikar Core Platform.

Status: Active

---

1. Purpose

This document defines the architectural boundaries between the external and internal systems responsible for:

- vehicle/device connectivity;
- cellular connectivity;
- GPS and telematics;
- vehicle tracking;
- real-time telemetry;
- MQTT messaging;
- mapping and geospatial visualization;
- routing and location-based services;
- RentMaikar business logic and operational state.

The architecture intentionally separates these concerns.

A provider or service may participate in one or more operational flows, but it must not be assumed to own the responsibilities of another architectural layer.

The primary principle is:

«Connectivity, device telemetry, tracking, mapping, and business operations are related capabilities, but they are not the same architectural responsibility.»

---

2. Canonical Architectural Model

The logical architecture is:

                    VEHICLE / DEVICE
                          |
                          v
                +---------------------+
                | Cellular Connectivity|
                |   SIM / eSIM / Data |
                +---------------------+
                          |
                          v
                     Hologram
                 Connectivity Layer
                          |
             +------------+------------+
             |                         |
             v                         v
     GPS / Telematics             MQTT / IoT
        Data Path                  Data Path
             |                         |
             v                         v
   +------------------+       +------------------+
   | GPSANDTRACK /    |       |      EMQX        |
   | SAREKON          |       |   MQTT Broker    |
   | Telematics /     |       |                  |
   | Device Ecosystem |       | Telemetry /      |
   +------------------+       | Commands / Events|
             |                +------------------+
             |                         |
             v                         |
   +------------------+                |
   |     Traccar      |<---------------+
   | Tracking /       |
   | GPS Server       |
   +------------------+
             |
             +----------------------+
                                    |
                                    v
                         RentMaikar Core Platform
                         ------------------------
                         Business State
                         Vehicle State
                         Driver State
                         Rental State
                         Location State
                         Telemetry State
                         Alerts / Events
                         Operational Workflows
                                    |
                  +-----------------+------------------+
                  |                 |                  |
                  v                 v                  v
             Driver App       Owner Portal       Admin Portal
                  |                 |                  |
                  +-----------------+------------------+
                                    |
                                    v
                           Core APIs / Services
                                    |
              +---------------------+----------------------+
              |                     |                      |
              v                     v                      v
        Communications          Billing / Payments      Marketplace
        Notifications           Financial Workflows     Operations
                                    |
                                    v
                          Mapping / Geospatial Layer
                                    |
                                    v
                             OpenStreetMap
                         Map / Geographic Data

This diagram represents logical responsibilities, not a claim that every deployment must use exactly the same physical network path.

---

3. Architectural Layers

The architecture consists of distinct layers.

Layer 1 — Vehicle / Device Layer

This is the physical and embedded layer.

It may include:

- GPS tracking devices;
- vehicle-installed telematics devices;
- OBD devices;
- cellular-enabled devices;
- sensors;
- vehicle telemetry sources;
- mobile-device GPS where applicable.

This layer generates operational data such as:

- latitude;
- longitude;
- timestamp;
- speed;
- heading;
- ignition state;
- battery state;
- device state;
- sensor readings;
- alarms;
- trip-related events.

The vehicle/device layer does not own RentMaikar business rules.

---

4. Layer 2 — Cellular Connectivity

The cellular connectivity layer provides network access between devices and the systems receiving their data.

Hologram

Hologram belongs to the connectivity layer.

Its responsibility may include:

- SIM/eSIM connectivity;
- cellular data access;
- device connectivity management;
- network connectivity status;
- connectivity-related operational information.

Hologram is not the RentMaikar business-state authority.

Hologram does not become the authoritative owner of:

- rental state;
- driver state;
- owner state;
- vehicle rental contracts;
- payment state;
- platform identity;
- RentMaikar business rules.

Boundary

Device
   |
Cellular Network
   |
Hologram
   |
Tracking / IoT infrastructure

Hologram should therefore not be conflated with Traccar, EMQX, GPSANDTRACK/SAREKON, or RentMaikar Core.

---

5. Layer 3 — GPS / Telematics Provider Ecosystem

GPS and telematics providers may supply:

- GPS hardware;
- vehicle tracking hardware;
- device firmware;
- telematics services;
- location reporting;
- geofencing;
- alerts;
- device events;
- vehicle recovery functions;
- device management;
- telemetry services.

GPSANDTRACK / SAREKON

GPSANDTRACK/SAREKON represents an important telematics/device-provider path in the architecture.

Sarekon describes its platform as providing GPS telematics, real-time vehicle/asset location, geofencing, alerts, device hardware, and related telematics capabilities. The GPS and Track installation application is specifically associated with Sarekon-owned units/accounts.

Therefore GPSANDTRACK/SAREKON must not be reduced to:

"another Traccar"

or:

"just a GPS map provider"

It represents a device/telematics provider ecosystem.

Its integration may coexist with a tracking-server layer.

---

6. Layer 4 — Tracking / GPS Server

Traccar

Traccar is a tracking software/server layer.

Its responsibilities can include:

- receiving GPS/device data;
- decoding supported device protocols;
- processing location information;
- maintaining tracking information;
- trips and historical tracks;
- geofences;
- tracking events;
- device commands where supported;
- tracking APIs;
- exposing tracking information to authorized applications.

Traccar supports a large range of GPS tracker protocols and devices and provides server/API functionality for integrating tracking data into other systems.

Therefore:

GPSANDTRACK / SAREKON
        ≠
Traccar

They may participate in the same operational ecosystem without having identical responsibilities.

Architectural rule

Traccar is a tracking infrastructure component.

It is not the authoritative owner of RentMaikar business state.

Traccar must not become the source of truth for:

- rental contracts;
- payment state;
- driver authorization;
- owner accounts;
- platform permissions;
- business-level vehicle availability;
- financial transactions.

Those belong to RentMaikar Core.

---

7. Layer 5 — MQTT / IoT Messaging

EMQX

EMQX belongs to the MQTT/IoT messaging layer.

Its architectural purpose is to provide messaging transport for real-time device and telemetry communication.

This may include:

- telemetry messages;
- device events;
- device commands;
- status messages;
- real-time IoT communication;
- publish/subscribe communication.

Conceptually:

Device / Service
       |
       v
      MQTT
       |
       v
      EMQX
       |
       v
Authorized RentMaikar services

EMQX is not the authoritative business database.

It must not become the owner of:

- rental state;
- payment state;
- driver identity;
- owner identity;
- business contracts;
- authoritative vehicle availability.

Important distinction

MQTT transport and GPS tracking are related but different concerns.

EMQX
= message transport

Traccar
= GPS/tracking server

GPSANDTRACK/SAREKON
= telematics/device ecosystem

Hologram
= cellular connectivity

RentMaikar Core
= business/system-of-record layer

These distinctions must be preserved.

---

8. Layer 6 — Mapping and Geospatial Services

OpenStreetMap

OpenStreetMap belongs to the mapping/geospatial data layer.

OpenStreetMap provides geographic/map data covering roads, addresses, points of interest, buildings, transportation features, and other geographic objects.

RentMaikar may use OpenStreetMap-derived data or OSM-compatible services for:

- map display;
- geographic visualization;
- road/network context;
- location presentation;
- geospatial lookup;
- routing-related functionality where an appropriate routing service is used.

OpenStreetMap is therefore not a GPS tracker and does not replace:

- Hologram;
- GPSANDTRACK/SAREKON;
- Traccar;
- EMQX.

Important distinction

GPS device
   ↓
location coordinates
   ↓
tracking/telemetry infrastructure
   ↓
RentMaikar
   ↓
map/geospatial presentation
   ↓
OpenStreetMap-derived map data

A map displays or contextualizes location.

It does not generate the vehicle's authoritative telemetry.

OpenStreetMap data can also be used by separate routing/geocoding services; the specific routing or geocoding engine used by RentMaikar must be determined from the implementation rather than assumed from the presence of OSM.

---

9. Layer 7 — RentMaikar Core Platform

RentMaikar Core is the authoritative business and operational layer.

It is responsible for converting infrastructure-level events into RentMaikar business state and workflows.

Core may consume:

- GPS positions;
- telemetry;
- device events;
- MQTT events;
- tracking events;
- connectivity information;
- mapping/geospatial information.

Core may then produce:

- vehicle availability state;
- driver/vehicle relationships;
- rental state;
- trip state;
- operational alerts;
- owner workflows;
- administrative workflows;
- billing events;
- marketplace state;
- notifications;
- analytics;
- audit records.

Core is the business-system boundary

Infrastructure providers should provide infrastructure capabilities.

RentMaikar Core determines how those capabilities affect RentMaikar business operations.

---

10. Client Applications

The primary client surfaces include:

Driver App
Owner Portal
Admin Portal

Clients consume authorized RentMaikar APIs/services.

Conceptually:

Driver App
      |
Owner Portal
      |
Admin Portal
      |
      v
RentMaikar APIs / Services
      |
      v
RentMaikar Core

Clients must not be required to understand the internal provider topology.

They should not directly manage:

- Hologram infrastructure;
- Traccar administration;
- EMQX administration;
- GPSANDTRACK/SAREKON provider management;
- provider credentials;
- internal telemetry routing.

---

11. Provider Abstraction and Extensibility

The architecture intentionally permits alternative providers.

For example:

Cellular Connectivity
        |
        +---- Hologram
        +---- Other approved provider
        |
        v
Connectivity Adapter

Telematics
        |
        +---- GPSANDTRACK / SAREKON
        +---- Other approved provider
        |
        v
Telematics Adapter

Tracking Server
        |
        +---- Traccar
        +---- Approved alternative
        |
        v
Tracking Adapter

IoT Messaging
        |
        +---- EMQX
        +---- Approved alternative
        |
        v
MQTT / IoT Adapter

The existence of an alternative does not authorize removal of an existing provider.

Provider preservation is governed by:

"docs/architecture/PLATFORM_PROVIDER_PRESERVATION.md"

The current provider inventory is maintained in:

"docs/architecture/INTEGRATION_INVENTORY.md"

---

12. Alternative Tracking Paths

The architecture must support more than one legitimate source of vehicle/tracking information where the platform requires it.

A logical model may therefore be:

                 Vehicle / Device
                       |
              +--------+--------+
              |                 |
              v                 v
      GPSANDTRACK/SAREKON   Other Telematics
              |                 |
              +--------+--------+
                       |
                       v
                 Tracking Adapter
                       |
             +---------+---------+
             |                   |
             v                   v
          Traccar          Other Tracking
             |                   |
             +---------+---------+
                       |
                       v
                 RentMaikar Core

The exact runtime topology must be determined from the deployed implementation.

The architecture does not assume that every device must traverse every service.

---

13. Data Ownership

The following ownership model applies:

Layer| Primary Responsibility
Vehicle/device| Generate physical/device telemetry
Cellular network| Transport device connectivity
Hologram| Cellular connectivity service
GPSANDTRACK/SAREKON| Telematics/device services
Traccar| GPS tracking/server processing
EMQX| MQTT/IoT message transport
OpenStreetMap| Geographic/map data
RentMaikar Core| Business and operational state
Client applications| User interaction and presentation

This is a responsibility model, not a statement that every deployment must contain every component in every request path.

---

14. Data Flow

A typical vehicle-location flow may be:

Vehicle GPS Device
       |
       v
Cellular Connectivity
       |
       v
Hologram
       |
       v
Telematics / Tracking Infrastructure
       |
       +------> GPSANDTRACK / SAREKON
       |
       +------> Traccar
       |
       +------> Other approved tracking path
       |
       v
RentMaikar Integration Layer
       |
       v
RentMaikar Core
       |
       +------> Vehicle State
       +------> Trip State
       +------> Alerts
       +------> Operational Workflows
       +------> Analytics
       |
       v
Authorized Client
       |
       v
Map / Location Presentation
       |
       v
OpenStreetMap-derived geographic context

A telemetry/event flow may instead be:

Vehicle / IoT Device
       |
       v
Cellular Connectivity
       |
       v
Hologram
       |
       v
EMQX
       |
       v
RentMaikar Integration Layer
       |
       v
RentMaikar Core

These are complementary flows.

They must not be artificially collapsed into one pipeline.

---

15. Commands and Reverse Data Flow

The architecture is not exclusively device-to-platform.

Where supported, commands or control messages may flow in the opposite direction:

RentMaikar Core
       |
       v
Integration / Device Service
       |
       v
EMQX / Tracking Infrastructure
       |
       v
Device

or:

RentMaikar Core
       |
       v
Tracking / Telematics Provider
       |
       v
Vehicle Device

The exact command path depends on the device/provider capability.

RentMaikar Core remains responsible for the business authorization governing the command.

Infrastructure services transport or execute the command; they do not independently decide RentMaikar business authorization.

---

16. Event Processing

Infrastructure events should be treated as inputs to the RentMaikar operational model.

Examples:

GPS position received
       ↓
Tracking event
       ↓
RentMaikar integration layer
       ↓
Core event processing
       ↓
Business state update

or:

MQTT telemetry
       ↓
EMQX
       ↓
Core integration service
       ↓
Telemetry normalization
       ↓
Vehicle state

The same physical event may be received through more than one legitimate infrastructure path.

The platform must therefore account for:

- duplicate events;
- retries;
- delayed events;
- provider-specific identifiers;
- timestamp differences;
- out-of-order events;
- provider failover;
- device reconnection.

---

17. Normalization at the RentMaikar Boundary

Provider-specific formats should not unnecessarily leak into the rest of the application.

Where appropriate, the integration layer should normalize provider data into RentMaikar domain representations.

For example:

Provider-specific payload
        ↓
Provider adapter
        ↓
Normalized RentMaikar event
        ↓
Core business processing

This allows RentMaikar to support multiple providers without rewriting the business domain every time a provider changes.

---

18. Identity and Verification Boundary

Identity verification is separate from the connectivity, tracking, and mapping layers.

For example:

Persona
   |
   v
Identity Verification
   |
   v
RentMaikar Identity / Verification State

Persona does not become part of the cellular, GPS, MQTT, or mapping infrastructure.

Similarly:

Hologram
Traccar
EMQX
GPSANDTRACK/SAREKON
OpenStreetMap

do not become identity-verification authorities merely because their data may be associated with a vehicle or user.

See:

"docs/architecture/IdentityVerificationArchitecture.md"

and:

"docs/architecture/PersonaResponsibilities.md"

---

19. API and Backend Boundary

External infrastructure providers should be accessed through the appropriate authoritative backend/service boundary.

The conceptual architecture is:

Client
   |
   v
RentMaikar Gateway / Backend
   |
   v
Integration Adapter / Service
   |
   v
External Provider

The physical implementation may use:

- Cloud Run;
- backend services;
- Edge Functions;
- adapters;
- bridges;
- interceptors;
- other server-side services.

The architecture should not be reduced to a single implementation technology.

In particular, the presence of a Supabase Edge Function does not by itself define the complete architectural boundary.

---

20. "supabase.functions.invoke(...)" Rule

Whenever:

supabase.functions.invoke(...)

is encountered, the existing interceptor/adapter architecture must be checked before classifying the invocation.

See:

"docs/architecture/supabase-functions-invoke-interceptor-rule.md"

The investigation must establish whether the invocation is:

- intercepted;
- adapted;
- routed through the backend bridge;
- intentionally executed as an Edge Function;
- intentionally direct;
- legacy;
- otherwise covered by an existing routing mechanism.

Do not replace or remove the invocation merely because it appears to call Supabase.

---

21. Boundary Rules

Hologram

Hologram owns cellular connectivity services.

It does not own RentMaikar business state.

GPSANDTRACK / SAREKON

GPSANDTRACK/SAREKON owns its telematics/device-provider responsibilities.

It does not own RentMaikar business state.

Traccar

Traccar owns tracking-server responsibilities.

It does not own RentMaikar business state.

EMQX

EMQX owns MQTT/IoT message transport.

It does not own RentMaikar business state.

OpenStreetMap

OpenStreetMap provides geographic/map data.

It does not own vehicle telemetry or RentMaikar business state.

RentMaikar Core

RentMaikar Core owns authoritative RentMaikar business and operational state.

Client Applications

Clients present and interact with RentMaikar state through authorized platform services.

They do not directly administer infrastructure providers.

---

22. What This Architecture Does Not Mean

This document does not require:

Every device
    ↓
Hologram
    ↓
GPSANDTRACK/SAREKON
    ↓
Traccar
    ↓
EMQX
    ↓
Core

for every event.

That would incorrectly imply that all systems must be chained together.

Instead, the architecture recognizes several complementary infrastructure paths:

Connectivity
    ↓
Telematics / Tracking
    ↓
Core

and:

Connectivity
    ↓
IoT / MQTT
    ↓
Core

and:

Core
    ↓
Mapping / Geospatial Services

The actual path depends on the capability, provider, device, protocol, and current implementation.

---

23. Provider Preservation

The architecture intentionally permits multiple providers and alternative infrastructure paths.

Therefore no component may be removed merely because another component appears to perform a similar function.

Examples:

GPSANDTRACK/SAREKON
        +
Traccar

are not automatically duplicates.

Traccar
        +
EMQX

are not automatically duplicates.

Hologram
        +
Traccar

are not automatically duplicates.

Traccar
        +
OpenStreetMap

are not automatically duplicates.

They operate at different architectural layers.

Provider removal is governed by:

"docs/architecture/PLATFORM_PROVIDER_PRESERVATION.md"

---

24. Failure and Resilience

The architecture must allow provider failures without unnecessarily collapsing the entire platform.

Potential failures include:

- cellular connectivity interruption;
- device offline state;
- telematics provider outage;
- tracking server outage;
- MQTT broker outage;
- mapping service outage;
- delayed telemetry;
- duplicate telemetry;
- provider API failure.

RentMaikar Core should distinguish infrastructure failure from business state.

For example:

Tracking provider unavailable
        ≠
Vehicle automatically unavailable

The business response must be determined by RentMaikar operational rules.

---

25. Security Boundaries

Infrastructure credentials and administrative APIs must remain server-side where required.

Client applications must not receive:

- Hologram management credentials;
- Traccar administrative credentials;
- EMQX administrative credentials;
- GPSANDTRACK/SAREKON provider secrets;
- internal provider API secrets.

Provider credentials should be managed through the appropriate secure backend/configuration mechanisms.

---

26. Auditability

Integration events should be traceable where operationally appropriate.

The platform should be able to determine, where applicable:

Which device?
     ↓
Which provider?
     ↓
Which protocol?
     ↓
Which integration path?
     ↓
Which event?
     ↓
Which RentMaikar record?
     ↓
Which business workflow?

This is especially important when multiple tracking, telemetry, or connectivity providers coexist.

---

27. Architectural Change Rule

Any change that alters the responsibility of:

- Hologram;
- GPSANDTRACK/SAREKON;
- Traccar;
- EMQX;
- OpenStreetMap/geospatial services;
- RentMaikar Core;
- provider adapters;
- integration gateways;

must be treated as an architectural change.

Before implementing such a change:

1. inspect the current implementation;
2. inspect the relevant responsibility document;
3. inspect "INTEGRATION_INVENTORY.md";
4. inspect "PLATFORM_PROVIDER_PRESERVATION.md";
5. identify dependent routes and consumers;
6. preserve existing provider capabilities unless removal is explicitly authorized;
7. update the relevant documentation.

---

28. Related Architecture Documents

Overall architecture

"docs/architecture/architectureRule.md"

Core responsibilities

"docs/architecture/RentMaikarCoreResponsibilities.md"

Hologram

"docs/architecture/HologramResponsibilities.md"

Traccar

"docs/architecture/TraccarResponsibilities.md"

EMQX

"docs/architecture/EmqxResponsibilities.md"

Persona

"docs/architecture/PersonaResponsibilities.md"

Identity verification

"docs/architecture/IdentityVerificationArchitecture.md"

Provider preservation

"docs/architecture/PLATFORM_PROVIDER_PRESERVATION.md"

Integration inventory

"docs/architecture/INTEGRATION_INVENTORY.md"

Supabase invocation/interceptor

"docs/architecture/supabase-functions-invoke-interceptor-rule.md"

---

29. Canonical Responsibility Summary

┌────────────────────────────────────────────────────────────┐
│                    RENTMAIKAR CORE                         │
│                                                            │
│ Authoritative business + operational state                 │
│                                                            │
│ Rentals | Vehicles | Drivers | Owners | Trips | Billing   │
│ Alerts | Workflows | Marketplace | Platform Operations    │
└────────────────────────────────────────────────────────────┘
                         ▲
                         │
              Integration / Adapter Layer
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
        │                │                 │
        ▼                ▼                 ▼
   TRACCAR             EMQX        GPSANDTRACK/SAREKON
 GPS Tracking        MQTT/IoT          Telematics
        ▲                ▲                 ▲
        │                │                 │
        └────────────────┼─────────────────┘
                         │
                    Hologram
               Cellular Connectivity
                         ▲
                         │
                  Vehicle / Device


                 GEOSPATIAL LAYER
                         │
                         ▼
                  OpenStreetMap
               Map / Geographic Data
                         │
                         ▼
                 Core / Client UI

The important architectural distinction is:

Hologram
    = connectivity

GPSANDTRACK / SAREKON
    = telematics / device ecosystem

Traccar
    = GPS tracking server

EMQX
    = MQTT / IoT messaging transport

OpenStreetMap
    = geographic / mapping data

RentMaikar Core
    = authoritative business and operational platform

These responsibilities are complementary.

They must not be collapsed merely because their data flows ultimately converge in RentMaikar.

---

30. Final Architectural Principle

«RentMaikar separates connectivity, telematics, tracking, messaging, mapping, and business operations into distinct but interoperable layers.»

«Hologram connects devices.»

«GPSANDTRACK/SAREKON provides telematics/device capabilities.»

«Traccar provides GPS tracking infrastructure.»

«EMQX provides MQTT/IoT message transport.»

«OpenStreetMap provides geographic/map data.»

«RentMaikar Core converts infrastructure information into authoritative RentMaikar business and operational state.»

No layer should silently absorb another layer's responsibilities.

No provider should be removed merely because another provider appears to overlap with it.

No AI agent or developer should infer the complete architecture from a single code path.

Inspect the current implementation, respect the documented boundaries, preserve intentional integrations, and make architectural changes explicitly.