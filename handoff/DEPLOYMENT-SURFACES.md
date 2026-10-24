# RentMaikar Deployment Surfaces

This document describes the three deployment surfaces as the repository owner defines them, and compares that **intended** mapping with what the repository's build/deploy files **actually** do today. Nothing here changes any deploy, Cloud Build, or workflow file.

> **Naming used throughout:** `rentmaikar.com` (public site, nginx), `staging.rentmaikar.com` (admin-only portal), `rentmaikar-backend` (Cloud Run service), `rentmaikar-g2` (Cloud Run service).

## Summary matrix (intended mapping)

| # | Surface | Domain | Cloud Run service | Source Dockerfile / workflow | Audience | Secrets allowed |
|---|---|---|---|---|---|---|
| 1 | Public frontend (nginx) | `rentmaikar.com` | `<nginx-frontend-service>` (see discrepancy D1) | Root `Dockerfile` (nginx + SPA); `cloudbuild.yaml` / `.github/workflows/deploy.yml` | Public | **N** (public `VITE_*` only) |
| 2 | Admin-only portal | `staging.rentmaikar.com` | `rentmaikar-backend` | `backend/Dockerfile`; `cloudbuild-backend.yaml` / `.github/workflows/deploy.yml` | Admin-only | **Y** (`PORTAL_*`, backend secrets) |
| 3 | Backend | not mapped in repo | `rentmaikar-g2` (owner's intent) | Not defined in repo (see discrepancy D1) | Internal / API | **Y** (service-role key, provider secrets) |

## Current state vs intended state

| Item | Intended (owner) | Current repo state | Evidence |
|---|---|---|---|
| `rentmaikar-g2` runs | Backend | **Root `Dockerfile` nginx SPA image, `--port 80`**; proxies `/api/*` and `/portal` to `rentmaikar-backend` | `cloudbuild.yaml` step 3; `.github/workflows/deploy.yml` (`gcloud run deploy rentmaikar-g2 ... --port 80`); `Dockerfile` |
| `rentmaikar-backend` runs | Admin-only portal for `staging.rentmaikar.com` | Express API gateway **and** portal (`/portal`, `/api/portal`), `backend/Dockerfile`, `--port 8080`, `PUBLIC_BACKEND_URL=https://staging.rentmaikar.com` | `cloudbuild.yaml` step 6; `cloudbuild-backend.yaml`; `backend/Dockerfile`; `backend/src/index.ts` |
| `rentmaikar.com` served by | nginx frontend | nginx image deployed to `rentmaikar-g2` (comment in `cloudbuild.yaml`: "serving rentmaikar.com") | `cloudbuild.yaml` |
| Backend API location | `rentmaikar-g2` | `rentmaikar-backend` (the SPA is built with `VITE_API_BASE_URL=https://staging.rentmaikar.com/api` in `cloudbuild.yaml`; the root `Dockerfile` default and `src/lib/backend-bridge.ts` reference `https://rentmaikar-g2-672260445879.europe-west1.run.app/api`) | `cloudbuild.yaml`, `Dockerfile`, `src/lib/backend-bridge.ts` |
| Portal fallback credentials | Env-only | Env-only: `backend/src/services/portalAuth.ts` has no hardcoded defaults and requires `PORTAL_SECRET_KEY`, `PORTAL_ADMIN_EMAIL`, `PORTAL_ADMIN_PASSWORD` and `PORTAL_MASTER_KEY` in production | `backend/src/services/portalAuth.ts` |
| `.github/workflows/pages.yml` | n/a | Separate GitHub Pages frontend deploy; not one of the three surfaces | `.github/workflows/pages.yml` |

**Conclusion:** the repo contradicts item 3 of the owner's mapping. Today `rentmaikar-g2` is the public nginx frontend, and the backend is `rentmaikar-backend`. This document states the intended mapping in the sections below but marks every statement that the repo does not currently support.

## Known discrepancies / follow-ups (owner action)

- **D1 – `rentmaikar-g2` role.** `cloudbuild.yaml` and `.github/workflows/deploy.yml` deploy the nginx frontend image to `rentmaikar-g2`. To make it the backend, those deploy steps would need a new image source (`./backend` / `backend/Dockerfile`), `--port 8080`, and backend env vars; the frontend would need a different service name. Alternatively, update the intended mapping to match the repo. Owner must decide.
- **D2 – API base URL.** `Dockerfile` (`ARG VITE_API_BASE_URL`), `src/lib/backend-bridge.ts` (line ~134) point at `rentmaikar-g2-…run.app/api`, while `cloudbuild.yaml` passes `https://staging.rentmaikar.com/api`. These need to be aligned with the chosen mapping.
- **D3 – nginx upstream.** `Dockerfile` env default and both deploy files set `BACKEND_URL=https://rentmaikar-backend-672260445879.europe-west1.run.app`; `nginx.conf.template` proxies `/api/`, `/portal`, `/sitemap.xml` there, so the public nginx surface exposes `/portal` paths. Confirm whether `/portal` should be reachable from `rentmaikar.com`.
- **D4 – hardcoded portal defaults** — ADDRESSED: `backend/src/services/portalAuth.ts` no longer contains defaults and production startup fails unless all four `PORTAL_*` variables are set. Previously committed default values must still be rotated.
- **D5 – `docker-compose.yml`** builds `frontend/Dockerfile` as `frontend` and `backend/Dockerfile` as `rentmaikar-backend`; it does not use a `rentmaikar-g2` name.
- **D6 – env templates** — ADDRESSED: per-surface templates live in [`env/public-frontend.env.template`](./env/public-frontend.env.template) and [`env/admin-backend.env.template`](./env/admin-backend.env.template); `backend.env.template` is a pointer. `npm run check:env-surfaces` enforces the split.

---

## Surface 1 — Public frontend: `rentmaikar.com` (nginx)

| Field | Value |
|---|---|
| Purpose | Public marketing and customer SPA (React/Vite) served by nginx |
| Public or admin-only | Public |
| Owner | `<owner>` |
| Cloud Run service | Currently `rentmaikar-g2` (see D1); intended name `<nginx-frontend-service>` |
| Domain | `rentmaikar.com` |
| Image / Dockerfile | Root `Dockerfile` (Node 20 build, `nginx:1.25-alpine` runner); `nginx.conf.template` |
| Build / deploy | `cloudbuild.yaml` (steps 1–3) or `.github/workflows/deploy.yml` (frontend job) |
| Runtime port | `80` (`--port 80`) |
| Env vars (build-time) | `VITE_SUPABASE_URL=<supabase-url>`, `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>`, `VITE_SUPABASE_ANON_KEY=<anon-key>`, `VITE_API_BASE_URL=<api-base-url>` |
| Env vars (runtime) | `BACKEND_URL=<rentmaikar-backend-url>`, `SUPABASE_URL=<supabase-url>` |
| Health check | `/healthz` (also `/_health`, `/livez`, `/readyz`) |

**Never set here:** `PORTAL_*`, `SUPABASE_SERVICE_ROLE_KEY`, or any other backend secret (Twilio, Sent.dm, PayPal, Paystack, OPay, Persona, Resend, etc.). Only public `VITE_*` values and non-secret runtime URLs are allowed.

## Surface 2 — Admin-only portal: `staging.rentmaikar.com` (`rentmaikar-backend`)

| Field | Value |
|---|---|
| Purpose | Admin-only portal and API gateway (Express / Node 20); serves `/portal`, `/api/portal`, `/api/*` |
| Public or admin-only | Admin-only (portal is protected by `PORTAL_*` authentication) |
| Owner | `<owner>` |
| Cloud Run service | `rentmaikar-backend` |
| Domain | `staging.rentmaikar.com` |
| Image / Dockerfile | `backend/Dockerfile` |
| Build / deploy | `cloudbuild-backend.yaml`, or `cloudbuild.yaml` (steps 4–6), or `.github/workflows/deploy.yml` (backend job). Deploy commands use `--update-env-vars`, which retains existing Secret Manager bindings for `PORTAL_*` and other secrets |
| Runtime port | `8080` |
| Env vars / secrets | `PORTAL_SECRET_KEY=<secret>`, `PORTAL_ADMIN_EMAIL=<admin-email>`, `PORTAL_ADMIN_PASSWORD=<secret>`, `PORTAL_MASTER_KEY=<secret>`, `SUPABASE_SERVICE_ROLE_KEY=<secret>`, `PUBLIC_BACKEND_URL=https://staging.rentmaikar.com`, plus the provider secrets in [`env/admin-backend.env.template`](./env/admin-backend.env.template) |
| Health check | `/api/health` |

`PORTAL_*` values must come from env / Secret Manager and never be hardcoded (D4 addressed).

## Surface 3 — Backend: `rentmaikar-g2` (owner's intended mapping)

| Field | Value |
|---|---|
| Purpose | Backend service (per owner). **Not currently true in the repo** — see D1 |
| Public or admin-only | Internal / API (`<owner>` to confirm) |
| Owner | `<owner>` |
| Cloud Run service | `rentmaikar-g2` |
| Domain | `<domain-or-run.app-url>` (currently `rentmaikar-g2-672260445879.europe-west1.run.app` is referenced by `Dockerfile` and `src/lib/backend-bridge.ts`) |
| Image / Dockerfile | Intended: `backend/Dockerfile`. Currently deployed: root `Dockerfile` (nginx) |
| Build / deploy | Currently `cloudbuild.yaml` step 3 / `.github/workflows/deploy.yml` deploy nginx here. A backend deploy to this name is not defined |
| Runtime port | Intended `8080` (backend); currently `80` |
| Env vars / secrets | Same backend variables as Surface 2 ([`env/admin-backend.env.template`](./env/admin-backend.env.template)), placeholders only |
| Health check | Intended `/api/health` (backend); currently `/healthz` (nginx) |
