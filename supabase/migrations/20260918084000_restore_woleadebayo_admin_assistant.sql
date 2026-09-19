-- Migration: Restore woleadebayo58@gmail.com as Admin Assistant
-- Migrates role back to admin_assistant if any other role was assigned,
-- and ensures default permissions in admin_assistant_permissions.

DO $$
DECLARE
  v_user_id UUID;
  v_admin_id UUID := '2b5f4e1d-fd58-40ed-8a79-cb6ec18b4dac'::uuid;
BEGIN
  -- Check if user exists in auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = 'woleadebayo58@gmail.com'
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Ensure single role: Remove any conflicting/stale non-assistant roles
    DELETE FROM public.user_roles
    WHERE user_id = v_user_id
      AND role != 'admin_assistant';

    -- Insert or ensure admin_assistant role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin_assistant')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Ensure public.profiles has correct baseline full_name
    UPDATE public.profiles
    SET full_name = COALESCE(NULLIF(full_name, ''), 'Wole Adebayo')
    WHERE user_id = v_user_id;

    -- Provision default admin_assistant_permissions if not present
    INSERT INTO public.admin_assistant_permissions (
      user_id,
      granted_by,
      can_view_users,
      can_manage_users,
      can_view_vehicles,
      can_manage_vehicles,
      can_view_rentals,
      can_manage_rentals,
      can_view_payments,
      can_manage_payments,
      can_view_support_tasks,
      can_manage_support_tasks,
      can_view_iot,
      can_manage_iot,
      can_view_communications,
      can_send_communications,
      can_view_reports,
      can_manage_content,
      can_view_audit_log,
      notes
    )
    SELECT
      v_user_id,
      v_admin_id,
      true, false,
      true, false,
      true, false,
      true, false,
      true, true,
      true, false,
      true, true,
      true, false,
      true,
      'Restored default Admin Assistant baseline permissions'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.admin_assistant_permissions WHERE user_id = v_user_id
    );
  END IF;
END $$;
