# RentMaikar SareKon / GPSANDTRACK Location Integration

**Document:** `docs/gps/sarekon-integration.md`  
**Status:** Implementation Specification  
**Provider:** SareKon / GPSANDTRACK  
**Purpose:** Feed SareKon vehicle locations into RentMaikar's Unified Location Service and existing EMQX map.

---

# 1. Objective

Implement:

```text
SAREKON
   │
   ├── Authentication
   │       ↓
   │      SID
   │
   └── /location/list.json
            ↓
     SareKon Location Adapter
            ↓
     Unified Location Service
            ↓
       PostgreSQL
            +
          EMQX
            ↓
     Existing EMQX Map
```

Do not create a separate SareKon map.

---

# 2. Authoritative API Information

The supplied SareKon Dealer API documentation identifies the API base as:

```text
https://api.sarekon.com/v1
```

The relevant endpoint is:

```http
GET /location/list.json
```

Therefore:

```text
https://api.sarekon.com/v1/location/list.json
```

The endpoint is documented as returning the last known event and last known location for each Tracker (Device-Vehicle-Driver).

---

# 3. Authentication

SareKon requires a session ID:

```text
sid
```

The backend must:

1. Authenticate with SareKon.
2. Obtain `sid`.
3. Cache/reuse the session.
4. Detect expired sessions.
5. Re-authenticate when necessary.
6. Retry the location request after successful re-authentication.

Never expose `sid` or credentials to the frontend.

---

# 4. Configuration

Use backend secrets/environment variables.

Conceptually:

```env
SAREKON_API_BASE_URL=https://api.sarekon.com/v1
SAREKON_USERNAME=
SAREKON_PASSWORD=
SAREKON_LOCATION_POLL_INTERVAL_MS=15000
```

If the existing project uses another secret-management convention, use that convention.

Do not hard-code credentials.

---

# 5. Current Location Endpoint

Use:

```http
GET /location/list.json
```

Parameters:

```text
sid
device_ids[]
pagekey
```

The primary request should use `device_ids[]` to retrieve only the SareKon devices associated with RentMaikar vehicles.

Conceptual request:

```text
GET /location/list.json
    ?sid=<SESSION_ID>
    &device_ids[]=8037452323
    &device_ids[]=8037452324
```

Do not put the city/country in the API path unless required by the actual API.

---

# 6. SareKon Device ID

Use SareKon's system-assigned:

```text
device_id
```

Do not assume that a physical serial number, IMEI, MEID, or printed device number is the same identifier.

RentMaikar should store the mapping:

```text
RentMaikar vehicle
       ↓
provider = sarekon
       ↓
provider_device_id = SareKon device_id
```

---

# 7. Response Envelope

The supplied documentation shows the current-location response conceptually as:

```json
{
  "prevkey": "...",
  "nextkey": "...",
  "count": 0,
  "locations": [
    {}
  ]
}
```

The important collection is:

```text
locations[]
```

`prevkey` and `nextkey` are pagination cursors.

Do not invent fields not present in the live response.

---

# 8. Location Fields

The supplied SareKon documentation demonstrates location data containing fields including:

```text
latitude
longitude
address
speed
speed_display
bearing
bearing_deg
is_historic
```

It also demonstrates a location structure containing a GPS timestamp/event timestamp.

The implementation must parse the actual `/location/list.json` response defensively.

Do not assume that every field is always present.

---

# 9. Normalized SareKon Location

Convert each valid SareKon location into:

```typescript
{
  vehicleId,
  provider: "sarekon",
  providerDeviceId,
  latitude,
  longitude,
  altitude,
  speed,
  heading,
  address,
  gpsTimestamp,
  receivedAt,
  isHistoric
}
```

Use the project's existing normalized location type if one already exists.

---

# 10. SareKon Adapter

Create or extend:

```text
SareKonLocationAdapter
```

Responsibilities:

1. Obtain valid `sid`.
2. Retrieve active RentMaikar SareKon device IDs.
3. Call `/location/list.json`.
4. Parse the response.
5. Validate coordinates.
6. Map each SareKon device to a RentMaikar vehicle.
7. Normalize the location.
8. Pass it to `UnifiedLocationService`.

The adapter must not directly manipulate the map.

---

# 11. 15-Second Worker

Create a backend scheduled worker.

Default:

```text
SAREKON_LOCATION_POLL_INTERVAL_MS=15000
```

The 15-second interval is a RentMaikar implementation default.

**Important:** the supplied SareKon documentation does not establish that `/location/list.json` itself requires a 15-second polling interval. Do not represent 15 seconds as a SareKon requirement.

The interval must be configurable.

Worker flow:

```text
START
  ↓
Ensure valid SareKon SID
  ↓
Get active SareKon device IDs
  ↓
Call /location/list.json
  ↓
Parse locations[]
  ↓
Normalize locations
  ↓
Unified Location Service
  ↓
PostgreSQL + EMQX
  ↓
Wait 15 seconds
  ↓
Repeat
```

---

# 12. Batch Device Requests

Prefer using multiple:

```text
device_ids[]
```

parameters in a single request where supported.

Example:

```text
device_ids[]=8037452323
device_ids[]=8037452324
device_ids[]=8037452325
```

Do not create one HTTP request per vehicle unless necessary.

If the fleet becomes too large for a single request, implement controlled batching.

---

# 13. Pagination

The endpoint documents:

```text
prevkey
nextkey
pagekey
```

Use pagination only when necessary.

For a normal request for explicitly configured RentMaikar device IDs, determine from live API behavior whether pagination is needed.

Do not blindly follow `nextkey` forever.

If pagination is needed:

```text
request page
 ↓
process locations
 ↓
if nextkey exists:
    request next page
else:
    finish
```

Apply safe limits.

---

# 14. Rate Limiting

The SareKon API documentation defines rate-limit errors including:

```text
HTTP 429
```

and a SareKon rate-limit error.

Implement:

- HTTP 429 detection
- provider-specific rate-limit detection
- exponential backoff
- maximum retry delay
- structured logging
- no tight retry loop

Do not continuously retry every second.

Normal polling and error retry are separate mechanisms.

---

# 15. Session Expiration

If SareKon indicates that the session has expired:

```text
invalidate current sid
        ↓
authenticate
        ↓
obtain new sid
        ↓
retry location request once
```

If the retry fails:

```text
log error
wait for next scheduled cycle
```

Never create an infinite re-authentication loop.

---

# 16. Empty Location Response

If:

```json
{
  "count": 0,
  "locations": []
}
```

then:

- do not treat this automatically as a fatal API failure
- retain the previous vehicle location
- do not move the map marker
- record the polling/check timestamp
- allow stale/offline logic to determine vehicle status

---

# 17. Last-Known Location

SareKon's endpoint is documented as returning the last known location.

Therefore store:

```text
gpsTimestamp
receivedAt
```

separately.

Example:

```text
gpsTimestamp = 2026-08-16T14:25:00Z
receivedAt   = 2026-08-16T14:25:15Z
```

The difference is important for determining whether a vehicle is actually reporting fresh GPS data.

---

# 18. Stale Location

Do not interpret an old last-known coordinate as a live position.

The RentMaikar UI should be able to show something such as:

```text
LIVE
```

or:

```text
LAST SEEN 4 MINUTES AGO
```

according to the application's existing status rules.

If the codebase already has stale-location thresholds, reuse them.

Do not introduce contradictory thresholds.

---

# 19. Coordinate Validation

Validate:

```text
-90 <= latitude <= 90
-180 <= longitude <= 180
```

Reject:

- null coordinates
- non-numeric coordinates
- NaN
- Infinity
- out-of-range values

One malformed device must not stop processing of the remaining devices.

---

# 20. MQTT Publication

The SareKon adapter must not publish provider-specific data directly to the map.

Instead:

```text
SareKon
   ↓
SareKonLocationAdapter
   ↓
NormalizedVehicleLocation
   ↓
UnifiedLocationService
   ↓
EMQX Publisher
```

Preferred topic:

```text
rentmaikar/vehicles/{vehicleId}/location
```

Example:

```text
rentmaikar/vehicles/RM-1001/location
```

Payload concept:

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

Inspect the existing EMQX implementation before changing topics.

Preserve compatibility with the existing map.

---

# 21. Database

Use the Unified Location Service to persist SareKon locations.

Do not create a SareKon-only location table unless the existing architecture genuinely requires one.

Store provider information:

```text
provider = sarekon
provider_device_id = <SareKon device_id>
```

This allows SareKon, Traccar, and EMQX GPS data to coexist in the same location architecture.

---

# 22. Error Isolation

SareKon errors must not stop:

- Traccar
- EMQX GPS
- the existing EMQX map

Likewise, failures in other providers must not stop SareKon processing.

---

# 23. Logging

Use structured server-side logging.

Recommended events:

```text
[SAREKON] Authentication started
[SAREKON] Authentication successful
[SAREKON] Session expired
[SAREKON] Location poll started
[SAREKON] Devices requested: N
[SAREKON] Locations returned: N
[SAREKON] Invalid coordinates for device X
[SAREKON] Rate limited
[LOCATION] Vehicle X updated
[MQTT] Vehicle X location published
[SAREKON] Poll completed
```

Never log:

- passwords
- session IDs
- API secrets

---

# 24. Diagnostics

If an admin diagnostics interface exists, expose safe information:

```text
SareKon
Status: Connected
Last successful poll: <timestamp>
Configured devices: <N>
Locations received: <N>
Last successful location: <timestamp>
Last error: <safe message>
```

Never expose credentials or `sid`.

---

# 25. Testing

Create mocked tests for:

### Authentication

- successful login
- failed login
- expired session
- re-authentication

### Location API

- valid response
- empty response
- malformed response
- multiple locations
- missing coordinates
- invalid coordinates
- stale GPS timestamp

### Rate limiting

- HTTP 429
- SareKon rate-limit error
- exponential backoff

### Mapping

- SareKon device → RentMaikar vehicle
- unknown device
- inactive device

### MQTT

- normalized payload
- correct vehicle topic
- duplicate suppression where appropriate

### Integration

```text
SareKon
  ↓
Adapter
  ↓
Unified Location Service
  ↓
PostgreSQL
  ↓
EMQX
  ↓
Existing Map
```

Use mock credentials only.

---

# 26. Live API Verification

The supplied documentation demonstrates the API structure but does not provide the live response for the specific RentMaikar SareKon account.

Therefore, before declaring the live integration complete, verify with actual authorized SareKon credentials that:

1. Authentication succeeds.
2. `sid` is obtained.
3. `/location/list.json` is accessible.
4. configured `device_ids[]` return locations.
5. actual `locations[]` response fields match the parser.
6. latitude/longitude are valid.
7. GPS timestamps are correctly interpreted.
8. MQTT receives the normalized location.
9. the existing EMQX map moves the corresponding vehicle marker.

Do not claim live success when only mocked tests have passed.

---

# 27. Definition of Done

The SareKon integration is complete when:

```text
SareKon Authentication
        ↓
       SID
        ↓
/location/list.json
        ↓
15-second configurable worker
        ↓
SareKonLocationAdapter
        ↓
NormalizedVehicleLocation
        ↓
UnifiedLocationService
        ↓
 ┌──────┴──────┐
 ▼             ▼
PostgreSQL    EMQX
                ↓
        Existing EMQX Map
```

is operational.

The implementation must not create a third map.

The SareKon integration must coexist with:

```text
Traccar → Unified Location Service
EMQX GPS → Unified Location Service
```

and all three sources must ultimately be capable of appearing on the same RentMaikar map.

