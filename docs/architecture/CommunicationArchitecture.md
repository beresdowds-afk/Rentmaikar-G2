# RentMaikar Communication Architecture

Canonical layering for connectivity, tracking, messaging and the core platform.
Each layer owns a distinct responsibility and must not absorb another layer's duties.

```text
                 Cellular Network
                       |
                       v
                 Hologram Platform
                       |
        +--------------+--------------+
        |                             |
        v                             v
  Traccar Server                EMQX MQTT Broker
  (or alternative)
        |                             |
        +--------------+--------------+
                       v
             RentMaikar Core Platform
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
   Driver App    Owner Portal   Admin Portal
                       |
                 APIs & Services
                       |
      Notifications - Analytics - Billing - Marketplace
```

## Data flow

1. Devices connect over cellular using Hologram eSIM/SIM connectivity.
2. Position and trip protocol traffic terminates at Traccar (or its alternative).
3. Real-time telemetry, commands, and events flow over EMQX MQTT topics.
4. RentMaikar Core ingests both streams, persists them, and drives business workflows.
5. Driver App, Owner Portal, and Admin Portal consume Core APIs & Services only.

## Boundary rules

- Hologram never performs tracking, telemetry parsing, or identity verification.
- Traccar never manages SIMs, billing, or user identity.
- EMQX never stores business state; it transports messages only.
- Client apps never call Hologram, Traccar, or EMQX management APIs directly — always through RentMaikar Core services (edge functions).
- Identity verification (Persona) is independent of all connectivity layers.

See: `HologramResponsibilities.md`, `TraccarResponsibilities.md`,
`EmqxResponsibilities.md`, `RentMaikarCoreResponsibilities.md`, `architectureRule.md`.
