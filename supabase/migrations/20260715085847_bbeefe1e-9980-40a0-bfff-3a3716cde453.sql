
REVOKE EXECUTE ON FUNCTION public.get_linked_user_ids(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_linked_user_ids(UUID) TO authenticated, service_role;
