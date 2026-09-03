ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cookie_consent jsonb,
  ADD COLUMN IF NOT EXISTS cookie_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.save_my_cookie_consent(_prefs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _clean jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _clean := jsonb_build_object(
    'necessary', true,
    'analytics', coalesce((_prefs->>'analytics')::boolean, false),
    'marketing', coalesce((_prefs->>'marketing')::boolean, false),
    'preferences', coalesce((_prefs->>'preferences')::boolean, false)
  );

  UPDATE public.profiles
     SET cookie_consent = _clean,
         cookie_consent_at = now()
   WHERE user_id = _uid;

  RETURN jsonb_build_object('preferences', _clean, 'timestamp', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_cookie_consent()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.cookie_consent IS NULL THEN NULL
    ELSE jsonb_build_object('preferences', p.cookie_consent, 'timestamp', p.cookie_consent_at)
  END
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.save_my_cookie_consent(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_cookie_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_cookie_consent(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_cookie_consent() TO authenticated;