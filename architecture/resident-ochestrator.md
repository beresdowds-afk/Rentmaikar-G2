# RentMaikar Resident Orchestrator Integration Instructions

## Purpose

Introduce the RentMaikar Resident Orchestrator as a new integration layer that coordinates Traccar GPS telemetry and EMQX MQTT IoT events.

The purpose is to transform the existing Traccar and EMQX implementations from independent systems into a collaborative vehicle intelligence architecture.

---

# Target Architecture

RentMaikar Platform
    |
    |
Resident Orchestrator
|
|                       |
Traccar Engine     EMQX IoT Layer
|                       |
GPS Devices       MQTT Vehicle Devices
|
 AI Analytics Services


 
---

# Implementation Rules

## 1. Preserve Existing Systems

DO NOT:

- Rewrite Traccar integration files.
- Rewrite EMQX integration files.
- Remove existing functionality.
- Change existing APIs unless required.

Existing systems must continue operating.

---

# 2. Add a New Integration Layer

Create:

This layer is responsible for:

- Receiving Traccar events.
- Receiving EMQX messages.
- Normalizing vehicle data.
- Maintaining unified vehicle state.
- Forwarding events to analytics services.

---

# 3. Adapter Pattern

Create adapters instead of direct modification.

Required adapters:


continues working.

New flow:


must work without breaking existing functionality.

---

# 5. Unified Vehicle Event Model

Create a common event format:

```typescript
{
 vehicleId:"",
 source:"",
 eventType:"",
 timestamp:"",
 payload:{}
}


Supported sources:
traccar
mqtt
Future sources:
obd
ev
camera
smart-lock
fuel sensors
6. Future Expansion
Design the orchestrator so it can later support:
OBD-II diagnostics
EV battery telemetry
Smart vehicle locks
Fuel sensors
Dash camera analytics
AI driver scoring
Predictive maintenance
7. Code Quality Requirements
Before modifying code:
Inspect existing architecture.
Identify current Traccar integration points.
Identify current EMQX integration points.
Add the orchestrator without destructive changes.
Prefer:
New files
New services
New adapters
Avoid:
Large refactoring
Deleting existing components
Final Objective
RentMaikar should evolve into a smart vehicle intelligence platform where:
Traccar provides GPS connectivity.
EMQX provides IoT messaging.
Resident Orchestrator provides coordination.
AI services provide intelligence.
RentMaikar provides the user and business experience.
