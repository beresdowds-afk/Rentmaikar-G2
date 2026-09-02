-- Remove self-service write on refresh requirements
DROP POLICY IF EXISTS "Users can update their own refresh status" ON public.training_refresh_requirements;

REVOKE INSERT, UPDATE, DELETE ON public.training_refresh_requirements FROM authenticated, anon;
GRANT SELECT ON public.training_refresh_requirements TO authenticated;
GRANT ALL ON public.training_refresh_requirements TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.training_completions FROM authenticated, anon;
GRANT SELECT ON public.training_completions TO authenticated;
GRANT ALL ON public.training_completions TO service_role;

-- Server-side refresh bookkeeping on module completion
CREATE OR REPLACE FUNCTION public.complete_training_module(_module_id uuid, _score integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_region text;
  v_total int;
  v_done int;
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

  SELECT region INTO v_region FROM public.training_modules WHERE id = _module_id;

  SELECT count(*) INTO v_total
  FROM public.training_modules m
  WHERE COALESCE(m.is_active, true)
    AND (m.region = 'all' OR m.region = v_region);

  SELECT count(*) INTO v_done
  FROM public.training_completions tc
  JOIN public.training_modules m ON m.id = tc.module_id
  WHERE tc.user_id = v_uid
    AND COALESCE(m.is_active, true)
    AND (m.region = 'all' OR m.region = v_region);

  IF v_total > 0 AND v_done >= v_total THEN
    INSERT INTO public.training_refresh_requirements (user_id, last_completed_at, next_due_at, status)
    VALUES (v_uid, now(), now() + interval '180 days', 'completed')
    ON CONFLICT (user_id) DO UPDATE
      SET last_completed_at = EXCLUDED.last_completed_at,
          next_due_at = EXCLUDED.next_due_at,
          status = 'completed';
  END IF;

  RETURN v_id;
END;
$function$;