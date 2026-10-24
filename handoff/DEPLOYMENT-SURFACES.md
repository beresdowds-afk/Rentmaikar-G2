# RentMaikar Deployment Surfaces

The repository deploys a public nginx SPA and a backend API gateway that also serves the authenticated admin portal. The owner confirmed that `staging.rentmaikar.com` maps to Cloud Run service `rentmaikar-backend`; the Cloud Run domain mapping itself is managed outside this repository.

## Surface mapping

| Surface | Domain | Cloud Run service | Image / deploy configuration | Audience |
|---|---|---|---|---|
| Public frontend (nginx) | `rentmaikar.com` | `rentmaikar-g2` | Root `Dockerfile`; `cloudbuild.yaml` / `.github/workflows/deploy.yml` | Public |
| Backend API and admin portal | `staging.rentmaikar.com` | `rentmaikar-backend` | `backend/Dockerfile`; `cloudbuild-backend.yaml` / `.github/workflows/deploy.yml` | API clients; portal requires admin authentication |

## Route ownership

- The nginx SPA serves the public frontend, proxies `/api/*` and `/functions/v1/*` as configured, and keeps its health probes. It returns 404 for `/portal`, `/portal/*`, `/admin`, and `/admin/*`.
- The backend serves portal HTML at `/`, `/portal/*`, and `/admin/*` only when the request host is exactly `staging.rentmaikar.com`. This host gate applies only to portal HTML; API routes keep their existing host handling.
- Frontend builds use `https://staging.rentmaikar.com/api` for `VITE_API_BASE_URL` and `VITE_STAGING_API_BASE_URL`.
- Portal credentials and backend secrets belong only on `rentmaikar-backend`; never put them in public frontend build args or runtime environment.

`backend/src/services/portalAuth.ts` requires `PORTAL_SECRET_KEY`, `PORTAL_ADMIN_EMAIL`, `PORTAL_ADMIN_PASSWORD`, and `PORTAL_MASTER_KEY` in production. Per-surface env templates live in [`env/public-frontend.env.template`](./env/public-frontend.env.template) and [`env/admin-backend.env.template`](./env/admin-backend.env.template); `npm run check:env-surfaces` enforces the split.

---

## Surface 1 — Public frontend: `rentmaikar.com` (nginx)

| Field | Value |
|---|---|
| Purpose | Public marketing and customer SPA (React/Vite) served by nginx |
| Public or admin-only | Public |
| Owner | `<owner>` |
| Cloud Run service | `rentmaikar-g2` |
| Domain | `rentmaikar.com` |
| Image / Dockerfile | Root `Dockerfile` (Node 20 build, `nginx:1.25-alpine` runner); `nginx.conf.template` |
| Build / deploy | `cloudbuild.yaml` (steps 1–3) or `.github/workflows/deploy.yml` (frontend job) |
| Runtime port | `80` (`--port 80`) |
| Env vars (build-time) | `VITE_SUPABASE_URL=<supabase-url>`, `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>`, `VITE_SUPABASE_ANON_KEY=<anon-key>`, `VITE_API_BASE_URL=https://staging.rentmaikar.com/api` |
| Env vars (runtime) | `BACKEND_URL=<rentmaikar-backend-url>` (for `/api` and sitemap), `SUPABASE_URL=<supabase-url>` |
| Health check | `/healthz` (also `/_health`, `/livez`, `/readyz`) |

**Never set here:** `PORTAL_*`, `SUPABASE_SERVICE_ROLE_KEY`, or any other backend secret (Twilio, Sent.dm, PayPal, Paystack, OPay, Persona, Resend, etc.). Only public `VITE_*` values and non-secret runtime URLs are allowed.

## Surface 2 — Backend API and admin portal: `staging.rentmaikar.com` (`rentmaikar-backend`)

| Field | Value |
|---|---|
| Purpose | Express API gateway and admin portal; serves `/`, `/portal`, `/admin`, `/api/portal`, `/api/*` |
| Public or admin-only | API routes remain available; portal HTML is host-gated and portal controls require admin authentication |
| Owner | `<owner>` |
| Cloud Run service | `rentmaikar-backend` |
| Domain | `staging.rentmaikar.com` |
| Image / Dockerfile | `backend/Dockerfile` |
| Build / deploy | `cloudbuild-backend.yaml`, or `cloudbuild.yaml` (steps 4–6), or `.github/workflows/deploy.yml` (backend job). Deploy commands use `--update-env-vars`, which retains existing Secret Manager bindings for `PORTAL_*` and other secrets |
| Runtime port | `8080` |
| Env vars / secrets | `PORTAL_SECRET_KEY=<secret>`, `PORTAL_ADMIN_EMAIL=<admin-email>`, `PORTAL_ADMIN_PASSWORD=<secret>`, `PORTAL_MASTER_KEY=<secret>`, `SUPABASE_SERVICE_ROLE_KEY=<secret>`, `PUBLIC_BACKEND_URL=https://staging.rentmaikar.com`, plus the provider secrets in [`env/admin-backend.env.template`](./env/admin-backend.env.template) |
| Health check | `/api/health` |

`PORTAL_*` values must come from env / Secret Manager and never be hardcoded (D4 addressed).
