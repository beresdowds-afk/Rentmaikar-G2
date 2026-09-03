-- 1) Training completions: no direct client writes ------------------------
DROP POLICY IF EXISTS "Users can create their own completions" ON public.training_completions;
REVOKE INSERT, UPDATE, DELETE ON public.training_completions FROM authenticated;
GRANT SELECT ON public.training_completions TO authenticated;
GRANT ALL ON public.training_completions TO service_role;

CREATE OR REPLACE FUNCTION public.complete_training_module(_module_id uuid, _score integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.training_modules m WHERE m.id = _module_id AND COALESCE(m.is_active, true)) THEN
    RAISE EXCEPTION 'Training module not found or inactive' USING ERRCODE = '22023';
  END IF;

  IF _score IS NOT NULL AND (_score < 0 OR _score > 100) THEN
    RAISE EXCEPTION 'Score must be between 0 and 100' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.training_completions (user_id, module_id, completed_at, score)
  VALUES (v_uid, _module_id, now(), _score)
  ON CONFLICT (user_id, module_id) DO UPDATE
    SET score = COALESCE(EXCLUDED.score, public.training_completions.score)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_training_module(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_training_module(uuid, integer) TO authenticated;

-- 2) user_subscriptions: block self-created subscriptions -----------------
DROP POLICY IF EXISTS "Users can create their own subscriptions" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.user_subscriptions;
REVOKE INSERT, DELETE ON public.user_subscriptions FROM authenticated;
GRANT SELECT, UPDATE ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;