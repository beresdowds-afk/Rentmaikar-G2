-- =============================================================================
-- IoT RLS & SECURITY DEFINER helper regression tests
-- =============================================================================
-- Verifies:
--   1. Structural: SELECT policies on vehicle_mqtt_credentials and
--      mqtt_telemetry_logs scope to admins + support_staff whose
--      support_type is 'iot_installation' or 'iot_maintenance' (never
--      is_any_support_staff() alone).
--   2. Behavioral: SECURITY DEFINER helpers (has_role, is_any_support_staff,
--      is_support_staff, get_support_staff_city, is_admin) refuse to answer
--      about any user other than auth.uid() unless the caller is an admin.
--
-- Run with:
--   psql -f supabase/tests/iot-rls-tests.sql
--
-- Any failing ASSERT aborts and returns non-zero. All test-only state is
-- rolled back at the end.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- Set the jwt.claims.sub GUC that public.auth.uid() reads. This works without
-- SET ROLE because Supabase's auth.uid() derives from the jwt claim.
CREATE OR REPLACE FUNCTION pg_temp.become(_uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text,
    true
  );
END;
$$ LANGUAGE plpgsql;

DO $tests$
DECLARE
  admin_id       uuid;
  iot_install_id uuid;
  iot_maint_id   uuid;
  legal_id       uuid;
  vehicle_id     uuid;
  driver_id      uuid;
  cred_qual      text;
  telem_qual     text;
  txt            text;
  ok             boolean;
BEGIN
  ------------------------------------------------------------------
  -- Part 1: STRUCTURAL — policy definitions on the two tables must
  -- include an IoT-specific support_type check and MUST NOT allow
  -- the broad is_any_support_staff() path.
  ------------------------------------------------------------------
  RAISE NOTICE '--- 1. Policy structure: vehicle_mqtt_credentials + mqtt_telemetry_logs ---';

  SELECT qual INTO cred_qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'vehicle_mqtt_credentials'
     AND cmd        = 'SELECT';
  ASSERT cred_qual IS NOT NULL,
    'vehicle_mqtt_credentials has no SELECT policy';
  ASSERT cred_qual ILIKE '%iot_installation%'
     AND cred_qual ILIKE '%iot_maintenance%',
    format('vehicle_mqtt_credentials SELECT policy missing IoT support_type scoping: %s', cred_qual);
  ASSERT cred_qual NOT ILIKE '%is_any_support_staff%',
    format('vehicle_mqtt_credentials SELECT policy still uses broad is_any_support_staff(): %s', cred_qual);
  RAISE NOTICE '  vehicle_mqtt_credentials: IoT-only scoping verified';

  SELECT qual INTO telem_qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'mqtt_telemetry_logs'
     AND cmd        = 'SELECT'
     AND policyname = 'IoT support can view telemetry';
  ASSERT telem_qual IS NOT NULL,
    'mqtt_telemetry_logs "IoT support can view telemetry" SELECT policy missing';
  ASSERT telem_qual ILIKE '%iot_installation%'
     AND telem_qual ILIKE '%iot_maintenance%',
    format('mqtt_telemetry_logs SELECT policy missing IoT support_type scoping: %s', telem_qual);
  ASSERT telem_qual NOT ILIKE '%is_any_support_staff%',
    format('mqtt_telemetry_logs SELECT policy still uses broad is_any_support_staff(): %s', telem_qual);
  RAISE NOTICE '  mqtt_telemetry_logs: IoT-only scoping verified';

  ------------------------------------------------------------------
  -- Part 2: BEHAVIORAL — SECURITY DEFINER helper guards. We
  -- impersonate real users by setting request.jwt.claims. This does
  -- not require SET ROLE because the helpers only read auth.uid().
  ------------------------------------------------------------------
  RAISE NOTICE '--- 2. SECURITY DEFINER helper guards ---';

  SELECT user_id INTO admin_id  FROM public.user_roles WHERE role = 'admin'  LIMIT 1;
  SELECT user_id INTO driver_id FROM public.user_roles WHERE role = 'driver' LIMIT 1;

  SELECT s.user_id INTO iot_install_id
    FROM public.support_staff s
   WHERE s.support_type = 'iot_installation' AND s.is_active LIMIT 1;
  SELECT s.user_id INTO iot_maint_id
    FROM public.support_staff s
   WHERE s.support_type = 'iot_maintenance' AND s.is_active LIMIT 1;
  SELECT s.user_id INTO legal_id
    FROM public.support_staff s
   WHERE s.support_type NOT IN ('iot_installation','iot_maintenance')
     AND s.is_active
     AND s.support_type::text ILIKE 'legal%' LIMIT 1;
  SELECT s.user_id INTO vehicle_id
    FROM public.support_staff s
   WHERE s.support_type NOT IN ('iot_installation','iot_maintenance')
     AND s.is_active
     AND s.support_type::text ILIKE 'vehicle%' LIMIT 1;

  RAISE NOTICE 'Fixture users → admin=%, iot_install=%, iot_maint=%, legal=%, vehicle=%, driver=%',
    admin_id, iot_install_id, iot_maint_id, legal_id, vehicle_id, driver_id;

  -- has_role: driver may inspect own role only.
  IF driver_id IS NOT NULL AND admin_id IS NOT NULL THEN
    PERFORM pg_temp.become(driver_id);
    SELECT public.has_role(driver_id, 'driver'::app_role) INTO ok;
    ASSERT ok, 'driver querying own role should return true';
    SELECT public.has_role(admin_id, 'admin'::app_role) INTO ok;
    ASSERT NOT ok, 'driver must NOT be able to probe admin role via has_role';
    RAISE NOTICE '  has_role: self-lookup allowed, cross-user blocked for non-admin';

    PERFORM pg_temp.become(admin_id);
    SELECT public.has_role(driver_id, 'driver'::app_role) INTO ok;
    ASSERT ok, 'admin should be able to inspect other users via has_role';
    RAISE NOTICE '  has_role: admin can query any user';
  ELSE
    RAISE NOTICE '  has_role: missing driver or admin fixture — skipped';
  END IF;

  -- is_any_support_staff
  IF driver_id IS NOT NULL AND iot_install_id IS NOT NULL THEN
    PERFORM pg_temp.become(driver_id);
    SELECT public.is_any_support_staff(iot_install_id) INTO ok;
    ASSERT NOT ok, 'driver must NOT probe support_staff via is_any_support_staff';
    SELECT public.is_any_support_staff(driver_id) INTO ok;
    ASSERT NOT ok, 'driver-self is_any_support_staff should be false (driver is not staff)';
    RAISE NOTICE '  is_any_support_staff: cross-user blocked';
  END IF;

  -- is_support_staff
  IF legal_id IS NOT NULL AND iot_install_id IS NOT NULL THEN
    PERFORM pg_temp.become(legal_id);
    SELECT public.is_support_staff(iot_install_id, 'iot_installation'::support_task_type) INTO ok;
    ASSERT NOT ok, 'legal staff must NOT probe another user via is_support_staff';
    RAISE NOTICE '  is_support_staff: cross-user blocked';
  END IF;

  -- get_support_staff_city
  IF driver_id IS NOT NULL AND iot_install_id IS NOT NULL THEN
    PERFORM pg_temp.become(driver_id);
    SELECT public.get_support_staff_city(iot_install_id, 'iot_installation'::support_task_type) INTO txt;
    ASSERT txt IS NULL, 'driver must NOT retrieve another user city via get_support_staff_city';
    RAISE NOTICE '  get_support_staff_city: cross-user returns NULL';
  END IF;

  -- is_admin only reports on the caller
  IF driver_id IS NOT NULL THEN
    PERFORM pg_temp.become(driver_id);
    SELECT public.is_admin() INTO ok;
    ASSERT NOT ok, 'driver is_admin() must be false';
  END IF;
  IF admin_id IS NOT NULL THEN
    PERFORM pg_temp.become(admin_id);
    SELECT public.is_admin() INTO ok;
    ASSERT ok, 'admin is_admin() must be true';
  END IF;
  RAISE NOTICE '  is_admin: reports caller correctly';

  RAISE NOTICE '=== ALL IoT RLS + HELPER TESTS PASSED ===';
END
$tests$;

ROLLBACK;
