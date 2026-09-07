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
DECLARE
  v_us_country_id UUID;
  v_ng_country_id UUID;
BEGIN
  -- Cross-reference & update countries
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_countries') THEN
    INSERT INTO public.platform_countries (iso2, name, currency_code, currency_symbol, phone_code, is_active, updated_at)
    VALUES 
      ('US', 'United States', 'USD', '$', '+1', true, now()),
      ('NG', 'Nigeria', 'NGN', '₦', '+234', true, now())
    ON CONFLICT (iso2) DO UPDATE SET 
      is_active = EXCLUDED.is_active,
      currency_code = EXCLUDED.currency_code,
      currency_symbol = EXCLUDED.currency_symbol,
      updated_at = now();

    SELECT id INTO v_us_country_id FROM public.platform_countries WHERE iso2 = 'US' LIMIT 1;
    SELECT id INTO v_ng_country_id FROM public.platform_countries WHERE iso2 = 'NG' LIMIT 1;
  END IF;

  -- Cross-reference & update regions using discovered country foreign keys
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_regions') THEN
    IF v_us_country_id IS NOT NULL THEN
      INSERT INTO public.platform_regions (country_id, code, name, is_active, tax_rate_percent, currency, updated_at)
      VALUES (v_us_country_id, 'USA', 'United States (National)', true, 8.25, 'USD', now())
      ON CONFLICT (code) DO UPDATE SET 
        country_id = EXCLUDED.country_id,
        is_active = EXCLUDED.is_active,
        tax_rate_percent = EXCLUDED.tax_rate_percent,
        currency = EXCLUDED.currency,
        updated_at = now();
    END IF;

    IF v_ng_country_id IS NOT NULL THEN
      INSERT INTO public.platform_regions (country_id, code, name, is_active, tax_rate_percent, currency, updated_at)
      VALUES (v_ng_country_id, 'Nigeria', 'Nigeria (Federal)', true, 7.50, 'NGN', now())
      ON CONFLICT (code) DO UPDATE SET 
        country_id = EXCLUDED.country_id,
        is_active = EXCLUDED.is_active,
        tax_rate_percent = EXCLUDED.tax_rate_percent,
        currency = EXCLUDED.currency,
        updated_at = now();
    END IF;
  END IF;
END $$;

-- 2. Cross-Reference Platform Company Info
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_company_info') THEN
    INSERT INTO public.platform_company_info (region, company_name, email, phone, phone_raw, address, is_active, updated_at)
    VALUES
      ('USA', 'RentMaikar Inc.', 'support@rentmaikar.com', '+1 (608) 548-9220', '+16085489220', '120 E Washington Ave, Suite 400, Madison, WI 53703', true, now()),
      ('Nigeria', 'RentMaikar Logistics Nigeria Ltd', 'support.ng@rentmaikar.com', '+234 800 736 8624', '+2348007368624', 'Plot 12B Victoria Island, Lagos, Nigeria', true, now())
    ON CONFLICT (region) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      phone_raw = EXCLUDED.phone_raw,
      address = EXCLUDED.address,
      is_active = true,
      updated_at = now();
  END IF;
END $$;

-- 3. Cross-Reference Contact Settings & Communication Forwarding
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_settings') THEN
    INSERT INTO public.contact_settings (region, primary_email, primary_phone, primary_phone_raw, support_email, emergency_phone, emergency_phone_raw, call_forwarding_enabled, sms_forwarding_enabled, updated_at)
    VALUES
      ('USA', 'support@rentmaikar.com', '+1 (608) 548-9220', '+16085489220', 'support@rentmaikar.com', '+1 (608) 548-9220', '+16085489220', true, true, now()),
      ('Nigeria', 'support.ng@rentmaikar.com', '+234 800 736 8624', '+2348007368624', 'support.ng@rentmaikar.com', '+234 800 736 8624', '+2348007368624', true, true, now())
    ON CONFLICT (region) DO UPDATE SET
      primary_email = EXCLUDED.primary_email,
      primary_phone = EXCLUDED.primary_phone,
      primary_phone_raw = EXCLUDED.primary_phone_raw,
      support_email = EXCLUDED.support_email,
      emergency_phone = EXCLUDED.emergency_phone,
      emergency_phone_raw = EXCLUDED.emergency_phone_raw,
      call_forwarding_enabled = EXCLUDED.call_forwarding_enabled,
      sms_forwarding_enabled = EXCLUDED.sms_forwarding_enabled,
      updated_at = now();
  END IF;
END $$;

-- 4. Cross-Reference VoIP & Telephony Configuration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'voip_settings') THEN
    INSERT INTO public.voip_settings (region, provider, primary_phone_number, twiml_app_configured, fallback_forwarding_number, status_callback_enabled, recording_enabled, is_active, updated_at)
    VALUES
      ('USA', 'twilio', '+16085489220', true, '+16085489220', true, true, true, now()),
      ('Nigeria', 'twilio', '+2348007368624', true, '+2348007368624', true, true, true, now())
    ON CONFLICT (region) DO UPDATE SET
      provider = EXCLUDED.provider,
      primary_phone_number = EXCLUDED.primary_phone_number,
      twiml_app_configured = EXCLUDED.twiml_app_configured,
      status_callback_enabled = EXCLUDED.status_callback_enabled,
      recording_enabled = EXCLUDED.recording_enabled,
      is_active = true,
      updated_at = now();
  END IF;
END $$;

-- 5. Cross-Reference Platform Key-Value Configuration Settings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_kv_settings') THEN
    INSERT INTO public.platform_kv_settings (key, value, description, is_secret, updated_at)
    VALUES
      ('auth:require_2fa_admin', 'true', 'Require 2FA TOTP verification for all admin and owner sessions', false, now()),
      ('auth:session_expiry_minutes', '480', 'Session inactivity expiry duration in minutes', false, now()),
      ('telematics:tracking_interval_seconds', '30', 'Standard GPS ping frequency for active vehicles', false, now()),
      ('telematics:geofence_enforcement_enabled', 'true', 'Auto-flag vehicles traversing designated boundaries', false, now()),
      ('voice:call_queue_audio_alerts', 'true', 'Enable audio chime for Call Center queue updates', false, now()),
      ('voice:bridge_timeout_seconds', '30', 'Maximum wait time before transferring to voicemail', false, now())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();
  END IF;
END $$;

-- 6. Cross-Reference Subscription Plans
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_plans') THEN
    INSERT INTO public.subscription_plans (name, description, tier, region, price, interval, currency, is_active, updated_at)
    VALUES
      ('Driver Standard (USA)', 'Standard commercial driver subscription with insurance and dispatch access', 'driver_standard', 'USA', 250.00, 'weekly', 'USD', true, now()),
      ('Owner Fleet (USA)', 'Fleet owner management, live IoT telematics, remote immobilizer, and payout reporting', 'owner_fleet', 'USA', 45.00, 'monthly', 'USD', true, now()),
      ('Driver Standard (Nigeria)', 'Standard driver vehicle rental plan with weekly settlement and telematics monitoring', 'driver_standard', 'Nigeria', 65000.00, 'weekly', 'NGN', true, now()),
      ('Owner Fleet (Nigeria)', 'Fleet management portal with fuel, odometer, and IoT asset safety tracking', 'owner_fleet', 'Nigeria', 25000.00, 'monthly', 'NGN', true, now())
    ON CONFLICT (name) DO UPDATE SET
      price = EXCLUDED.price,
      currency = EXCLUDED.currency,
      is_active = true,
      updated_at = now();
  END IF;
END $$;

-- 7. Cross-Reference User Accounts & Enforce Roles (Without Creating Duplicate Users)
DO $$
DECLARE
  owner_uid UUID;
  admin_uid UUID;
BEGIN
  -- Cross-reference owner in auth.users
  SELECT id INTO owner_uid FROM auth.users WHERE email = 'adebayoolusola39@gmail.com' LIMIT 1;
  IF owner_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
      INSERT INTO public.user_roles (user_id, role, created_at)
      VALUES (owner_uid, 'owner', now())
      ON CONFLICT (user_id, role) DO NOTHING;

      INSERT INTO public.user_roles (user_id, role, created_at)
      VALUES (owner_uid, 'admin', now())
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
      INSERT INTO public.profiles (user_id, email, full_name, role, updated_at)
      VALUES (owner_uid, 'adebayoolusola39@gmail.com', 'Adebayo Olusola', 'owner', now())
      ON CONFLICT (user_id) DO UPDATE SET
        email = 'adebayoolusola39@gmail.com',
        role = 'owner',
        updated_at = now();
    END IF;
  END IF;

  -- Cross-reference admin in auth.users
  SELECT id INTO admin_uid FROM auth.users WHERE email = 'eastfortemain@gmail.com' LIMIT 1;
  IF admin_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
      INSERT INTO public.user_roles (user_id, role, created_at)
      VALUES (admin_uid, 'admin', now())
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
      INSERT INTO public.profiles (user_id, email, full_name, role, updated_at)
      VALUES (admin_uid, 'eastfortemain@gmail.com', 'East Forte Main Admin', 'admin', now())
      ON CONFLICT (user_id) DO UPDATE SET
        email = 'eastfortemain@gmail.com',
        role = 'admin',
        updated_at = now();
    END IF;
  END IF;
END $$;

-- 8. Cross-Reference Admin Assistant Permissions Matrix
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_assistant_permissions') THEN
    INSERT INTO public.admin_assistant_permissions (role, can_view_vehicles, can_edit_vehicles, can_view_drivers, can_approve_kyc, can_access_voip, can_view_billing, updated_at)
    VALUES
      ('admin', true, true, true, true, true, true, now()),
      ('admin_assistant', true, false, true, true, true, false, now()),
      ('vehicle_support', true, true, false, false, true, false, now()),
      ('iot_support', true, true, false, false, true, false, now()),
      ('insurance_support', true, false, true, true, true, false, now()),
      ('legal_support', false, false, true, true, false, true, now())
    ON CONFLICT (role) DO UPDATE SET
      can_view_vehicles = EXCLUDED.can_view_vehicles,
      can_edit_vehicles = EXCLUDED.can_edit_vehicles,
      can_view_drivers = EXCLUDED.can_view_drivers,
      can_approve_kyc = EXCLUDED.can_approve_kyc,
      can_access_voip = EXCLUDED.can_access_voip,
      can_view_billing = EXCLUDED.can_view_billing,
      updated_at = now();
  END IF;
END $$;
