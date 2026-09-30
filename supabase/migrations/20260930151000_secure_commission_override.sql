CREATE OR REPLACE FUNCTION public.set_owner_share_pct(
  _owner_share_pct numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator privileges required';
  END IF;

  IF _owner_share_pct <= 0 OR _owner_share_pct >= 1 THEN
    RAISE EXCEPTION
      'owner_share_pct must be greater than 0 and less than 1';
  END IF;

  INSERT INTO public.platform_kv_settings (
    key,
    value,
    updated_by,
    updated_at
  )
  VALUES (
    'owner_share_pct',
    jsonb_build_object(
      'owner_share_pct',
      round(_owner_share_pct, 6)
    ),
    auth.uid(),
    now()
  )
  ON CONFLICT (key)
  DO UPDATE SET
    value = EXCLUDED.value,
    updated_by = auth.uid(),
    updated_at = now();

  RETURN _owner_share_pct;
END;
$$;

REVOKE ALL
ON FUNCTION public.set_owner_share_pct(numeric)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.set_owner_share_pct(numeric)
TO authenticated, service_role;
