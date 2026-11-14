# Frontend deployment parity audit

Audit of repository commit `7809275c03fbdbf482886a5b2097ab8ff7a9fd74`, 2026-11-14.
This is an investigation and partial implementation, not a production cutover.

## Evidence and limitations

- The default and local branch is `main` at the commit above. The latest Pages
  workflow run for that commit succeeded on 2026-11-12. Its corresponding
  production pipeline failed at typecheck; its frontend and backend deployment
  jobs were skipped. This establishes workflow results, not what the live hosts
  currently serve. Cloud Build may also deploy the frontend.
- DNS resolution for both `rentmaikar.com` and the supplied G2 URL failed from
  this environment, including through the web fetch service. Consequently the
  live HTML, chunk inventory, SHA-256 hashes, runtime behavior and deployment
  source commits could not be established. The bundle names
  `index-CBZ5WVRF.js` and `index-VZ40TKCS.js` were supplied by the requester;
  they were not independently verified. No chunk hashes are available.
- The Google Cloud CLI is unavailable. The live Cloud Run revision, image,
  configuration, IAM, traffic split and Cloud Build triggers are unknown.
  GitHub API access to repository Actions variables and secrets is denied;
  only their referenced names in workflows are known. `Rentmaikar Production`
  currently has a required reviewer; `github-pages` has no protection rule.
- There is no evidence sufficient to identify the exact live functional
  differences or attribute the live divergence to one specific deployment.
  Independent builds, different build inputs and skipped deployments are
  established mechanisms that can cause divergence.

## Existing paths and configuration

| Surface | Repository mechanism |
| --- | --- |
| Pages | `.github/workflows/pages.yml` builds on every `main` push or dispatch, copies `index.html` to `404.html`, adds `.nojekyll` and `CNAME`, then deploys `dist` with the Pages artifact actions. Pages is configured for workflow publishing. |
| G2 | `.github/workflows/deploy.yml` separately builds the root Dockerfile and deploys a new `rentmaikar-g2` image after validation. It uses GitHub OIDC/WIF variables and also contains a separate backend deployment job. |
| Cloud Build | `cloudbuild.yaml` separately builds and deploys the frontend and then builds and deploys the backend. Its frontend Docker arguments include a staging API variable without a preceding `--build-arg`; the actual trigger and outcome are not verified. `cloudbuild-backend.yaml` is a separate backend build path. |
| Containers | Root `Dockerfile` builds Vite in Node 20 Alpine, then copies `dist` into Nginx 1.25 Alpine. The template retains runtime backend and upstream URL substitution, health endpoints, API proxying and SPA routing. `frontend/Dockerfile` is another frontend image definition, but its deployment is unverified. |
| Validation | `ci.yml` and `deploy.yml` run lint, typecheck, unit tests and build, with other checks in `ci.yml`. Pages deploys without these validation jobs. |

`npm run build` runs the sitemap, PDF and PWA icon generators before Vite and
the server bundle. The sitemap fetches changing vehicle records and uses the
current date; its failure can fall back to fewer records. Thus a source commit
alone does not determine all artifact bytes. The Pages workflow allows
`npm install` after `npm ci` fails; the committed root lockfile currently does
not match `package.json`, and both clean-install variants fail locally.
Dependency resolution is therefore not presently reproducible.

Pages supplies Vite Supabase variables but does not set the API base variables.
The Actions Docker build and Cloud Build specify staging API base variables.
`vite.config.ts` also explicitly replaces several environment expressions;
notably the publishable-key expressions read `SUPABASE_PUBLISHABLE_KEY`, not
the similarly named `VITE_` inputs. These are build inputs, not evidence of
their actual values in either live bundle. No credential values are recorded
in this report.

In the checked-in source, production `backend-bridge.ts` uses the G2 gateway
as its primary API base and staging for fallback and the `EventSource` stream.
The bridge constructor starts the listener and heartbeat watchdog; the
provider subscribes to events, and the admin status indicator exposes bridge
state and controls. This audit makes no bridge changes. The app uses
`BrowserRouter`, onboarding routes and the onboarding deep-link redirect;
authentication redirects include the current browser origin. OAuth redirect
allowlists and browser behavior on the two origins are unverified.

Identical JS alone would not prove equivalent behavior: Pages handles SPA
fallback through `404.html`, whereas Nginx uses `try_files`, proxies `/api/`
and `/functions/v1/`, proxies `/sitemap.xml`, and explicitly rejects `/admin`
and `/portal`. Some frontend code uses origin-relative API routes, including
an admin `EventSource`. CORS, OAuth allowlists, origin-specific storage,
upstream behavior, caches and those ingress differences require review and
non-mutating end-to-end verification before promoting a shared release.

## Canonical release decision and cutover prerequisites

The proposed source of truth is a reviewed production commit plus a single
immutable, retained build artifact and its manifest, not either live site.
After a clean locked install and all existing checks, build once with an
explicitly reviewed common Vite configuration. Add Pages routing files before
hashing. Publish exactly those bytes to Pages and package them in an Nginx
image without running Vite again. Preserve the existing runtime service
account, variables, secret references, health checks, scaling and proxy
configuration; update only the frontend image.

Retain the approved artifact and manifest in a durable immutable store, with
an approved release pointer and image digest; GitHub Actions artifacts alone
expire. Repair must retrieve and authenticate that artifact, not rebuild it
from the commit or copy from a live site. Concurrency must serialize release
and repair operations, and a newer approved release must not be overwritten
by an older queued run. A missing canonical artifact, invalid manifest or
failed verification must stop the run, not trigger a speculative deployment.
Rollback should redeploy a previously approved retained artifact to both
targets under approval and verify it; do not change backend configuration.

Before any worker is enabled, an authorized operator must:

1. Reconcile and commit the lockfile with an approved dependency set; run the
   existing lint, typecheck, tests and build. Pin a compatible Node/npm toolchain.
2. Obtain the actual public manifests and hashes, inspect the Cloud Run revision
   and Cloud Build triggers without logging secrets, and confirm the common
   build inputs, gateway behavior, redirects and origin allowlists.
3. Choose and provision immutable artifact storage and an authenticated
   approved-release pointer, with retention and rollback procedures.
4. Disable or refactor **all** competing frontend deployment paths, including
   any external Cloud Build trigger, while preserving backend deployment
   behavior. The exact Cloud Build trigger configuration is not available here.
5. Confirm the WIF provider, service account, least-privilege IAM, Pages
   permissions, environment protection and Cloud Run image-only update
   semantics. The `Rentmaikar Production` environment's approval gate must
   precede any production deployment.
6. Implement and review one serialized, approval-gated worker with frontend
   change, dispatch and daily drift triggers; test one-target repair and
   failed-deployment handling before enabling it.

Expected cutover files include `.github/workflows/pages.yml`,
`.github/workflows/deploy.yml`, `cloudbuild.yaml`, a new
`.github/workflows/frontend-parity-sync.yml`, a runtime-only frontend
Dockerfile, build/verification tooling and this guide. Backend deployment
steps must not be changed. Further ingress or application changes cannot be
selected safely until the actual origin behavior is verified.

## Implemented offline tooling

`scripts/frontend-release-manifest.mjs` generates non-sensitive metadata with
the commit, timestamp, release ID, aggregate artifact hash, main bundle and
hashes of all artifact files. It verifies the public root HTML, manifest and
every JS/CSS file against a trusted local manifest; this includes lazy chunks.
It does **not** establish configuration equivalence, health, non-JS/CSS
resource integrity at the live endpoint, deployment success or functional
parity. Verification errors do not print URLs or server responses.

```sh
node scripts/frontend-release-manifest.mjs create dist FULL_COMMIT_SHA
node scripts/frontend-release-manifest.mjs verify dist/release-manifest.json https://example.com
node --test scripts/frontend-release-manifest.test.mjs
```

The manifest itself is excluded from the aggregate hash to avoid recursion.
Keep the trusted manifest with the immutable artifact; a matching manifest
downloaded from a deployment is not independently trusted. No workflow uses
this tooling yet. The manifest tests check deterministic hashing for identical
fixture files, not reproducibility of the full application build.
