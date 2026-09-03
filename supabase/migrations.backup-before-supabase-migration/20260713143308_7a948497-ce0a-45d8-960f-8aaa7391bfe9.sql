GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_any_support_staff(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_staff_city(uuid, support_task_type) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_support_staff(uuid, support_task_type) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_can_access_user(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_assistant_permission(uuid, text) TO anon, authenticated;