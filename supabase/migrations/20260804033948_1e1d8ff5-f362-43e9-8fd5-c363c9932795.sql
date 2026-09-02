SELECT set_config('request.jwt.claims', json_build_object('sub','2b5f4e1d-fd58-40ed-8a79-cb6ec18b4dac','role','authenticated')::text, true);

INSERT INTO public.admin_assistant_permissions (user_id, granted_by, can_view_users, can_view_rentals, can_view_payments, can_view_vehicles, can_view_iot, can_view_reports, can_view_support_tasks, can_view_communications, can_view_audit_log, notes)
SELECT ur.user_id, '2b5f4e1d-fd58-40ed-8a79-cb6ec18b4dac'::uuid, true, true, true, true, true, true, true, true, true, 'Auto-provisioned baseline (view-only) - assistant had no permissions row'
FROM public.user_roles ur
WHERE ur.role = 'admin_assistant'
  AND NOT EXISTS (SELECT 1 FROM public.admin_assistant_permissions p WHERE p.user_id = ur.user_id);