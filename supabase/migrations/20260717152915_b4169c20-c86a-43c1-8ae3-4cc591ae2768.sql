ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
     SET onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
         updated_at = v_now
   WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, onboarding_completed_at)
    VALUES (auth.uid(), v_now);
  END IF;

  RETURN v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;
