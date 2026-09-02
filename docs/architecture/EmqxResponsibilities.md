# EMQX Responsibilities

EMQX is the real-time messaging backbone. It transports, it does not decide.

Responsible for:

- MQTT messaging
- Device authentication (broker-level)
- Real-time telemetry
- Command delivery
- Event streaming
- Sensor communication
- OTA messaging

Must never handle:

- Business state, billing, or user records (RentMaikar Core)
- SIM lifecycle or carrier switching (Hologram)
- Trip history, geofences, playback (Traccar or alternative)
- Identity verification (Persona)

Operational notes:

- Broker connectivity (MQTT host/port, TLS 8883 or WSS 443) is separate from the
  management API used only by admin dashboards.
- Management endpoints are admin-configurable via `platform_kv_settings`
  (`emqx_management_config`); monitoring degrades gracefully when unavailable.
- Topic convention: `rentmaikar/vehicle/{vehicleId}/telemetry|command|event`.

Integration points:

- `supabase/functions/_shared/emqx-config.ts`
- `supabase/functions/emqx-monitoring/index.ts`
- `src/lib/mqtt-client.ts`, `src/services/mqttBridge.ts`
