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
- [ ] User login works for Driver, Owner, and Admin portals.
- [ ] 2FA TOTP challenges succeed.
- [ ] Vehicle listings, telemetry GPS coordinates, and geofences render properly.
- [ ] Inbound phone calls ring the Call Center queue in real time.
- [ ] CPaaS messages (SMS / WhatsApp) deliver successfully.
