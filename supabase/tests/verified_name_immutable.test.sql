-- Test: verified users cannot change their full_name from a client / API context.
-- Run via: psql "$SUPABASE_DB_URL" -f supabase/tests/verified_name_immutable.test.sql
-- This must be executed by a role that can SET ROLE authenticated (superuser /
-- postgres). The trigger is defined in migration 20260720_* .
--
-- Assertions (each wrapped so the whole script always rolls back):
--   1. authenticated role cannot rename a verified profile (check_violation)
--   2. same-value UPDATE of full_name is a no-op (allowed)
--   3. unrelated columns on a verified profile still update
--   4. service_role can rename (support override path)
--   5. unverified profile can be renamed freely

BEGIN;

-- ---- Fixture ------------------------------------------------------------
-- Use a synthetic row; skip audit triggers that expect other tables.
SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, user_id, full_name, identity_verified_at, identity_verification_status)
VALUES (
  '00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-0000000000aa',
  'Verified Vera',
  now(),
  'approved'
);
INSERT INTO public.profiles (id, user_id, full_name)
VALUES (
  '00000000-0000-0000-0000-0000000000bb',
  '00000000-0000-0000-0000-0000000000bb',
  'Unverified Uma'
);
SET LOCAL session_replication_role = origin;

-- ---- 1. Authenticated user is blocked -----------------------------------
SET LOCAL request.jwt.claims TO '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000aa"}';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.profiles
      SET full_name = 'Hacker Name'
      WHERE id = '00000000-0000-0000-0000-0000000000aa';
    RAISE EXCEPTION 'ASSERTION FAILED: verified profile rename was NOT blocked';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 1: authenticated rename blocked by trigger';
  END;
END $$;

-- ---- 2. Same-value UPDATE is allowed (no IS DISTINCT FROM change) -------
UPDATE public.profiles
  SET full_name = full_name
  WHERE id = '00000000-0000-0000-0000-0000000000aa';
DO $$ BEGIN RAISE NOTICE 'OK 2: same-value update allowed'; END $$;

-- ---- 3. Unrelated column edits still work -------------------------------
UPDATE public.profiles
  SET phone = '+15551234567'
  WHERE id = '00000000-0000-0000-0000-0000000000aa';
DO $$ BEGIN RAISE NOTICE 'OK 3: unrelated column update allowed'; END $$;

-- ---- 4. service_role bypass ---------------------------------------------
RESET ROLE;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SET LOCAL ROLE service_role;
UPDATE public.profiles
  SET full_name = 'Corrected By Support'
  WHERE id = '00000000-0000-0000-0000-0000000000aa';
DO $$ BEGIN RAISE NOTICE 'OK 4: service_role bypass allowed'; END $$;

-- ---- 5. Unverified profile can be renamed -------------------------------
RESET ROLE;
SET LOCAL request.jwt.claims TO '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000bb"}';
SET LOCAL ROLE authenticated;
UPDATE public.profiles
  SET full_name = 'New Name'
  WHERE id = '00000000-0000-0000-0000-0000000000bb';
DO $$ BEGIN RAISE NOTICE 'OK 5: unverified rename allowed'; END $$;

RESET ROLE;
ROLLBACK;
