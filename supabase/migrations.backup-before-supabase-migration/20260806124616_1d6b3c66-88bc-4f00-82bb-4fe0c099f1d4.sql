CREATE OR REPLACE FUNCTION public.purge_user_account(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  _deleted jsonb := '{}'::jsonb;
  _count integer;
BEGIN
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user required';
  END IF;

  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.data_type = 'uuid'
      AND c.column_name IN ('user_id','driver_id','owner_id','applicant_user_id','profile_user_id')
      AND c.table_name <> 'user_uuid_assignments'
    ORDER BY c.table_name
  LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name)
        USING _target_user_id;
      GET DIAGNOSTICS _count = ROW_COUNT;
      IF _count > 0 THEN
        _deleted := _deleted || jsonb_build_object(r.table_name, COALESCE((_deleted->>r.table_name)::int, 0) + _count);
      END IF;
    EXCEPTION WHEN others THEN
      _deleted := _deleted || jsonb_build_object(r.table_name || '_error', SQLERRM);
    END;
  END LOOP;

  DELETE FROM public.user_uuid_assignments WHERE user_id = _target_user_id;

  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_account(uuid) TO service_role;