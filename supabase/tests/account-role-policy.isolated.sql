-- Run only against an empty, disposable PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/account-role-policy.isolated.sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.user_id', true), '')::uuid
$$;
CREATE TYPE public.app_role AS ENUM (
  'driver', 'owner', 'admin', 'admin_assistant', 'legal_support',
  'iot_support', 'vehicle_support', 'insurance_support'
);
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, phone text, email_confirmed_at timestamptz, phone_confirmed_at timestamptz, deleted_at timestamptz
);
CREATE TABLE public.test_rate_limits (identifier text);
CREATE FUNCTION public.check_auth_rate_limit(text, text, integer, integer)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.test_rate_limits VALUES ($1);
  RETURN true;
END;
$$;
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY, email text, phone text,
  role_change_used boolean NOT NULL DEFAULT false, role_changed_at timestamptz
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE (user_id, role)
);
CREATE TABLE public.role_audit_log (
  actor_id uuid, target_user_id uuid, action text CHECK (action IN
    ('created', 'role_assigned', 'role_changed', 'role_removed')),
  old_role public.app_role, new_role public.app_role, notes text
);
CREATE TABLE public.outreach_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text, raw_phone text, contact_type text,
  source text, created_at timestamptz DEFAULT now(),
  email text, phone_e164 text, converted_user_id uuid, status text,
  signup_role text, updated_at timestamptz, opted_out boolean
);
CREATE TABLE public.marketing_leads (
  email text, user_id uuid, stage text, updated_at timestamptz, opted_out boolean
);
CREATE TABLE public.test_wallets (user_id uuid, role public.app_role);
CREATE FUNCTION public.provision_user_account(uuid, public.app_role, text)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.user_roles VALUES ($1, $2) ON CONFLICT DO NOTHING;
  INSERT INTO public.test_wallets VALUES ($1, $2);
  RETURN '{"ok": true}'::jsonb;
END;
$$;
CREATE FUNCTION public.link_outreach_contact_on_signup() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_link_outreach_contact AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.link_outreach_contact_on_signup();
CREATE TABLE public.applications (
  user_id uuid, status text, phone_country text, phone_number text, first_name text,
  last_name text, email text, application_type text
);
CREATE FUNCTION public.sync_outreach_contact_from_application() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_sync_outreach_contact_from_application AFTER INSERT OR UPDATE OF status
ON public.applications FOR EACH ROW EXECUTE FUNCTION public.sync_outreach_contact_from_application();

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('00000000-0000-0000-0000-000000000003', 'Backfill@example.com', now());
INSERT INTO public.outreach_contacts (email, status, opted_out)
  VALUES (' backfill@example.com ', 'contacted', true);
INSERT INTO public.marketing_leads (email, stage, opted_out)
  VALUES ('BACKFILL@example.com', 'NEW', true);

\ir ../migrations/20260812102342_3b3ac6af-c2c3-4a38-bb81-ea8e1f66f0ca.sql
\ir ../migrations/20261109110000_account_roles_and_verified_contacts.sql

DO $$
DECLARE
  existing_status jsonb;
  new_status jsonb;
BEGIN
  existing_status := public.email_signup_status(' BACKFILL@example.com ');
  new_status := public.email_signup_status('new-contact@example.com');
  IF NOT (existing_status->>'registered')::boolean
     OR (new_status->>'registered')::boolean
     OR (SELECT count(*) FROM public.test_rate_limits) <> 2 THEN
    RAISE EXCEPTION 'signup precheck did not check auth identities and record rate limits';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.outreach_contacts
      WHERE converted_user_id = '00000000-0000-0000-0000-000000000003' AND opted_out)
    OR NOT EXISTS (SELECT 1 FROM public.marketing_leads
      WHERE user_id = '00000000-0000-0000-0000-000000000003' AND stage = 'REGISTERED' AND opted_out)
  THEN RAISE EXCEPTION 'verified account backfill failed'; END IF;
END $$;

INSERT INTO public.outreach_contacts (email, status, opted_out) VALUES
  (' Prior@Example.com ', 'opted_out', true),
  ('prior@example.com', 'onboarded', false);
INSERT INTO public.marketing_leads (email, stage, opted_out) VALUES
  ('PRIOR@example.com', 'QUALIFIED', true),
  ('prior@example.com', 'RENTAL', false);
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'prior@example.com');
INSERT INTO public.profiles (user_id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'prior@example.com');
INSERT INTO public.user_roles VALUES
  ('00000000-0000-0000-0000-000000000001', 'driver');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.outreach_contacts WHERE lower(btrim(email)) = 'prior@example.com' AND converted_user_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.marketing_leads WHERE lower(btrim(email)) = 'prior@example.com' AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'unverified email linked contacts';
  END IF;
END $$;
UPDATE auth.users SET email_confirmed_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT set_config('test.user_id', '00000000-0000-0000-0000-000000000001', false);
SELECT public.link_my_verified_email_contacts();
DO $$
BEGIN
  IF (SELECT count(*) FROM public.outreach_contacts WHERE converted_user_id = '00000000-0000-0000-0000-000000000001') <> 2
     OR (SELECT count(*) FROM public.marketing_leads WHERE user_id = '00000000-0000-0000-0000-000000000001') <> 2
     OR NOT EXISTS (SELECT 1 FROM public.marketing_leads WHERE stage = 'REGISTERED' AND opted_out)
     OR NOT EXISTS (SELECT 1 FROM public.marketing_leads WHERE stage = 'RENTAL')
     OR NOT EXISTS (SELECT 1 FROM public.outreach_contacts WHERE status = 'onboarded')
     OR NOT EXISTS (SELECT 1 FROM public.outreach_contacts WHERE opted_out AND status = 'opted_out' AND signup_role = 'driver') THEN
    RAISE EXCEPTION 'verified contact correlation failed or overwrote contact preferences';
  END IF;
END $$;
INSERT INTO public.applications (user_id, status, first_name, email, application_type)
VALUES ('00000000-0000-0000-0000-000000000001', 'approved', 'Applicant', 'prior@example.com', 'driver');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outreach_contacts WHERE lower(btrim(email)) = 'prior@example.com'
      AND status = 'opted_out' AND converted_user_id = '00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'approval overwrote opt-out or linked a different user';
  END IF;
END $$;
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('00000000-0000-0000-0000-000000000002', 'PRIOR@example.com', now());
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.marketing_leads WHERE user_id = '00000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'existing contact reassigned';
  END IF;
END $$;

SELECT set_config('test.user_id', '00000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.user_roles VALUES ('00000000-0000-0000-0000-000000000001', 'owner');
    RAISE EXCEPTION 'second account type was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (public.switch_primary_role('driver')->>'role_change_used')::boolean THEN
    RAISE EXCEPTION 'no-op switch consumed the allowance';
  END IF;
  PERFORM public.switch_primary_role('owner');
  IF NOT EXISTS (SELECT 1 FROM public.test_wallets WHERE role = 'owner')
     OR NOT EXISTS (SELECT 1 FROM public.role_audit_log WHERE action = 'role_changed')
     OR EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'driver')
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    RAISE EXCEPTION 'switch did not provision, audit, and replace account type';
  END IF;
  BEGIN
    PERFORM public.switch_primary_role('driver');
    RAISE EXCEPTION 'second switch was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%already been used%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO public.user_roles VALUES
  ('00000000-0000-0000-0000-000000000001', 'legal_support'),
  ('00000000-0000-0000-0000-000000000001', 'iot_support');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.user_roles WHERE role IN ('legal_support', 'iot_support')) <> 2 THEN
    RAISE EXCEPTION 'administrative roles must coexist';
  END IF;
  BEGIN
    PERFORM public.switch_primary_role('driver');
    RAISE EXCEPTION 'staff switch was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%Staff accounts%' THEN RAISE; END IF;
  END;
END $$;

ALTER TABLE public.user_roles DISABLE TRIGGER guard_account_type_role;
INSERT INTO public.user_roles VALUES ('00000000-0000-0000-0000-000000000001', 'driver');
ALTER TABLE public.user_roles ENABLE TRIGGER guard_account_type_role;
DO $$
BEGIN
  IF NOT (public.get_my_role_change_status()->>'conflicting_roles')::boolean THEN
    RAISE EXCEPTION 'legacy conflicting roles were not reported';
  END IF;
END $$;

-- Exercise the real signup trigger against minimal synthetic auth/profile tables.
ALTER TABLE auth.users ADD COLUMN raw_user_meta_data jsonb, ADD COLUMN raw_app_meta_data jsonb;
ALTER TABLE public.profiles
  ADD COLUMN full_name text, ADD COLUMN avatar_url text, ADD COLUMN preferred_country text,
  ADD COLUMN region_mode text, ADD COLUMN notification_email boolean,
  ADD COLUMN notification_sms boolean, ADD COLUMN notification_whatsapp boolean,
  ADD COLUMN email_verified boolean DEFAULT false, ADD COLUMN onboarding_state jsonb;
CREATE TABLE public.two_factor_settings (
  user_id uuid PRIMARY KEY, is_enabled boolean, is_mandatory boolean,
  preferred_channel text, phone_number text
);
\ir ../migrations/20261109120000_admin_staff_account_seed.sql
CREATE TRIGGER test_handle_new_user AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES
  ('00000000-0000-0000-0000-000000000011', 'staff@example.test', '{}', '{"admin_staff_creation":true}'),
  ('00000000-0000-0000-0000-000000000012', 'public@example.test', '{"admin_staff_creation":true}', '{}'),
  ('00000000-0000-0000-0000-000000000013', 'owner@example.test', '{"requested_role":"owner"}', '{}');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000011')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000011')
    OR EXISTS (SELECT 1 FROM public.test_wallets WHERE user_id = '00000000-0000-0000-0000-000000000011')
  THEN RAISE EXCEPTION 'staff signup seeded a public account role or wallet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000012' AND role = 'driver')
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000013' AND role = 'owner')
  THEN RAISE EXCEPTION 'public signup role seeding changed'; END IF;
END $$;

CREATE TABLE public.support_staff (
  user_id uuid, support_type text, is_active boolean
);
CREATE TABLE public.admin_assistant_permissions (user_id uuid, can_view_users boolean);
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
\ir ../migrations/20261109130000_staff_role_revocation.sql
INSERT INTO public.user_roles VALUES
  ('00000000-0000-0000-0000-000000000011', 'iot_support'),
  ('00000000-0000-0000-0000-000000000011', 'legal_support');
INSERT INTO public.support_staff VALUES
  ('00000000-0000-0000-0000-000000000011', 'iot_installation', true),
  ('00000000-0000-0000-0000-000000000011', 'iot_maintenance', true),
  ('00000000-0000-0000-0000-000000000011', 'legal', true);
INSERT INTO public.admin_assistant_permissions VALUES
  ('00000000-0000-0000-0000-000000000011', true);
DELETE FROM public.user_roles
WHERE user_id = '00000000-0000-0000-0000-000000000011' AND role = 'iot_support';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.support_staff WHERE support_type LIKE 'iot_%' AND is_active)
    OR NOT EXISTS (SELECT 1 FROM public.support_staff WHERE support_type = 'legal' AND is_active)
    OR NOT public.has_admin_assistant_permission('00000000-0000-0000-0000-000000000011', 'can_view_users')
  THEN RAISE EXCEPTION 'removing one staff role affected the wrong assignments or permissions'; END IF;
END $$;
DELETE FROM public.user_roles
WHERE user_id = '00000000-0000-0000-0000-000000000011' AND role = 'legal_support';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.support_staff WHERE user_id = '00000000-0000-0000-0000-000000000011' AND is_active)
    OR public.has_admin_assistant_permission('00000000-0000-0000-0000-000000000011', 'can_view_users')
  THEN RAISE EXCEPTION 'removed staff roles retained assignments or permissions'; END IF;
END $$;
