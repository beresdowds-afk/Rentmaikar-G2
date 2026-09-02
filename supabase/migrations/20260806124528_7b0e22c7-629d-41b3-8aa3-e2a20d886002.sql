ALTER TABLE public.admin_assistant_permissions
  ADD COLUMN IF NOT EXISTS can_delete_users boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_delete_user_account(_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _target_roles app_role[];
BEGIN
  IF _caller IS NULL OR _target_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- never allow deleting yourself through this portal
  IF _caller = _target_user_id THEN
    RETURN false;
  END IF;

  -- full admins may delete any account
  IF public.has_role(_caller, 'admin') THEN
    RETURN true;
  END IF;

  -- admin assistants need the explicit delete permission
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_assistant_permissions
    WHERE user_id = _caller AND can_delete_users = true
  ) THEN
    RETURN false;
  END IF;

  SELECT array_agg(role) INTO _target_roles
  FROM public.user_roles WHERE user_id = _target_user_id;

  -- assistants may only delete driver/owner accounts
  IF _target_roles IS NULL THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM unnest(_target_roles) r
    WHERE r NOT IN ('driver'::app_role, 'owner'::app_role)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_delete_user_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_user_account(uuid) TO authenticated, service_role;