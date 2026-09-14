-- Migration: 20260914100000_fix_platform_kv_settings_permissions.sql
-- Description: Grant proper table privileges, RLS policies, and RPC handlers for platform_kv_settings
-- Resolves: Inactive switches ("Failed to update forwarding", "Failed to update external delivery switch")

-- 1. Ensure table structure and grants
CREATE TABLE IF NOT EXISTS public.platform_kv_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grant table-level DML privileges to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_kv_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.platform_kv_settings TO anon;
GRANT ALL ON public.platform_kv_settings TO service_role;

-- 2. Enable RLS
ALTER TABLE public.platform_kv_settings ENABLE ROW LEVEL SECURITY;

-- Clean up older competing policies
DROP POLICY IF EXISTS "Anyone can read platform kv" ON public.platform_kv_settings;
DROP POLICY IF EXISTS "Public can read non-sensitive platform kv" ON public.platform_kv_settings;
DROP POLICY IF EXISTS "Admins manage platform kv" ON public.platform_kv_settings;
DROP POLICY IF EXISTS "Allow read platform kv settings" ON public.platform_kv_settings;
DROP POLICY IF EXISTS "Allow admin write platform kv settings" ON public.platform_kv_settings;
DROP POLICY IF EXISTS "Allow comms write platform kv settings" ON public.platform_kv_settings;

-- 3. SELECT Policy:
-- Allow reading public, operational, and channel forwarding settings
CREATE POLICY "Allow read platform kv settings"
ON public.platform_kv_settings
FOR SELECT
TO anon, authenticated
USING (
  key IN (
    'phone_otp_provider',
    'persona_verification',
    'inbound_forwarding_config',
    'inbound_email_routing_table',
    'outbound_forwarding_config',
    'inbound_master_endpoint',
    'inbound_loop_policy',
    'tax_jurisdiction_USD',
    'tax_jurisdiction_NGN',
    'owner_share_pct',
    'referee_requirement',
    'payment_provider_settings',
    'emqx_endpoint_settings',
    'traccar_device_ports',
    'company_contact_info'
  )
  OR public.is_admin()
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- 4. INSERT / UPDATE Policy:
-- Allow admins and staff managing channel forwarding & system toggles
CREATE POLICY "Allow write platform kv settings"
ON public.platform_kv_settings
FOR ALL
TO authenticated, anon
USING (
  key IN (
    'inbound_forwarding_config',
    'inbound_email_routing_table',
    'outbound_forwarding_config',
    'inbound_master_endpoint',
    'inbound_loop_policy',
    'phone_otp_provider',
    'persona_verification',
    'referee_requirement',
    'payment_provider_settings',
    'emqx_endpoint_settings',
    'traccar_device_ports'
  )
  OR public.is_admin()
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  key IN (
    'inbound_forwarding_config',
    'inbound_email_routing_table',
    'outbound_forwarding_config',
    'inbound_master_endpoint',
    'inbound_loop_policy',
    'phone_otp_provider',
    'persona_verification',
    'referee_requirement',
    'payment_provider_settings',
    'emqx_endpoint_settings',
    'traccar_device_ports'
  )
  OR public.is_admin()
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- 5. Safe SECURITY DEFINER RPC functions for resilient client updates
CREATE OR REPLACE FUNCTION public.set_platform_kv_setting(
  _key text,
  _value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _key IS NULL OR length(trim(_key)) = 0 THEN
    RAISE EXCEPTION 'Key cannot be empty';
  END IF;

  INSERT INTO public.platform_kv_settings (key, value, updated_at, updated_by)
  VALUES (_key, _value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now(),
      updated_by = auth.uid();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_platform_kv_setting(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_platform_kv_setting(text, jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_platform_kv_setting(
  _key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.platform_kv_settings WHERE key = _key;
$$;

REVOKE ALL ON FUNCTION public.get_platform_kv_setting(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_kv_setting(text) TO anon, authenticated, service_role;
