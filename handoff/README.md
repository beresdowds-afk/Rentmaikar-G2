# RentMaikar Architecture & Database Cutover Package

This directory contains the production handoff specifications, API contracts, credential matrices, cutover procedures, and OpenAPI documentation for separating the RentMaikar frontend from the backend services and transitioning from Lovable-managed Supabase to the private Supabase database.

---

## Package Inventory

| File | Purpose |
|------|---------|
| [`API-CONTRACT.md`](./API-CONTRACT.md) | Frontend-to-Backend HTTP REST, WebSocket, and Webhook interfaces |
| [`CREDENTIALS.md`](./CREDENTIALS.md) | Secret isolation policy, credential catalog, and environment variable matrix |
| [`CUTOVER.md`](./CUTOVER.md) | Operational procedure for cutting over database and APIs to private infrastructure |
| [`env/public-frontend.env.template`](./env/public-frontend.env.template) | Public frontend (rentmaikar.com, `rentmaikar-g2`) public/runtime values only; no secrets |
| [`env/admin-backend.env.template`](./env/admin-backend.env.template) | Admin backend (staging.rentmaikar.com, `rentmaikar-backend`): `PORTAL_*` and other backend secrets |
| [`backend.env.template`](./backend.env.template) | Pointer to the two per-surface templates above |
| [`DEPLOYMENT-SURFACES.md`](./DEPLOYMENT-SURFACES.md) | Frontend and backend deployment ownership, domains, ports, health checks, and route ownership |
| [`openapi.yaml`](./openapi.yaml) | OpenAPI 3.0 specification for backend endpoints |

---

## Infrastructure Topology

```
+-------------------------+  +----------------------------------+
| 1. Public frontend      |  | 2. Backend API and admin portal   |
|    rentmaikar.com       |  |    staging.rentmaikar.com         |
|    nginx, rentmaikar-g2 |  |    rentmaikar-backend, port 8080  |
|    public VITE_* only   |  |    PORTAL_* + backend secrets     |
+------------+------------+  +----------------+-----------------+
             |                                |
             | Supabase Auth (anon key)       | Service Role / API Keys
             v                                v
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

> The public nginx frontend is deployed to `rentmaikar-g2`; the API gateway and host-gated admin portal run on `rentmaikar-backend`. Public nginx returns 404 for `/portal` and `/admin`. See [`DEPLOYMENT-SURFACES.md`](./DEPLOYMENT-SURFACES.md).

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
