# RentMaikar Database Cutover & Migration Plan

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
