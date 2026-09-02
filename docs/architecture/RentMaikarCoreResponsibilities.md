# RentMaikar Core Platform Responsibilities

RentMaikar Core is the single system of record and the only orchestration layer.

Responsible for:

- Identity management
- Organization management
- Fleet management
- Vehicle lifecycle management
- Driver lifecycle management
- Device lifecycle management
- Provisioning orchestration
- Commissioning orchestration
- Billing
- Marketplace
- Notifications
- API management
- Security policies
- Audit logging

Not responsible for:

- Cellular connectivity or SIM lifecycle (Hologram)
- GPS protocol termination, trips, geofences (Traccar or alternative)
- MQTT transport, device auth at broker level (EMQX)
- KYC/KYB document adjudication (Persona)

Integration rule: every external provider is reached through a server-side
service (Supabase edge function) owned by Core. Clients never hold provider
credentials and never call providers directly.
