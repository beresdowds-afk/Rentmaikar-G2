# RentMaikar Unified GPS Location Architecture

**Document:** `docs/gps/unified-location-architecture.md`  
**Status:** Implementation Specification  
**Scope:** RentMaikar multi-provider vehicle-location architecture

---

## 1. Implementation Directive

This document is the implementation specification for RentMaikar's unified GPS/location architecture.

Before modifying code:

1. Inspect the existing RentMaikar codebase.
2. Identify the current EMQX MQTT implementation.
3. Identify the existing EMQX map.
4. Identify the existing Traccar integration.
5. Identify existing vehicle-location tables/services/hooks.
6. Identify existing vehicle/device relationships.
7. Reuse working functionality wherever possible.
8. Do not create duplicate services, MQTT clients, maps, or location tables unless the existing architecture genuinely requires them.

### Non-negotiable requirements

- **Do not create a third map.**
- **Do not replace the existing EMQX map.**
- **Do not break the existing Traccar integration.**
- **Do not expose GPS-provider credentials to the frontend.**
- **Do not make the browser call SareKon directly.**
- **Do not duplicate existing MQTT infrastructure unnecessarily.**
- **Do not destroy existing location data.**

---

# 2. Target Architecture

The target architecture is:

```text
                         SAREKON / GPSANDTRACK
                                  │
                          Authentication
                                  │
                                 SID
                                  │
                                  ▼
                        /location/list.json
                                  │
                                  │
                         15-second worker
                                  │
                                  ▼
                         SAREKON ADAPTER
                                  │
                                  ▼
                    ┌────────────────────────┐
                    │ RentMaikar Location    │
                    │        Service         │
                    └───────────┬────────────┘
                                │
                       ┌────────┴─────────┐
                       │                  │
                       ▼                  ▼
                  PostgreSQL            EMQX
                  latest/history         MQTT
                                           │
                                           ▼
                                  EXISTING EMQX MAP
```

All providers must ultimately enter the same normalized location pipeline:

```text
Traccar ──────┐
              │
EMQX GPS ─────┼──→ Unified Location Service → PostgreSQL
              │                              │
SareKon ──────┘                              ▼
                                            EMQX
                                              │
                                              ▼
                                      ONE EXISTING MAP
```

---

# 3. Provider Abstraction

RentMaikar must treat GPS providers as interchangeable sources.

Conceptually:

```text
Traccar Adapter
       │
       ▼
Unified Location Service

EMQX GPS Adapter
       │
       ▼
Unified Location Service

SareKon Adapter
       │
       ▼
Unified Location Service
```

Provider-specific response formats must be translated before reaching the common location service.

The map must not contain provider-specific parsing logic.

---

# 4. Normalized Vehicle Location

Use one provider-independent model.

Conceptually:

```typescript
type LocationProvider =
  | "traccar"
  | "emqx"
  | "sarekon";

interface NormalizedVehicleLocation {
  vehicleId: string;
  provider: LocationProvider;
  providerDeviceId: string;

  latitude: number;
  longitude: number;

  altitude?: number;
  speed?: number;
  heading?: number;
  address?: string;

  gpsTimestamp?: string;
  receivedAt: string;

  isHistoric?: boolean;
}
```

If the existing codebase already has an equivalent type, reuse or extend it rather than creating a duplicate.

---

# 5. Vehicle / GPS Device Mapping

A RentMaikar vehicle must be mapped to its GPS provider and provider-specific device identifier.

Conceptually:

```text
RentMaikar Vehicle
        │
        ▼
GPS Provider
        │
        ▼
Provider Device ID
```

For SareKon:

```text
provider = "sarekon"
providerDeviceId = SareKon system-assigned device_id
```

Do not confuse SareKon's system `device_id` with a physical serial number.

If existing database structures can represent this relationship, reuse them.

If not, create a provider-device mapping structure such as:

```text
vehicle_gps_devices

id
vehicle_id
provider
provider_device_id
serial_number
active
created_at
updated_at
```

Recommended uniqueness:

```text
(provider, provider_device_id)
```

Use the existing project naming conventions and migration framework.

---

# 6. Unified Location Service

Create or extend:

```text
UnifiedLocationService
```

Responsibilities:

1. Receive normalized locations.
2. Resolve the RentMaikar vehicle.
3. Validate coordinates.
4. Normalize timestamps.
5. Update latest vehicle location.
6. Persist historical locations where appropriate.
7. Publish normalized location to EMQX.
8. Prevent unnecessary duplicate writes/publications.
9. Track provider/source.
10. Update last-seen/stale status.

The service must not know how Traccar, EMQX GPS, or SareKon internally represent their data.

---

# 7. PostgreSQL

Inspect the existing database first.

If an existing location table is suitable, reuse or extend it.

If a new structure is necessary, support:

## Latest location

```text
vehicle_id
provider
provider_device_id
latitude
longitude
altitude
speed
heading
address
gps_timestamp
received_at
is_historic
updated_at
```

## Location history

```text
vehicle_id
provider
provider_device_id
latitude
longitude
altitude
speed
heading
address
gps_timestamp
received_at
is_historic
```

Use appropriate indexes for:

- `vehicle_id`
- `provider`
- `provider_device_id`
- `gps_timestamp`

Do not blindly write an identical location every 15 seconds if nothing has changed.

---

# 8. EMQX

Reuse the existing EMQX MQTT connection/client where possible.

The preferred provider-independent topic is:

```text
rentmaikar/vehicles/{vehicleId}/location
```

Example:

```text
rentmaikar/vehicles/RM-1001/location
```

Conceptual payload:

```json
{
  "vehicleId": "RM-1001",
  "provider": "sarekon",
  "providerDeviceId": "8037452323",
  "latitude": 6.5244,
  "longitude": 3.3792,
  "speed": 42,
  "heading": 142,
  "address": "...",
  "gpsTimestamp": "2026-08-16T14:25:00Z",
  "receivedAt": "2026-08-16T14:25:15Z",
  "isHistoric": false
}
```

Before changing MQTT topics, inspect the existing EMQX implementation. If the current map depends on another topic/payload format, preserve compatibility or implement a controlled migration.

---

# 9. Existing EMQX Map

The existing EMQX map is the **single live vehicle map**.

It must display normalized locations from:

- Traccar
- EMQX GPS
- SareKon

The map should consume normalized RentMaikar location data rather than provider-specific APIs.

Do not create:

- SareKon Map
- Traccar Map
- another EMQX Map

The objective is one unified RentMaikar map.

---

# 10. Traccar Adapter

Do not rewrite working Traccar functionality unnecessarily.

Where necessary, introduce:

```text
TraccarLocationAdapter
```

which converts existing Traccar position data into:

```text
NormalizedVehicleLocation
```

Pipeline:

```text
Traccar
   ↓
Traccar Adapter
   ↓
Unified Location Service
   ↓
PostgreSQL + EMQX
   ↓
Existing EMQX Map
```

---

# 11. EMQX GPS Adapter

Existing EMQX GPS/IoT location data must also be normalized.

Pipeline:

```text
EMQX GPS
   ↓
EMQX GPS Adapter
   ↓
Unified Location Service
   ↓
PostgreSQL + EMQX
   ↓
Existing EMQX Map
```

Reuse existing MQTT subscriptions and infrastructure where possible.

---

# 12. Provider Isolation

A provider failure must not stop other providers.

For example:

```text
SareKon failure
    ≠
Traccar failure

Traccar failure
    ≠
EMQX GPS failure
```

Each adapter should fail independently while the Unified Location Service continues processing healthy sources.

---

# 13. Stale / Last-Known Locations

A location source may return a last-known location rather than a fresh GPS fix.

Therefore store:

```text
gpsTimestamp
receivedAt
```

separately.

The UI should be able to distinguish:

```text
Live
```

from:

```text
Last seen 4 minutes ago
```

Do not delete a previous location merely because a polling cycle returns no new location.

If a provider returns no locations:

```text
retain previous latest location
do not move the marker
update monitoring/last-check status
```

---

# 14. Deduplication

Prevent unnecessary database writes and MQTT publications.

Compare relevant values such as:

- vehicle ID
- provider
- provider device ID
- GPS timestamp
- latitude
- longitude
- speed
- heading

Publish when meaningful location/state changes occur.

If the existing EMQX map requires heartbeat messages, preserve that behavior through a configurable heartbeat mechanism.

---

# 15. Security

Provider credentials and session tokens must remain server-side.

Never expose:

- SareKon username
- SareKon password
- SareKon `sid`
- EMQX private credentials

through:

- React
- browser JavaScript
- localStorage
- frontend public environment variables
- MQTT payloads
- public API responses

Validate all coordinates:

```text
latitude: -90 to 90
longitude: -180 to 180
```

Reject invalid values.

---

# 16. Monitoring

If RentMaikar already has an admin monitoring area, provide provider diagnostics for:

- provider status
- last successful poll
- last successful location
- configured device count
- returned location count
- last safe error message

Never display secrets or session tokens.

---

# 17. Testing

Test:

1. Provider adapters.
2. Normalized location conversion.
3. Coordinate validation.
4. Unified Location Service.
5. PostgreSQL persistence.
6. MQTT payload generation.
7. EMQX map consumption.
8. Provider isolation.
9. Duplicate detection.
10. Stale-location handling.
11. Multiple providers.
12. Multiple vehicles.

Use mocks for external providers.

Do not use production credentials in tests.

---

# 18. Implementation Rules

Before coding:

1. Inspect the existing architecture.
2. Identify reusable services.
3. Identify conflicts.
4. Produce an implementation plan.
5. Only then modify code.

Do not overwrite working code simply to match this document.

Prefer incremental refactoring.

Create proper database migrations where required.

Do not drop existing location data.

---

# 19. Definition of Done

The implementation is complete only when this architecture works:

```text
SareKon
   ↓
/location/list.json
   ↓
SareKon Adapter
   ↓
Unified Location Service
   ↓
PostgreSQL + EMQX
   ↓
Existing EMQX Map
```

and:

```text
Traccar
   ↓
Traccar Adapter
   ↓
Unified Location Service
   ↓
PostgreSQL + EMQX
   ↓
Existing EMQX Map
```

and:

```text
EMQX GPS
   ↓
EMQX GPS Adapter
   ↓
Unified Location Service
   ↓
PostgreSQL + EMQX
   ↓
Existing EMQX Map
```

No third map is permitted.
