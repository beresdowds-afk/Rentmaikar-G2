# RentMaikar Architecture & Database Cutover Package

This directory contains the production handoff specifications, API contracts, credential matrices, cutover procedures, and OpenAPI documentation for separating the RentMaikar frontend from the backend services and transitioning from Lovable-managed Supabase to the private Supabase database.

---

## Package Inventory

| File | Purpose |
|------|---------|
| [`API-CONTRACT.md`](./API-CONTRACT.md) | Frontend-to-Backend HTTP REST, WebSocket, and Webhook interfaces |
| [`CREDENTIALS.md`](./CREDENTIALS.md) | Secret isolation policy, credential catalog, and environment variable matrix |
| [`CUTOVER.md`](./CUTOVER.md) | Operational procedure for cutting over database and APIs to private infrastructure |
| [`backend.env.template`](./backend.env.template) | Production environment variable template for backend containers |
| [`openapi.yaml`](./openapi.yaml) | OpenAPI 3.0 specification for backend endpoints |

---

## Infrastructure Topology

```
+---------------------------+             +-------------------------------+
|     Frontend Client       |             |     Backend API Gateway       |
|    (React 18 / Vite)      |             |   (Express / Node.js 20)      |
|    rentmaikar.com         |             |   staging.rentmaikar.com      |
+-------------+-------------+             +---------------+---------------+
              |                                           |
              | Bearer JWT (Supabase Auth)                | Service Role / API Keys
              v                                           v
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
