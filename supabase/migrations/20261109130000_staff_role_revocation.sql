-- A removed support role must not retain access through its staff assignments.
CREATE OR REPLACE FUNCTION public.deactivate_removed_support_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role = OLD.role AND NEW.user_id = OLD.user_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.support_staff
  SET is_active = false
  WHERE user_id = OLD.user_id AND is_active = true
    AND (
      (OLD.role = 'legal_support' AND support_type::text = 'legal')
      OR (OLD.role = 'iot_support' AND support_type::text IN ('iot_installation', 'iot_maintenance'))
      OR (OLD.role = 'vehicle_support' AND support_type::text IN ('vehicle_recall', 'vehicle_maintenance'))
      OR (OLD.role = 'insurance_support' AND support_type::text = 'insurance')
    );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.deactivate_removed_support_role() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS deactivate_removed_support_role ON public.user_roles;
CREATE TRIGGER deactivate_removed_support_role AFTER DELETE OR UPDATE OF role, user_id
ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.deactivate_removed_support_role();

-- Permission rows may also serve support staff, but cannot confer access on
-- their own after the user's last administrative/staff role is removed.
CREATE OR REPLACE FUNCTION public.has_admin_assistant_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result boolean;
  is_allowed boolean;
BEGIN
  IF public.has_role(_user_id, 'admin'::public.app_role) THEN RETURN true; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN (
      'admin_assistant'::public.app_role, 'legal_support'::public.app_role,
      'iot_support'::public.app_role, 'vehicle_support'::public.app_role,
      'insurance_support'::public.app_role
    )
  ) THEN RETURN false; END IF;
  IF _permission IS NULL OR _permission !~ '^can_[a-z0-9_]+$' THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'admin_assistant_permissions'
      AND c.column_name = _permission AND c.data_type = 'boolean'
  ) INTO is_allowed;
  IF NOT is_allowed THEN RETURN false; END IF;
  EXECUTE format('SELECT %I FROM public.admin_assistant_permissions WHERE user_id = $1', _permission)
    INTO result USING _user_id;
  RETURN COALESCE(result, false);
END;
$$;
