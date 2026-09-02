ALTER TABLE public.outreach_contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS signup_role text
    CHECK (signup_role IS NULL OR signup_role IN ('driver','owner'));

CREATE INDEX IF NOT EXISTS idx_outreach_contacts_email ON public.outreach_contacts (lower(email));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_change_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS role_changed_at timestamptz;

-- One-time driver <-> owner switch, single active role enforced server side.
CREATE OR REPLACE FUNCTION public.switch_primary_role(_new_role public.app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _current public.app_role;
  _used boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _new_role NOT IN ('driver'::public.app_role, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'Only driver and owner roles can be switched';
  END IF;

  SELECT role INTO _current
  FROM public.user_roles
  WHERE user_id = _uid
    AND role IN ('driver'::public.app_role, 'owner'::public.app_role)
  LIMIT 1;

  IF _current IS NULL THEN
    RAISE EXCEPTION 'No driver or owner role on this account';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role IN ('admin'::public.app_role, 'admin_assistant'::public.app_role,
                   'legal_support'::public.app_role, 'iot_support'::public.app_role,
                   'vehicle_support'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Staff accounts cannot switch role';
  END IF;

  IF _current = _new_role THEN
    RETURN jsonb_build_object('changed', false, 'role', _current::text, 'role_change_used', true);
  END IF;

  SELECT COALESCE(role_change_used, false) INTO _used FROM public.profiles WHERE user_id = _uid;

  IF COALESCE(_used, false) THEN
    RAISE EXCEPTION 'Your one-time role change has already been used';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _uid
    AND role IN ('driver'::public.app_role, 'owner'::public.app_role);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, _new_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET role_change_used = true,
      role_changed_at = now()
  WHERE user_id = _uid;

  INSERT INTO public.role_audit_log (actor_id, target_user_id, action, old_role, new_role, notes)
  VALUES (_uid, _uid, 'self_role_switch', _current, _new_role, 'One-time driver/owner role switch');

  UPDATE public.outreach_contacts
  SET signup_role = _new_role::text, updated_at = now()
  WHERE converted_user_id = _uid;

  RETURN jsonb_build_object('changed', true, 'role', _new_role::text, 'role_change_used', true);
END;
$$;

REVOKE ALL ON FUNCTION public.switch_primary_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_primary_role(public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_role_change_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'current_role', (
      SELECT role::text FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('driver'::public.app_role, 'owner'::public.app_role)
      LIMIT 1
    ),
    'role_change_used', COALESCE((SELECT role_change_used FROM public.profiles WHERE user_id = auth.uid()), false),
    'role_changed_at', (SELECT role_changed_at FROM public.profiles WHERE user_id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.get_my_role_change_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role_change_status() TO authenticated;

-- Link a new signup back to the outreach contact list (match on email or phone).
CREATE OR REPLACE FUNCTION public.link_outreach_contact_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  SELECT role::text INTO _role
  FROM public.user_roles
  WHERE user_id = NEW.user_id
    AND role IN ('driver'::public.app_role, 'owner'::public.app_role)
  LIMIT 1;

  UPDATE public.outreach_contacts oc
  SET converted_user_id = NEW.user_id,
      status = CASE WHEN oc.status IN ('signed_up','onboarded') THEN oc.status ELSE 'signed_up' END,
      signup_role = COALESCE(_role, oc.signup_role),
      updated_at = now()
  WHERE oc.converted_user_id IS NULL
    AND (
      (NEW.email IS NOT NULL AND lower(oc.email) = lower(NEW.email))
      OR (NEW.phone IS NOT NULL AND oc.phone_e164 = NEW.phone)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_outreach_contact ON public.profiles;
CREATE TRIGGER trg_link_outreach_contact
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.link_outreach_contact_on_signup();