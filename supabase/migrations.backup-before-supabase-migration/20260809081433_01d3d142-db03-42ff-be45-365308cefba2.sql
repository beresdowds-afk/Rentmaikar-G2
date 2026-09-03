ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = 'public', 'pgmq', 'pg_temp';
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = 'public', 'pgmq', 'pg_temp';
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = 'public', 'pgmq', 'pg_temp';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = 'public', 'pgmq', 'pg_temp';

CREATE OR REPLACE FUNCTION public.has_admin_assistant_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result boolean;
  is_allowed boolean;
BEGIN
  IF public.has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  IF _permission IS NULL OR _permission !~ '^can_[a-z0-9_]+$' THEN
    RETURN false;
  END IF;

  -- Explicit allow-list: only boolean permission-flag columns named can_*
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'admin_assistant_permissions'
      AND c.column_name = _permission
      AND c.data_type = 'boolean'
  ) INTO is_allowed;

  IF NOT is_allowed THEN
    RETURN false;
  END IF;

  EXECUTE format('SELECT %I FROM public.admin_assistant_permissions WHERE user_id = $1', _permission)
    INTO result
    USING _user_id;

  RETURN COALESCE(result, false);
END;
$function$;

DROP POLICY IF EXISTS "Admins can update all profile submissions" ON public.rideshare_profile_submissions;
CREATE POLICY "Admins can update all profile submissions"
ON public.rideshare_profile_submissions
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());