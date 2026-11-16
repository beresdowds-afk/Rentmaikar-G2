# Deployment & GitHub Integration Guide

This guide details the standard procedure for pushing code to GitHub, resolving repository synchronization failures, and configuring **Application Default Credentials (ADC)** across local, CI/CD (GitHub Actions), and Google Cloud deployment environments.

---

## 1. Standard GitHub Push Procedure

To push updates cleanly without non-fast-forward conflicts, oversized pack timeouts, or credential leakage:

### Preferred Permanent Workflow (Persistent Clone + Pull Request)
Work from a persistent Git clone (local workstation, GitHub Codespaces, or GCP Cloud Shell) where `.git` metadata is preserved across sessions, and open a Pull Request into `main` rather than pushing directly to `main`:

```bash
# 1. Run pre-flight verification & hygiene guardrails
npm run check:env-surfaces
npm run check:email-policy
npm run check:git-hygiene
npm run typecheck
npm run build
npm run diagnose

# 2. Sync with latest remote main and commit to a feature/fix branch
git fetch origin main
git checkout -b fix/<topic> origin/main
git status
git add .
git commit -m "feat(scope): describe verified change"
git push -u origin fix/<topic>
```

### Ephemeral Container Fallback (`npm run git:diff` / `npm run git:push`)
When working from an ephemeral runtime where `.git` is stripped on container restart (or when IDE UI file-difference modals stall scanning thousands of files), use the CLI fast-diff and phased push scripts rather than running `git init && git push`:

```bash
# Inspect exact file differences vs origin/main in ~2 seconds
npm run git:diff

# Push to a feature branch (recommended) or main via transient GIT_ASKPASS
BRANCH=fix/<topic> npm run git:push
```

`scripts/phased-git-push.sh` enforces:
* `core.fileMode false` and `core.preloadIndex true` so container permission resets (`0644`) never generate spurious diffs.
* Explicit `safe.directory` configuration before Git invocations.
* Transient `GIT_ASKPASS` authentication (`GITHUB_TOKEN` is never written into `.git/config`).
* Fail-closed `--depth=1` remote fetch anchoring onto `origin/<branch>` or `origin/main` before staging.
* Pre-commit blob size (`<= 25 MiB`) and restricted-extension guards before each of the 3 phased commits.
* `HTTP/1.1` + `500 MB` post-buffer settings and verified post-push SHA matching.

---

## 2. Resolving Common GitHub Push Failures

If you encounter a push failure or *"Something went wrong. Failed to push commit to GitHub. Please try again."*

### A. Ephemeral `.git` Reset / Unrelated History (`non-fast-forward`)
If the container stripped `.git/`, re-initializing locally without fetching `origin/main` produces an unrelated root commit that GitHub rejects.
* **Solution**: Run `npm run git:push` (or fetch `origin/main` and run `git reset --mixed origin/main` before staging).

### B. Secret Scanning & Push Protection
GitHub blocks pushes that contain unencrypted API keys, service account JSON files, or `.env` files.
* **Solution**: `.gitignore` blocks `.env*` (except `.env.example`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, and `*service-account*.json`. Run `npm run check:git-hygiene` before committing.

### C. Special Characters & Path Encoding
Filenames containing unescaped spaces, quotes, or special symbols (such as backticks \`) will cause GitHub tree serializers to fail.
* **Solution**: Keep all file and folder names in standard PascalCase, camelCase, or kebab-case. Run `npm run check:git-hygiene` and `npm run diagnose`.

### D. File Size Limitations & HTTP `413` Pack Timeouts
GitHub rejects any individual file exceeding 100MB, warns over 50MB, and drops oversized single-commit HTTP/2 packs.
* **Solution**: Keep `dist/`, `coverage/`, `.cache/`, `node_modules/`, and `*.zip` / `*.tar.gz` excluded in `.gitignore`, and use `npm run git:push` when pushing large multi-directory changesets.

---

## 3. Configuring Application Default Credentials (ADC)

Application Default Credentials (ADC) allow Google Cloud client libraries to automatically detect and authenticate with Google Cloud APIs without hardcoding static API keys or long-lived service account secrets.

### 3.1 Local Development ADC

For local machines and development workstations:

1. **Install the Google Cloud CLI**:
   ```bash
   # Verify gcloud installation
   gcloud --version
   ```

2. **Authenticate your User Account for ADC**:
   ```bash
   gcloud auth application-default login
   ```
   * This generates a well-known credential file at:
     * **Linux/macOS**: `~/.config/gcloud/application_default_credentials.json`
     * **Windows**: `%APPDATA%\gcloud\application_default_credentials.json`

3. **Set your Google Cloud Project Quota**:
   ```bash
   gcloud auth application-default set-quota-project YOUR_GCP_PROJECT_ID
   ```

4. **Verify ADC Resolution in Node.js**:
   Google Cloud client libraries automatically check for ADC via:
   ```typescript
   import { GoogleGenAI } from "@google/genai";

   // When process.env.GEMINI_API_KEY is omitted, Google GenAI and GCP SDKs
   // automatically resolve ADC from the local credential cache or metadata server.
   const ai = new GoogleGenAI({});
   ```

---

### 3.2 GitHub Actions CI/CD with Workload Identity Federation (Keyless ADC)

Rather than exporting downloadable service account JSON keys into GitHub Secrets, use **Workload Identity Federation** to let GitHub Actions assume a Google Cloud IAM role securely.

#### Step 1: Create a Workload Identity Pool in GCP
```bash
# Set your project ID
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# 1. Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 2. Create Workload Identity Provider for GitHub
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

#### Step 2: Bind the GitHub Repository to your Service Account
```bash
# Create service account (if not already created)
gcloud iam service-accounts create rentmaikar-ci-deployer \
  --display-name="RentMaikar CI/CD Deployer"

# Allow GitHub Actions repository to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding "rentmaikar-ci-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO_NAME"
```

#### Step 3: Configure GitHub Actions Workflow (`.github/workflows/deploy.yml`)
Add the `google-github-actions/auth` step to obtain short-lived OIDC access tokens:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # Required for Workload Identity OIDC

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud via Workload Identity
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
          service_account: 'rentmaikar-ci-deployer@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com'

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to Cloud Run
        run: |
          gcloud builds submit --config cloudbuild.yaml
```

---

### 3.3 Google Cloud Run & Cloud Build Runtime ADC

When running inside Google Cloud Run or Cloud Build containers:

1. **Automatic IAM Resolution**:
   Cloud Run containers automatically access the internal metadata server (`http://metadata.google.internal/computeMetadata/v1/`).
2. **Assign Runtime IAM Roles**:
   Ensure the service account attached to the Cloud Run service has the appropriate IAM permissions:
   * `roles/aiplatform.user` (for Vertex AI / Gemini API access)
   * `roles/secretmanager.secretAccessor` (for Secret Manager access, if needed)
3. **No API Key Required**:
   With ADC active, backend services call Google Cloud APIs without needing static `GEMINI_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS` files.

---

### 3.4 Dual Cloud Run Architecture: Frontend (`rentmaikar-g2`) vs Backend (`rentmaikar-backend`)

RentMaikar operates two coordinated Google Cloud Run services in `europe-west1`:

| Service Name | Container / Dockerfile | Port | Public Hostname | Role & Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **`rentmaikar-g2`** | Root `Dockerfile` (`nginx:1.25-alpine`) | `80` | `rentmaikar.com` | **Frontend SPA & Ingress Proxy**: Serves static Vite React bundles and reverse-proxies `/api/*` to `rentmaikar-backend`. |
| **`rentmaikar-backend`** | `backend/Dockerfile` (`node:20-alpine`) | `8080` | `staging.rentmaikar.com` | **Authoritative Backend API Gateway**: Hosts the Cloud Run email route, telematics, and payments. The visible sender must be configured via the approved sender allowlist; the configured Resend transport domain is separate and does not prove sender-domain verification. |

---

See [Outbound email architecture and verification](outbound-email-architecture.md) for the source-level dispatch inventory and external sender/DNS verification checklist.

## 4. Troubleshooting Checklist

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| `Push rejected: Secret detected` | `.env` or credential file staged in git | Remove credentials, add to `.gitignore`, and commit. |
| `File name too long / invalid path` | Special characters/spaces in filenames | Rename to clean alphanumeric paths (`npm run diagnose`). |
| `ADC: Could not load default credentials` | Missing `gcloud auth application-default login` | Run `gcloud auth application-default login` locally or configure Workload Identity in CI. |
| `Resource Exhausted / Quota Error` | Quota project not set on ADC | Execute `gcloud auth application-default set-quota-project <PROJECT_ID>`. |
| `Build Failure: VITE_* variable missing` | Undeclared client-side build variable | Add missing variable to `.env.example` and pass it in CI build environment. |
