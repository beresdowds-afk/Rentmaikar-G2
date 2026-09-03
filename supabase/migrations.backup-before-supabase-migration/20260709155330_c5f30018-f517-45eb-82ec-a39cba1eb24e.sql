
CREATE TABLE IF NOT EXISTS public.admin_assistant_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view_users BOOLEAN NOT NULL DEFAULT false,
  can_manage_users BOOLEAN NOT NULL DEFAULT false,
  can_view_vehicles BOOLEAN NOT NULL DEFAULT false,
  can_manage_vehicles BOOLEAN NOT NULL DEFAULT false,
  can_view_rentals BOOLEAN NOT NULL DEFAULT false,
  can_manage_rentals BOOLEAN NOT NULL DEFAULT false,
  can_view_payments BOOLEAN NOT NULL DEFAULT false,
  can_manage_payments BOOLEAN NOT NULL DEFAULT false,
  can_view_support_tasks BOOLEAN NOT NULL DEFAULT false,
  can_manage_support_tasks BOOLEAN NOT NULL DEFAULT false,
  can_view_iot BOOLEAN NOT NULL DEFAULT false,
  can_manage_iot BOOLEAN NOT NULL DEFAULT false,
  can_view_communications BOOLEAN NOT NULL DEFAULT false,
  can_send_communications BOOLEAN NOT NULL DEFAULT false,
  can_view_reports BOOLEAN NOT NULL DEFAULT false,
  can_manage_content BOOLEAN NOT NULL DEFAULT false,
  can_view_audit_log BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_assistant_permissions TO authenticated;
GRANT ALL ON public.admin_assistant_permissions TO service_role;

ALTER TABLE public.admin_assistant_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all assistant permissions"
  ON public.admin_assistant_permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Assistants can view own permissions"
  ON public.admin_assistant_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_admin_assistant_permissions_updated_at
  BEFORE UPDATE ON public.admin_assistant_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Security-definer helper to check a permission by column name
CREATE OR REPLACE FUNCTION public.has_admin_assistant_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result BOOLEAN;
  _allowed TEXT[] := ARRAY[
    'can_view_users','can_manage_users','can_view_vehicles','can_manage_vehicles',
    'can_view_rentals','can_manage_rentals','can_view_payments','can_manage_payments',
    'can_view_support_tasks','can_manage_support_tasks','can_view_iot','can_manage_iot',
    'can_view_communications','can_send_communications','can_view_reports',
    'can_manage_content','can_view_audit_log'
  ];
BEGIN
  IF NOT (_permission = ANY(_allowed)) THEN
    RETURN false;
  END IF;
  EXECUTE format('SELECT %I FROM public.admin_assistant_permissions WHERE user_id = $1', _permission)
    INTO _result USING _user_id;
  RETURN COALESCE(_result, false);
END;
$$;
