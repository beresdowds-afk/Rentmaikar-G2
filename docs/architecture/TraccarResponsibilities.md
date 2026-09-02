# Traccar (or Alternative) Responsibilities

Traccar is the GPS tracking and telematics history layer.

Responsible for:

- GPS tracking
- Trips
- Routes
- Historical playback
- Geofencing
- Telemetry (position-derived)
- Driver behaviour
- Event generation

Must never handle:

- SIM/eSIM lifecycle or carrier operations (Hologram)
- Identity verification or KYC (Persona)
- Billing, marketplace, or notifications (RentMaikar Core)
- MQTT broker administration (EMQX)

Integration points:

- `supabase/functions/_shared/traccar-client.ts` — server-side API client
- `src/services/traccarBridge.ts` — Core-side normalization into orchestrator events

The provider is swappable: any alternative must expose devices, positions,
trip history, geofences and events behind the same bridge contract.
