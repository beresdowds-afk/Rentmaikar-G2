-- Preserve administrative role grants, but prevent a second driver/owner
-- account type. Existing conflicting rows are left for an administrator to
-- resolve rather than silently revoking access.
-- The precheck increments a rate-limit table and cannot run as STABLE.
ALTER FUNCTION public.email_signup_status(text) VOLATILE;

CREATE OR REPLACE FUNCTION public.guard_account_type_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role NOT IN ('driver'::public.app_role, 'owner'::public.app_role) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-type:' || NEW.user_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = NEW.role
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id
      AND role IN ('driver'::public.app_role, 'owner'::public.app_role)
      AND (TG_OP = 'INSERT' OR role IS DISTINCT FROM OLD.role)
  ) THEN
    RAISE EXCEPTION 'This account already has a driver or owner account type. Use the one-time account type switch in profile settings.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_account_type_role() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_account_type_role ON public.user_roles;
CREATE TRIGGER guard_account_type_role BEFORE INSERT OR UPDATE OF role, user_id
ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_account_type_role();

CREATE OR REPLACE FUNCTION public.switch_primary_role(_new_role public.app_role)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _current public.app_role;
  _count integer;
  _used boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _new_role IS NULL OR _new_role NOT IN ('driver'::public.app_role, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'Only driver and owner roles can be switched';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-type:' || _uid::text, 0));
  SELECT count(*) INTO _count FROM public.user_roles
    WHERE user_id = _uid AND role IN ('driver'::public.app_role, 'owner'::public.app_role);
  IF _count = 0 THEN RAISE EXCEPTION 'No driver or owner role on this account'; END IF;
  IF _count > 1 THEN RAISE EXCEPTION 'Conflicting account types require administrator support'; END IF;
  SELECT role INTO _current FROM public.user_roles
    WHERE user_id = _uid AND role IN ('driver'::public.app_role, 'owner'::public.app_role);
  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN
      ('admin'::public.app_role, 'admin_assistant'::public.app_role,
       'legal_support'::public.app_role, 'iot_support'::public.app_role,
       'vehicle_support'::public.app_role, 'insurance_support'::public.app_role)
  ) THEN RAISE EXCEPTION 'Staff accounts cannot switch role'; END IF;
  SELECT role_change_used INTO _used FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account profile not found'; END IF;
  IF _current = _new_role THEN
    RETURN jsonb_build_object('changed', false, 'role', _current::text, 'role_change_used', _used);
  END IF;
  IF COALESCE(_used, false) THEN RAISE EXCEPTION 'Your one-time role change has already been used'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _uid AND role = _current;
  PERFORM public.provision_user_account(_uid, _new_role, NULL);
  UPDATE public.profiles SET role_change_used = true, role_changed_at = now() WHERE user_id = _uid;
  INSERT INTO public.role_audit_log (actor_id, target_user_id, action, old_role, new_role, notes)
    VALUES (_uid, _uid, 'role_changed', _current, _new_role, 'One-time driver/owner role switch');
  UPDATE public.outreach_contacts SET signup_role = _new_role::text, updated_at = now()
    WHERE converted_user_id = _uid;
  RETURN jsonb_build_object('changed', true, 'role', _new_role::text, 'role_change_used', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role_change_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'current_role', CASE WHEN count(*) = 1 THEN min(role::text) ELSE NULL END,
    'conflicting_roles', count(*) > 1,
    'role_change_used', COALESCE((SELECT role_change_used FROM public.profiles WHERE user_id = auth.uid()), false),
    'role_changed_at', (SELECT role_changed_at FROM public.profiles WHERE user_id = auth.uid())
  ) FROM public.user_roles
  WHERE user_id = auth.uid() AND role IN ('driver'::public.app_role, 'owner'::public.app_role);
$$;

-- A contact email is not proof of account ownership. Link only after the
-- authentication provider confirms it, and never reassign an existing link.
CREATE OR REPLACE FUNCTION public.link_verified_email_contacts(_user_id uuid, _email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _email IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = _user_id AND email_confirmed_at IS NOT NULL
      AND lower(btrim(email)) = lower(btrim(_email))
  ) THEN RETURN; END IF;
  UPDATE public.outreach_contacts
    SET converted_user_id = _user_id,
        status = CASE WHEN status IN ('signed_up', 'onboarded', 'opted_out') THEN status ELSE 'signed_up' END,
        signup_role = COALESCE((SELECT role::text FROM public.user_roles
          WHERE user_id = _user_id AND role IN ('driver'::public.app_role, 'owner'::public.app_role)
          ORDER BY role::text LIMIT 1), signup_role),
        updated_at = now()
    WHERE converted_user_id IS NULL AND lower(btrim(email)) = lower(btrim(_email));
  UPDATE public.marketing_leads
    SET user_id = _user_id,
        stage = CASE WHEN stage IN ('NEW', 'CONTACTED', 'QUALIFIED') THEN 'REGISTERED' ELSE stage END,
        updated_at = now()
    WHERE user_id IS NULL AND lower(btrim(email)) = lower(btrim(_email));
END;
$$;
REVOKE ALL ON FUNCTION public.link_verified_email_contacts(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_outreach_contact_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.link_verified_email_contacts(NEW.user_id, NEW.email);
  UPDATE public.outreach_contacts SET converted_user_id = NEW.user_id,
    status = CASE WHEN status IN ('signed_up', 'onboarded', 'opted_out') THEN status ELSE 'signed_up' END,
    updated_at = now()
    WHERE converted_user_id IS NULL AND NEW.phone IS NOT NULL AND phone_e164 = NEW.phone
      AND EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id AND phone_confirmed_at IS NOT NULL);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_my_verified_email_contacts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid AND email_confirmed_at IS NOT NULL;
  PERFORM public.link_verified_email_contacts(_uid, _email);
END;
$$;
REVOKE ALL ON FUNCTION public.link_my_verified_email_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_verified_email_contacts() TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_outreach_contact_from_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_name text;
  v_email text;
  v_role text;
  v_existing uuid;
  v_verified_email boolean;
  v_verified_phone boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;
  v_phone := regexp_replace(coalesce(NEW.phone_country, '') || coalesce(NEW.phone_number, ''), '[^0-9+]', '', 'g');
  IF v_phone <> '' AND left(v_phone, 1) <> '+' THEN v_phone := '+' || v_phone; END IF;
  IF v_phone !~ '^\+[1-9]\d{7,14}$' THEN v_phone := NULL; END IF;
  v_name := btrim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, ''));
  IF v_name = '' THEN v_name := coalesce(NEW.email, 'Unknown'); END IF;
  v_email := lower(nullif(btrim(coalesce(NEW.email, '')), ''));
  v_role := CASE WHEN NEW.application_type::text = 'owner' THEN 'owner' ELSE 'driver' END;

  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id AND email_confirmed_at IS NOT NULL
      AND lower(btrim(email)) = v_email),
    EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id AND phone_confirmed_at IS NOT NULL
      AND regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(v_phone, '[^0-9]', '', 'g'))
  INTO v_verified_email, v_verified_phone;

  SELECT id INTO v_existing FROM public.outreach_contacts
  WHERE ((v_verified_phone AND phone_e164 = v_phone) OR (v_verified_email AND lower(btrim(email)) = v_email))
    AND (converted_user_id IS NULL OR converted_user_id = NEW.user_id)
  ORDER BY (converted_user_id IS NOT NULL) DESC, created_at LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE public.outreach_contacts
    SET full_name = v_name, email = CASE WHEN v_verified_email THEN v_email ELSE email END,
        phone_e164 = CASE WHEN v_verified_phone THEN coalesce(phone_e164, v_phone) ELSE phone_e164 END,
        raw_phone = coalesce(nullif(raw_phone, ''), coalesce(v_phone, 'unknown')),
        contact_type = v_role, signup_role = v_role,
        status = CASE WHEN status IN ('onboarded', 'opted_out') THEN status ELSE 'signed_up' END,
        converted_user_id = coalesce(converted_user_id, NEW.user_id), updated_at = now()
    WHERE id = v_existing;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.outreach_contacts
    WHERE (v_phone IS NOT NULL AND phone_e164 = v_phone)
       OR (v_email IS NOT NULL AND lower(btrim(email)) = v_email)
  ) THEN
    INSERT INTO public.outreach_contacts
      (full_name, raw_phone, phone_e164, email, contact_type, signup_role, status, converted_user_id, source)
    VALUES (v_name, coalesce(v_phone, 'unknown'), v_phone, v_email, v_role, v_role, 'signed_up', NEW.user_id, 'approved_application');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_contact_account_type()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('driver'::public.app_role, 'owner'::public.app_role) THEN
    UPDATE public.outreach_contacts SET signup_role = NEW.role::text, updated_at = now()
    WHERE converted_user_id = NEW.user_id AND signup_role IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_contact_account_type() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_contact_account_type ON public.user_roles;
CREATE TRIGGER sync_contact_account_type AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_contact_account_type();

CREATE INDEX IF NOT EXISTS idx_outreach_contacts_normalized_email ON public.outreach_contacts (lower(btrim(email)));
CREATE INDEX IF NOT EXISTS idx_marketing_leads_normalized_email ON public.marketing_leads (lower(btrim(email)));

-- Repair unlinked contacts for existing verified accounts, excluding ambiguous
-- duplicate verified identities and retaining consent and lifecycle history.
WITH verified AS (
  SELECT lower(btrim(email)) AS email, min(id::text)::uuid AS user_id
  FROM auth.users
  WHERE email IS NOT NULL AND email_confirmed_at IS NOT NULL
  GROUP BY lower(btrim(email)) HAVING count(*) = 1
)
UPDATE public.outreach_contacts oc
SET converted_user_id = v.user_id,
    status = CASE WHEN oc.status IN ('signed_up', 'onboarded', 'opted_out') THEN oc.status ELSE 'signed_up' END,
    signup_role = COALESCE((SELECT CASE WHEN count(*) = 1 THEN min(role::text) ELSE NULL END
      FROM public.user_roles WHERE user_id = v.user_id
        AND role IN ('driver'::public.app_role, 'owner'::public.app_role)), oc.signup_role),
    updated_at = now()
FROM verified v WHERE oc.converted_user_id IS NULL AND lower(btrim(oc.email)) = v.email;

WITH verified AS (
  SELECT lower(btrim(email)) AS email, min(id::text)::uuid AS user_id
  FROM auth.users
  WHERE email IS NOT NULL AND email_confirmed_at IS NOT NULL
  GROUP BY lower(btrim(email)) HAVING count(*) = 1
)
UPDATE public.marketing_leads ml
SET user_id = v.user_id,
    stage = CASE WHEN ml.stage IN ('NEW', 'CONTACTED', 'QUALIFIED') THEN 'REGISTERED' ELSE ml.stage END,
    updated_at = now()
FROM verified v WHERE ml.user_id IS NULL AND lower(btrim(ml.email)) = v.email;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_roles'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
  END IF;
END;
$$;
