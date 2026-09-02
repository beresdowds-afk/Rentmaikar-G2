Architecture Rule

Layer boundaries are strict. A layer may not absorb another layer's responsibility.

1. Persona and Hologram must never directly call each other's services.
2. Identity verification must remain independent of IoT connectivity, and IoT
   connectivity independent of user verification.
3. Traccar (or its alternative) owns GPS/trip/geofence history only. It never
   manages SIMs, billing, or identity.
4. EMQX owns message transport only. It holds no business state.
5. Hologram owns cellular/eSIM connectivity only. It never tracks, verifies, or bills.
6. RentMaikar Core is the only orchestrator and system of record. All cross-layer
   communication happens through Core business workflows and server-side services.
7. Client apps (Driver App, Owner Portal, Admin Portal) call Core APIs only —
   never a provider API directly, and never with provider credentials.

Reference documents:

RentMaikar/
├── docs/
│   └── architecture/
│       ├── CommunicationArchitecture.md
│       ├── RentMaikarCoreResponsibilities.md
│       ├── HologramResponsibilities.md
│       ├── TraccarResponsibilities.md
│       ├── EmqxResponsibilities.md
│       ├── Hologram-Persona-Separation.md
│       ├── PersonaResponsibilities.md
│       ├── IdentityVerificationArchitecture.md
│       └── architectureRule.md
├── architecture/
│   ├── architecture.txt
│   └── resident-ochestrator.md
├── src/
│   ├── services/
│   │   ├── residentOrchestrator.ts
│   │   ├── traccarBridge.ts
│   │   ├── mqttBridge.ts
│   │   └── resident-ochestrator/types.ts
│   └── plugins/
│       ├── pluginManager.ts
│       ├── pluginTypes.ts
│       ├── evBattery/evBatteryPlugin.ts
│       └── obd/obdPlugin.ts
└── supabase/
    └── functions/_shared/
        ├── hologram-client.ts
        ├── traccar-client.ts
        └── emqx-config.ts
