# RentMaikar Database Cutover & Migration Plan

> [!WARNING]
> **HISTORICAL / SUPERSEDED ARCHITECTURAL RECORD — NON-AUTHORITATIVE FOR RUNTIME IMPLEMENTATION**
> This document preserves the historical audit trail and step-by-step checklist of the multi-phase database cutover and migration execution.
> 
> **Current Authoritative Architecture References**:
> - Repository Guardrails & Authority: `docs/architecture/DOCUMENTATION_AUTHORITY_AND_AI_STUDIO_GUARDRAILS.md`
> - Routing, Bridges & Adapters: `docs/architecture/ROUTING_BRIDGE_ADAPTER_ARCHITECTURE.md`
> - Interceptor Verification Rules: `docs/architecture/supabase-functions-invoke-interceptor-rule.md`
> - Communication & Provider Preservation: `docs/architecture/PLATFORM_PROVIDER_PRESERVATION.md`
>
> *Authoritative Caller ID Principle*: `canonical region → voip_resolve_outbound_number() → configured eligible outbound line → configured provider`. If unresolvable, the runtime produces a controlled failure rather than defaulting to hardcoded telephone numbers (e.g. historical mentions of static lines such as `+18482035389` are superseded).

## 1. Migration Overview

- **Legacy Instance**: `https://bwvocmhcledbwqlpcswp.supabase.co` (Managed by Lovable)
- **Target Private Instance**: `https://jrsydiofzceoeddjogov.supabase.co` (RentMaikar Dedicated)
- **Database Engine**: PostgreSQL 15+ with extensions (`uuid-ossp`, `pgcrypto`, `pg_net`, `pg_cron`)

---

## 2. Step-by-Step Cutover Procedure

### Phase 1: Schema Integrity & Non-Duplication Rule
> **CRITICAL RULE**: Do **NOT** duplicate the database schema. Never run unconditional `CREATE TABLE` scripts against a target database that already contains tables.
1. Perform a schema cross-reference check against `information_schema.tables` and `information_schema.columns`.
2. Existing tables, columns, indexes, and RLS policies must be inspected rather than recreated.
3. If new columns or tables are introduced in incremental migrations, apply only non-destructive changes (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

### Phase 2: Configuration & Seed Data Cross-Referencing
1. Execute the cross-reference loader script:
   ```bash
   chmod +x scripts/load-new-supabase.sh
   ./scripts/load-new-supabase.sh
   ```
2. The script executes `scripts/load.sql`, which uses dynamic PL/pgSQL blocks to cross-reference existing tables and update records in place:
   - Validates existence of `platform_countries`, `platform_regions`, `platform_company_info`, etc.
   - Discovers existing primary and foreign keys dynamically (avoiding foreign key constraint collisions).
   - Applies in-place updates using `ON CONFLICT (...) DO UPDATE`.
   - Leaves existing business data intact without creating duplicate rows or conflicting schema objects.

### Phase 3: User Accounts & Administrative Role Verification
1. Ensure the user accounts exist in `auth.users` on `jrsydiofzceoeddjogov`:
   - Owner: `adebayoolusola39@gmail.com`
   - Admin: `eastfortemain@gmail.com`
2. Verify that `public.user_roles` grants the corresponding `owner` and `admin` roles:
   ```sql
   SELECT u.email, r.role 
   FROM auth.users u 
   JOIN public.user_roles r ON u.id = r.user_id 
   WHERE u.email IN ('adebayoolusola39@gmail.com', 'eastfortemain@gmail.com');
   ```

### Phase 4: Webhook & Third-Party Redirection
1. **Twilio Voice & SMS**:
   - Update Webhook Voice URL to point to the new Edge Function or API Gateway:
     `https://jrsydiofzceoeddjogov.supabase.co/functions/v1/incoming-call-forward`
   - Status Callback URL:
     `https://jrsydiofzceoeddjogov.supabase.co/functions/v1/voip-status-callback`
2. **Sent.dm**:
   - Update delivery webhook destination to:
     `https://staging.rentmaikar.com/api/webhooks/sent`

### Phase 5: Client Application Cutover
1. Verify `src/integrations/supabase/client.ts` uses the new project URL:
   ```typescript
   const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://jrsydiofzceoeddjogov.supabase.co";
   ```
2. Update production environment variables on Cloud Run / hosting provider:
   - `VITE_SUPABASE_URL=https://jrsydiofzceoeddjogov.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<target_anon_key>`

### Phase 6: Post-Cutover Verification Checklist
- [x] Authoritative OTP Engine (`OtpService`): Keyed HMAC-SHA256 verifier with timing-safe comparison, single-use atomic consumption, and replay lockout.
- [x] Outbound Delivery Bridge (`MessagingBridge`): SENT.dm primary delivery across USA, Nigeria (+234), and international channels without fragmented branching.
- [x] Authoritative Authenticator (`Authenticator`): Purpose-bound verification, identity binding, and native GoTrue `magiclink` token_hash session exchange (never touching `recovery_token`).
- [x] User login works for Driver, Owner, and Admin portals (session exchange verified).
- [x] 2FA TOTP challenges succeed (`generateTotpSecret`, `verifyTotpCode` RFC 6238).
- [x] Vehicle listings, telemetry GPS coordinates, and geofences render properly.
- [x] Inbound phone calls ring the Call Center queue in real time (`TelephonyController` unified single-session architecture).
- [x] CPaaS messages (SMS / WhatsApp) deliver successfully via SENT.dm.
- [x] Audit Event Logging: Every verification and session mint logged into `public.verification_event_log`.

### Phase 7: Legacy Decommissioning, Fallback Teardown & Production Infrastructure Lockdown
1. **Decommission Legacy Instance (`bwvocmhcledbwqlpcswp`)**:
   - Zero traffic, queries, or webhooks route to legacy `bwvocmhcledbwqlpcswp.supabase.co`.
   - Legacy access keys and tokens containing ref `bwvocmhcledbwqlpcswp` or `J3dm9jbWhjbGVkYndxbHBjc3dw` are hard-blocked by `isValidKey`.
   - All client and backend services exclusively target production `https://jrsydiofzceoeddjogov.supabase.co`.
2. **Secret & Boundary Isolation**:
   - Client bundle strictly contains only public publishable configurations (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
   - Service role keys, Twilio auth tokens, CPaaS secrets, and payment API keys reside strictly on the server backend.
   - Frontend authentication exclusively utilizes Bearer tokens from Supabase Auth (`verifyOtp` via GoTrue magiclink `token_hash`).
3. **Operational Lockdown Checklist**:
   - [x] Legacy instance `bwvocmhcledbwqlpcswp` references blocked and decommissioned.
   - [x] Single authoritative OTP engine (`OtpService`) active.
   - [x] Single authoritative verifier (`Authenticator`) active.
   - [x] SENT.dm primary delivery operational.
   - [x] Secret isolation enforced (0 secrets in client bundles).
   - [x] Production database connections pooled via pgBouncer.

### Phase 8: Production Health Monitoring, Automated Telemetry Watchdogs & Operational SLA Assurance
1. **Continuous Subsystem Health Probing**:
   - `PlatformHealthService` executes real-time health checks across 6 critical subsystems (`gateway`, `frontend`, `database`, `telecom`, `payments`, `iot`).
   - Weighted health score calculation (0 - 100) with automatic degradation detection.
   - Direct connection state verification between `rentmaikar.com` and `staging.rentmaikar.com`.
2. **Automated Telemetry Watchdogs & Self-Healing**:
   - Inbound VoIP call watchdog monitoring active call lifecycle and canonical callId resolution.
   - Outbound CPaaS / SENT.dm message delivery watchdog tracking delivery statuses.
   - Verification event logger recording all OTP and auth challenges in `public.verification_event_log`.
3. **Operational SLA Checklist**:
   - [x] Real-time platform health monitoring active via `/api/health` and `/api/bridge/status`.
   - [x] Sub-second OTP verification response time SLA verified.
   - [x] Automated failover and circuit breaker protection active.
   - [x] Live metrics (CPU, Memory, Uptime, Subsystem Latency) recorded.

### Phase 9: Disaster Recovery, Automated Database Snapshots, Zero-Data-Loss Failover & Incident Response Playbook
1. **Automated Database Backup & Snapshot Policy**:
   - Point-in-time recovery (PITR) with continuous Write-Ahead Logging (WAL) archiving enabled on dedicated instance `jrsydiofzceoeddjogov`.
   - Daily automated logical schema and data dumps via `pg_dump` targeting encrypted object storage.
   - Non-destructive cross-reference loader verification (`scripts/load-new-supabase.sh` and `scripts/load.sql`) enforcing schema non-duplication during restore drills.
2. **High-Availability Gateway & Backend Failover Topology**:
   - Primary domain: `rentmaikar.com` (Vercel / Cloud Run edge distribution).
   - Authoritative API Gateway: `staging.rentmaikar.com/api` with health watchdog `/api/health`.
   - Client Bridge Automatic Loss-of-Contact failover: Frontend `useBackendBridge` and `backend-bridge.ts` automatically switch endpoints and retry idempotently upon network or gateway degradation.
   - CPaaS multi-channel failover: Primary Sent.dm SMS/WhatsApp with automatic channel fallback ensuring OTP and mission-critical alerts deliver with zero message loss.
3. **Incident Response & Triage Playbook**:
   - **Severity 1 (P1) - Database Outage / Auth Failure**:
     * Step 1: Check `/api/health` and verify Supabase pooler connectivity via `dbPool.ts`.
     * Step 2: If pooler is degraded, toggle direct connection string in Cloud Run environment.
     * Step 3: Verify `public.verification_event_log` for failure correlation IDs and stage degradation.
     * Step 4: If PITR restore required, execute dynamic cross-reference loader; verify owner `adebayoolusola39@gmail.com` and admin `eastfortemain@gmail.com` roles.
   - **Severity 2 (P2) - VoIP / Telephony Degradation**:
     * Step 1: Inspect Twilio status callback logs via `/api/telephony/voip-status-callback`.
     * Step 2: Validate active Call Center queue and agent WebRTC client token minting.
     * Step 3: Trigger auto-failover route to secondary operator numbers.
   - **Severity 3 (P3) - CPaaS Delivery Degradation**:
     * Step 1: Inspect Sent.dm API responses and webhook signature validation in `sentClient.ts`.
     * Step 2: Trigger automated fallback channel routing via `cpaasRouterService.ts`.
4. **Disaster Recovery & Operational Sign-Off Checklist**:
   - [x] PITR and daily snapshot backup schedules confirmed on dedicated instance `jrsydiofzceoeddjogov`.
   - [x] Dual-origin failover between `rentmaikar.com` and `staging.rentmaikar.com` validated.
   - [x] Automated circuit breaking and client loss-of-contact reconnection verified.
   - [x] Verification audit log trail (`verification_event_log`) recording with non-repudiation.
   - [x] Emergency access protocol documented for authorized administrators (`adebayoolusola39@gmail.com`, `eastfortemain@gmail.com`).
   - [x] Production deployment sign-off verified: zero legacy dependencies, zero client secret leaks, sub-second OTP authentication.

### Phase 10: Production Security Hardening, Continuous Compliance Auditing, Zero-Trust Access Control & Final Enterprise Sign-Off
1. **Zero-Trust Access Control & RBAC Policy Hardening**:
   - Strict separation of caller roles: `owner`, `admin`, `admin assistant`, `driver`, `support`, and `anonymous`.
   - `SECURITY DEFINER` routine restriction: Revoked execution grants from `PUBLIC`/`anon` across all settlement, role assignment, and financial RPCs.
   - Insecure Direct Object Reference (IDOR) elimination: Mandatory `assertCanAccess()` validation verifying tenant ownership before record inspection or mutation.
   - External Webhook Cryptographic Verification: Multi-provider signature enforcement for Twilio (`X-Twilio-Signature` HMAC-SHA1), Sent.dm (`X-Sent-Signature` HMAC-SHA256), and Resend Svix (`whsec_...`).
2. **Regulatory & Telephony Compliance (A2P 10DLC & TCPA)**:
   - Automated STOP/UNSUBSCRIBE opt-out processing via Sent.dm and CPaaS webhook handlers with immediate SMS dispatch suspension.
   - Dual-consent capture and verifiable audit logs across driver onboarding, rental agreements, and VoIP calling.
   - Automated 10DLC A2P compliance packet generation (`scripts/generate-10dlc-pdf.ts`) and permanent public asset validation.
3. **Continuous Security Auditing & Anti-Brute-Force Penetration Testing Guards**:
   - Rate limiting guards (`check_auth_rate_limit`) defending authentication, phone verification, and portal access from brute-force attacks.
   - Constant-time cryptographic comparisons (`crypto.timingSafeEqual`) preventing timing side-channel attacks on OTP verifiers.
   - Zero-secret client exposure: Automated build checks confirming no service role keys or payment gateway secrets exist in client bundles.
4. **Final Enterprise Production Sign-Off Checklist**:
   - [x] Zero unauthenticated background jobs (`requireInternal` / `requireAdminCaller` strictly enforced).
   - [x] Strict cryptographic signature verification operational across all external webhooks.
   - [x] A2P 10DLC and TCPA compliance active with automated subscriber opt-out processing.
   - [x] Timing-safe verification operational on all OTP and session exchange challenges.
   - [x] Complete 10-Phase Cutover verified: Schema consolidated, data loaded, OTP authoritative, legacy decommissioned, SLAs monitored, disaster recovery tested, and enterprise security certified.

### Phase 11: Autonomous Telematics Operations, IoT Fleet Synchronization, Multi-Region Financial Settlement & Day-2 Operational Resilience
1. **IoT Fleet Telematics & Cellular Provisioning Pipeline**:
   - Hologram SIM cellular lifecycle management (activation, data usage alerts, overage suspension) via `hologramService`.
   - Traccar and Sarekon GPS position ingestion with deduplicated telemetry persistence to `vehicle_telemetry_state` & `mqtt_telemetry_logs`.
   - Device pairing and installation verification: `iot_devices` / `device_identities` (`DID-*`) linking to vehicle assets and active driver rentals.
   - EMQX MQTT broker token minting with 30-day bounded expiration for secure vehicle telemetry streaming.
2. **Multi-Region Financial Ledger, Auto-Debits & Settlement**:
   - USA: PayPal REST API order creation, capture, and instant IPN/webhook verification via `paymentService`.
   - Nigeria: Paystack & OPay payment initialization, charge verification, and multi-currency conversion.
   - Automated Daily Debits & Owner Earnings Settlement: Ledger tracking with double-entry accounting guarantees preventing duplicate debits.
   - Idempotent retry protection and Dead-Letter Queue (DLQ) logging for transaction reconciliation.
3. **Day-2 Autonomous Cron Automation & Self-Healing Telemetry**:
   - Periodic vehicle location sync worker (`sarekon-location-worker`) updating coordinates and heading.
   - Automated email queue flushing (`process-email-queue`) and event dispatch notifications.
   - Automatic SIM health probing (`run_iot_liveness_test`) and auto-enablement for newly registered hardware.
4. **Phase 11 Operational Sign-Off Checklist**:
   - [x] Hologram, Traccar, and Sarekon telematics bridges operational and verified.
   - [x] Multi-region payment engines (PayPal, Paystack, OPay) active with ledger consistency.
   - [x] Automated daily debit processing validated with idempotency and retry guards.
   - [x] EMQX MQTT telemetry broker tokens minted with expiration bounds.
   - [x] Complete 11-Phase Production Architecture fully integrated, hardened, and synchronized.

### Phase 12: Production Telephony, Omnichannel Communications, Real-Time Call Center & Final Handoff Sign-Off
1. **Twilio Voice WebRTC, Inbound Softphone & Queue Routing**:
   - WebRTC Access Token minting (`mintVoiceAccessToken`) utilizing HS256 JWTs with VoiceGrant permissions.
   - Authoritative Caller ID resolution (`resolveCallerId`) defaulting to verified production line `+18482035389` for USA operations.
   - Canonical Session and Call ID state tracking (`handleInitiateVoipCall`, `handleEndVoipCall`, `handleGetVoipCallStatus`).
   - Browser softphone inbound ringing (`handleIncomingCallForward`) with TCPA-compliant call recording consent announcements.
   - Call audio storage pipeline routing Twilio MP3 recordings to Supabase Storage `call-recordings` bucket.
   - Real-time Call Center transcription logging (`handleVoipCallTranscriptLog`).
2. **Omnichannel Resend Transactional Email & Inbound Routing**:
   - Verified sending domain (`notify.rentmaikar.com`) and inbound gateway (`backend.rentmaikar.com`).
   - Transactional email dispatch (`sendEmailViaResend`), verification emails, password resets, and SSO authentication templates.
   - Inbound email webhook parsing (`handleInboundEmailWebhook`) and forwarding to administrator queues.
   - Svix webhook signature validation and real-time delivery status logging in `public.email_send_logs`.
3. **Complete 12-Phase Enterprise Production Cutover Sign-Off**:
   - [x] WebRTC agent token minting operational and verified.
   - [x] Inbound browser softphone call queue operational with canonical call IDs.
   - [x] Omnichannel transactional email delivery active via Resend with Svix verification.
   - [x] Call audio recordings stored in dedicated Supabase Storage bucket.
   - [x] Complete 12-Phase Production Cutover certified: Ready for full commercial fleet operations.

### Phase 13: Production Artifact Archiving, Automated Handoff Packaging & Continuous Deployment Pipeline Verification
1. **Automated Handoff Packaging & Standalone Archives**:
   - Full repository archive generation (`scripts/package-complete-project.py`) with strict exclusion of transient directories (`node_modules`, `.git`, `.cache`, `dist`, `coverage`).
   - Standalone client bundle packaging (`scripts/package-frontend-zip.py`) configured for edge CDN hosting.
   - OpenAPI 3.0 specification (`handoff/openapi.yaml`) synchronized with live Express gateway routes and Supabase Edge functions.
2. **Automated Build Environment & Telemetry Diagnostics**:
   - Automated diagnostic scanner (`scripts/diagnose-build-env.ts`) verifying clean filename casing, secret scanning rules, and TypeScript compilation health.
   - Sarekon telematics fleet diagnostic (`scripts/diagnose_sarekon_usa_fleet.ts`) validating GPS telemetry, odometer tracking, and battery health.
   - Dynamic reconciliation and PDF generators (`scripts/generate-reconciliation-pdf.mjs`, `scripts/generate-features-pdf.js`).
3. **CI/CD Deployment & Workload Identity Federation (Keyless ADC)**:
   - Automated deployment specifications (`docs/deployment.md`) targeting Google Cloud Run in `europe-west1` and `europe-west2`.
   - Workload Identity Federation OIDC token exchange eliminating downloadable service account JSON keys.
   - Container health check probes (`/api/health`) and graceful SIGTERM shutdown handlers.
4. **Complete 13-Phase Enterprise Architecture Sign-Off Checklist**:
   - [x] Automated artifact packaging scripts verified with zero ephemeral leaks.
   - [x] OpenAPI 3.0 contract synchronized across client, backend, and third-party webhooks.
   - [x] Diagnostic pre-flight checks (`diagnose-build-env.ts`) passed with zero errors.
   - [x] Keyless CI/CD Workload Identity Federation documented and certified.
   - [x] Complete 13-Phase Enterprise Production Cutover & Deployment Architecture officially certified.

### Phase 14: Automated SEO, Dynamic Sitemap Indexing, PWA Asset Governance & Final Commercial Go-Live Certification
1. **Dynamic Search Engine Optimization (SEO) & XML Sitemap Generation**:
   - Dynamic sitemap generator (`src/lib/seo/sitemapEngine.ts` and `scripts/generate-sitemap.ts`) publishing `public/sitemap.xml` with automatic priority and change frequency tagging.
   - Schema.org JSON-LD structured data integration (CarRental, AutoRental, LocalBusiness, BreadcrumbList) for target markets in Newark, NJ and Lagos, Nigeria.
   - OpenGraph and Twitter card asset verification (`og:image`, `og:title`, `og:description`) matching live production metadata.
2. **Progressive Web App (PWA) Compliance & Asset Governance**:
   - Manifest asset generator (`scripts/generate-pwa-icons.ts`) providing multi-resolution icons (192x192, 512x512) and maskable configurations.
   - Offline service worker caching strategy supporting emergency roadside assistance and hotline access.
   - Favicon asset synchronization (`scripts/update-favicon.ts`) across all modern browser viewports.
3. **Multi-Region Commercial Go-Live Certification**:
   - Dual-currency verification (USD for USA, NGN for Nigeria) across vehicle catalogue, booking flows, and lease agreements.
   - Verified cross-origin communication between `https://rentmaikar.com` and `https://staging.rentmaikar.com`.
4. **Final 14-Phase Enterprise Architectural Sign-Off**:
   - [x] Dynamic XML sitemap verified and generated into `public/sitemap.xml`.
   - [x] PWA manifest and icons verified for offline-capable progressive installation.
   - [x] Multi-region currency and localization verified for USA and Nigeria markets.
   - [x] Complete 14-Phase Enterprise Architecture officially certified for live production operation.

### Phase 15: Unified Authentication Modernization, Hardened OTP Architecture, Legacy Auth Decommissioning & Zero-Trust Provider Consolidation
1. **Four-Stage Phased Authentication Migration Execution**:
   - **Stage A — Security Corrections First**:
     - Hardcoded OTP secret fallback permanently eliminated; `getOtpAuthSecret()` strictly requires production environment secret (`OTP_AUTH_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`).
     - Legacy un-keyed SHA-256 fallback permanently removed from `verifyVerifier()`; strictly enforces timing-safe HMAC-SHA256 evaluation.
     - Strict challenge lookup: `WHERE (identity = $1 OR phone = $1) AND purpose = $2` utilizing compound index `idx_phone_otp_codes_identity_purpose`.
     - Elimination of the loose `"auth"` purpose bypass; cross-purpose verification attempts are rejected.
     - Fail-closed rate limiting: database cooldown (60s) and velocity (max 3 per 10m) query failures immediately reject requests.
     - Atomic transactional consumption: PostgreSQL `SELECT ... FOR UPDATE` locking prevents concurrent replay or race condition consumption attacks.
     - Resolved OTP-consumption/session-creation transaction boundary: automatic rollback of challenge status (`consumed_at = NULL, status = 'delivered'`) if user creation or GoTrue session link minting fails.
   - **Stage B — Caller Migration**:
     - `PhoneOtpPanel` migrated from direct Edge Function invocation to backend Authenticator (`/api/functions/phone-otp-custom` / backend auth router).
     - `PhoneVerification` migrated from legacy `verify-phone` Edge Function to backend `OtpService` verification endpoint via `backendBridge`.
     - `TwoFactorSetup` migrated to unified backend verification endpoint.
     - Email verification and OTP consolidated under unified `OtpService`.
   - **Stage C — Legacy Shutdown**:
     - Decommissioning pipeline for legacy Supabase Edge Functions: `phone-otp-custom`, `verify-phone`, and `send-2fa-code`.
     - Progressive shutdown order: `disable` &rarr; `monitor` &rarr; `remove`.
   - **Stage D — Provider Consolidation**:
     - OTP-specific Twilio, Termii, and Lovable gateway branching stripped from authentication path.
     - Single authoritative CPaaS provider: `SENT.dm` via `MessagingBridge`.
2. **Canonical Production Authentication Topology**:
   ```
                       AUTHENTICATION ARCHITECTURE
   Frontend (Browser)
      │
      ▼
   Backend Auth API (/api/functions)
      │
      ├──────────────────► OtpService (HMAC-SHA256, atomic transactions)
      │                       │
      │                       ▼
      │                 public.phone_otp_codes (PostgreSQL)
      │                       │
      │                       ▼
      │                 MessagingBridge (Singleton)
      │                       │
      │                       ▼
      │                    SENT.dm (Single Authoritative Provider)
      │
      ▼
   Authenticator (Singleton)
      │
      ▼
   Supabase GoTrue Admin (generateLink magiclink session exchange)
      │
      ▼
   Supabase Auth Session (Native client verifyOtp exchange)
      │
      ▼
   Supabase JWT & Row Level Security (RLS)
   ```
3. **Operational Guarantees & Anti-Tamper Policy**:
   - Zero plaintext OTP storage; verifier is HMAC-SHA256 bound to `challenge_id:purpose:identity:code`.
   - Zero tampering with internal `auth.users.recovery_token`.
   - Strict 10-minute expiration window with automatic lockout after 5 incorrect attempts.
   - Full non-repudiation audit logging in `public.verification_event_log`.
4. **Final 15-Phase Production Sign-Off Checklist**:
   - [x] Hardcoded OTP secret fallback removed and validated fail-closed.
   - [x] Legacy un-keyed SHA-256 fallback removed and timing-safe HMAC enforced.
   - [x] Strict `identity + purpose` challenge lookup active with compound index.
   - [x] Atomic transactional challenge consumption with `SELECT ... FOR UPDATE` verified.
   - [x] OTP consumption rollback on session creation failure verified.
   - [x] Single-provider CPaaS routing via `MessagingBridge` &rarr; `SENT.dm` verified.
   - [x] Complete 15-Phase Enterprise Architecture verified, certified, and ready for commercial operation.
