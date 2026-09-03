ALTER TABLE public.admin_assistant_permissions DISABLE TRIGGER USER;

INSERT INTO public.admin_assistant_permissions (
  user_id,
  can_view_users, can_manage_users,
  can_view_vehicles, can_manage_vehicles,
  can_view_rentals, can_manage_rentals,
  can_view_payments, can_manage_payments,
  can_view_support_tasks, can_manage_support_tasks,
  can_view_iot, can_manage_iot,
  can_view_communications, can_send_communications,
  can_view_reports, can_manage_content,
  can_view_audit_log,
  notes
)
SELECT ur.user_id,
  true, true, true, true, true, true, true, true, true, true,
  true, true, true, true, true, true, true,
  'Auto-granted access to Admin Assistant Dashboard'
FROM public.user_roles ur
WHERE ur.role = 'admin_assistant'
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_assistant_permissions p WHERE p.user_id = ur.user_id
  );

ALTER TABLE public.admin_assistant_permissions ENABLE TRIGGER USER;