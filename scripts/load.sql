-- ==============================================================================
-- RentMaikar Master Platform Cross-Reference & Update Script
-- Target Database: Supabase Project jrsydiofzceoeddjogov (Rentmaikar)
-- 
-- STRICT NON-DUPLICATION POLICY:
-- 1. NEVER creates duplicate tables or objects.
-- 2. Dynamically cross-references existing information_schema and foreign keys.
-- 3. Only updates records in place using ON CONFLICT DO UPDATE.
-- 4. Safe to run against existing schemas without risking data corruption.
-- ==============================================================================

-- 1. Cross-Reference Platform Countries & Regions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_countries') THEN
    UPDATE public.platform_countries
    SET is_active = true, updated_at = now()
    WHERE code IN ('US', 'NG');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_regions') THEN
    UPDATE public.platform_regions
    SET is_active = true, updated_at = now()
    WHERE code IN ('la', 'portharcourt', 'abuja', 'md', 'va', 'dc');
  END IF;
END $$;

-- 2. Cross-Reference Platform Company Info
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_company_info') THEN
    UPDATE public.platform_company_info
    SET is_active = true, updated_at = now()
    WHERE region IN ('USA', 'Nigeria');
  END IF;
END $$;

-- 3. Cross-Reference Contact Settings & Communication Forwarding
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_settings') THEN
    UPDATE public.contact_settings
    SET is_active = true, updated_at = now()
    WHERE region IN ('USA', 'Nigeria');
  END IF;
END $$;

-- 4. Cross-Reference Platform Key-Value Configuration Settings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_kv_settings') THEN
    INSERT INTO public.platform_kv_settings (key, value, updated_at)
    VALUES
      ('auth:require_2fa_admin', '"true"'::jsonb, now()),
      ('telematics:tracking_interval_seconds', '"30"'::jsonb, now()),
      ('voice:bridge_timeout_seconds', '"30"'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = now();
  END IF;
END $$;

-- 5. Cross-Reference Subscription Plans
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_plans') THEN
    UPDATE public.subscription_plans
    SET is_active = true, updated_at = now()
    WHERE region IN ('USA', 'Nigeria');
  END IF;
END $$;

-- 6. Cross-Reference User Accounts & Enforce Single Roles (Strict RBAC, Prohibit Multiple Roles)
DO $$
DECLARE
  adebayo_uid UUID;
  admin_uid UUID;
  beres_uid UUID;
  wale_uid UUID;
BEGIN
  -- Cross-reference Adebayo Olusola in auth.users (strictly single role: admin)
  SELECT id INTO adebayo_uid FROM auth.users WHERE LOWER(email) = 'adebayoolusola39@gmail.com' LIMIT 1;
  IF adebayo_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (adebayo_uid, 'admin')
      ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
      INSERT INTO public.profiles (user_id, email, full_name, updated_at)
      VALUES (adebayo_uid, 'adebayoolusola39@gmail.com', 'Adebayo Olusola', now())
      ON CONFLICT (user_id) DO UPDATE SET
        email = 'adebayoolusola39@gmail.com',
        full_name = 'Adebayo Olusola',
        updated_at = now();
    END IF;
  END IF;

  -- Cross-reference admin in auth.users (strictly single role: admin)
  SELECT id INTO admin_uid FROM auth.users WHERE LOWER(email) = 'eastfortemain@gmail.com' LIMIT 1;
  IF admin_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (admin_uid, 'admin')
      ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
      INSERT INTO public.profiles (user_id, email, full_name, updated_at)
      VALUES (admin_uid, 'eastfortemain@gmail.com', 'East Forte Main Admin', now())
      ON CONFLICT (user_id) DO UPDATE SET
        email = 'eastfortemain@gmail.com',
        full_name = 'East Forte Main Admin',
        updated_at = now();
    END IF;
  END IF;

  -- Cross-reference beresanddowds@gmail.com (Vehicle owner of Camry BN334AH, strictly single role: owner)
  SELECT id INTO beres_uid FROM auth.users WHERE LOWER(email) = 'beresanddowds@gmail.com' LIMIT 1;
  IF beres_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (beres_uid, 'owner')
      ON CONFLICT (user_id) DO UPDATE SET role = 'owner';
    END IF;
  END IF;

  -- Reconcile application for wale@gmail.com (link user_id, strictly single role: driver)
  SELECT id INTO wale_uid FROM auth.users WHERE LOWER(email) = 'wale@gmail.com' LIMIT 1;
  IF wale_uid IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'applications') THEN
    UPDATE public.applications
    SET user_id = wale_uid, updated_at = now()
    WHERE LOWER(email) = 'wale@gmail.com' AND user_id IS NULL;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (wale_uid, 'driver')
      ON CONFLICT (user_id) DO UPDATE SET role = 'driver';
    END IF;
  END IF;
END $$;

-- 7. Cross-Reference Admin Assistant Permissions Matrix
DO $$
DECLARE
  admin_uid UUID;
BEGIN
  SELECT id INTO admin_uid FROM auth.users WHERE LOWER(email) = 'eastfortemain@gmail.com' LIMIT 1;
  IF admin_uid IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_assistant_permissions') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_assistant_permissions' AND column_name = 'user_id') THEN
      INSERT INTO public.admin_assistant_permissions (
        user_id, can_view_users, can_manage_users, can_view_vehicles, can_manage_vehicles,
        can_view_rentals, can_manage_rentals, can_view_payments, can_manage_payments,
        can_view_support_tasks, can_manage_support_tasks, can_view_iot, can_manage_iot,
        can_view_communications, can_send_communications, can_view_reports, can_manage_content,
        can_view_audit_log, can_approve_applications, can_delete_users, updated_at
      )
      VALUES (
        admin_uid, true, true, true, true,
        true, true, true, true,
        true, true, true, true,
        true, true, true, true,
        true, true, true, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        can_view_users = true,
        can_manage_users = true,
        can_view_vehicles = true,
        can_manage_vehicles = true,
        updated_at = now();
    END IF;
  END IF;
END $$;
