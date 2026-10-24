# RentMaikar Architecture & Database Cutover Package

This directory contains the production handoff specifications, API contracts, credential matrices, cutover procedures, and OpenAPI documentation for separating the RentMaikar frontend from the backend services and transitioning from Lovable-managed Supabase to the private Supabase database.

---

## Package Inventory

| File | Purpose |
|------|---------|
| [`API-CONTRACT.md`](./API-CONTRACT.md) | Frontend-to-Backend HTTP REST, WebSocket, and Webhook interfaces |
| [`CREDENTIALS.md`](./CREDENTIALS.md) | Secret isolation policy, credential catalog, and environment variable matrix |
| [`CUTOVER.md`](./CUTOVER.md) | Operational procedure for cutting over database and APIs to private infrastructure |
| [`DEPLOYMENT-SURFACES.md`](./DEPLOYMENT-SURFACES.md) | The three deployment surfaces: ownership, Cloud Run service, domain, ports, health checks, and current-vs-intended discrepancies |
| [`backend.env.template`](./backend.env.template) | Production environment variable template for backend containers |
| [`openapi.yaml`](./openapi.yaml) | OpenAPI 3.0 specification for backend endpoints |

---

## Infrastructure Topology

```
+-------------------------+  +-----------------------------+  +----------------------------+
| 1. Public frontend      |  | 2. Admin-only portal        |  | 3. Backend                 |
|    rentmaikar.com       |  |    staging.rentmaikar.com   |  |    Cloud Run: rentmaikar-g2|
|    nginx (root          |  |    Cloud Run:               |  |    (owner's intent; repo   |
|    Dockerfile, port 80) |  |    rentmaikar-backend       |  |    currently deploys the   |
|    public VITE_* only   |  |    backend/Dockerfile, 8080 |  |    nginx image here: see   |
|                         |  |    PORTAL_* + secrets       |  |    DEPLOYMENT-SURFACES.md) |
+------------+------------+  +--------------+--------------+  +-------------+--------------+
             |                              |                               |
             | Supabase Auth (anon key)     | Service Role / API Keys       | Service Role / API Keys
             v                              v                               v
+-------------------------------------------------------------------------+
|                  Private Supabase Database & Auth                       |
|             https://jrsydiofzceoeddjogov.supabase.co                    |
|       - 367 Applied Migrations (RLS, Triggers, Functions)               |
|       - VoIP, Fleet Telematics, IoT, Billing, Multi-Region              |
+-------------------------------------------------------------------------+
              |                                           |
              v                                           v
+---------------------------+             +-------------------------------+
|    Twilio Voice & SMS     |             |      Sent.dm / CPaaS          |
|    Inbound Call Queue     |             |    WhatsApp & Notifications   |
+---------------------------+             +-------------------------------+
```

> Today the repo deploys the nginx frontend to `rentmaikar-g2` and the backend to `rentmaikar-backend`. See [`DEPLOYMENT-SURFACES.md`](./DEPLOYMENT-SURFACES.md#current-state-vs-intended-state).

---

## Quick Reference Commands

- **Run database seed & loader**:
  ```bash
  ./scripts/load-new-supabase.sh
  ```

- **Generate consolidated schema**:
  ```bash
  node scripts/generate-consolidated-schema.mjs
  ```

- **Start backend locally**:
  ```bash
  cd backend && npm install && npm run dev
  ```
