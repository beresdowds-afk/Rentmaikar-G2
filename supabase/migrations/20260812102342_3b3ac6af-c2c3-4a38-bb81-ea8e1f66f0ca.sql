CREATE OR REPLACE FUNCTION public.email_signup_status(_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(_email, '')));
  v_allowed boolean;
  v_exists boolean;
BEGIN
  IF v_email = '' OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_email) > 254 THEN
    RETURN jsonb_build_object('registered', false, 'rate_limited', false);
  END IF;

  -- Throttle probing so this cannot be used to enumerate the user base.
  SELECT public.check_auth_rate_limit(
    'signup_check:' || v_email, 'auth.signup_check', 10, 900
  ) INTO v_allowed;

  IF v_allowed IS FALSE THEN
    RETURN jsonb_build_object('registered', false, 'rate_limited', true);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(u.email) = v_email AND u.deleted_at IS NULL
  ) INTO v_exists;

  RETURN jsonb_build_object('registered', v_exists, 'rate_limited', false);
END;
$$;

REVOKE ALL ON FUNCTION public.email_signup_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_signup_status(text) TO anon, authenticated;