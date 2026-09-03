ALTER TABLE public.training_completions
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_completions_verification_status_chk'
  ) THEN
    ALTER TABLE public.training_completions
      ADD CONSTRAINT training_completions_verification_status_chk
      CHECK (verification_status IN ('pending','verified','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_training_completions_verification_status
  ON public.training_completions (verification_status, completed_at DESC);

-- Record completion as pending review; refresh schedule only after full verification
CREATE OR REPLACE FUNCTION public.complete_training_module(_module_id uuid, _score integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.training_completions (user_id, module_id, completed_at, score, verification_status)
  VALUES (v_uid, _module_id, now(), _score, 'pending')
  ON CONFLICT (user_id, module_id) DO UPDATE
    SET score = COALESCE(EXCLUDED.score, public.training_completions.score),
        completed_at = now(),
        verification_status = CASE
          WHEN public.training_completions.verification_status = 'verified' THEN 'verified'
          ELSE 'pending' END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Driver-facing status summary
CREATE OR REPLACE FUNCTION public.get_my_training_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_region text;
  v_total int;
  v_verified int;
  v_pending int;
  v_rejected int;
  v_next timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT COALESCE(preferred_country, 'US') INTO v_region FROM public.profiles WHERE id = v_uid;

  SELECT count(*) INTO v_total
  FROM public.training_modules m
  WHERE COALESCE(m.is_active, true) AND (m.region = 'all' OR m.region = v_region);

  SELECT
    count(*) FILTER (WHERE tc.verification_status = 'verified'),
    count(*) FILTER (WHERE tc.verification_status = 'pending'),
    count(*) FILTER (WHERE tc.verification_status = 'rejected')
  INTO v_verified, v_pending, v_rejected
  FROM public.training_completions tc
  JOIN public.training_modules m ON m.id = tc.module_id
  WHERE tc.user_id = v_uid
    AND COALESCE(m.is_active, true)
    AND (m.region = 'all' OR m.region = v_region);

  SELECT next_due_at INTO v_next FROM public.training_refresh_requirements WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'authenticated', true,
    'total_modules', v_total,
    'verified', COALESCE(v_verified,0),
    'pending_review', COALESCE(v_pending,0),
    'rejected', COALESCE(v_rejected,0),
    'is_complete', v_total > 0 AND COALESCE(v_verified,0) >= v_total,
    'next_due_at', v_next
  );
END;
$function$;

-- Admin queue
CREATE OR REPLACE FUNCTION public.admin_list_pending_training_completions(_status text DEFAULT 'pending')
 RETURNS TABLE (
   id uuid,
   user_id uuid,
   full_name text,
   email text,
   phone text,
   module_id uuid,
   module_title text,
   module_region text,
   score integer,
   completed_at timestamptz,
   verification_status text,
   verified_at timestamptz,
   review_notes text
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_admin_privilege() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT tc.id, tc.user_id, p.full_name, p.email, p.phone,
         tc.module_id, m.title, m.region, tc.score, tc.completed_at,
         tc.verification_status, tc.verified_at, tc.review_notes
  FROM public.training_completions tc
  JOIN public.training_modules m ON m.id = tc.module_id
  LEFT JOIN public.profiles p ON p.id = tc.user_id
  WHERE (_status IS NULL OR _status = 'all' OR tc.verification_status = _status)
  ORDER BY tc.completed_at DESC
  LIMIT 500;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_training_completion(
  _completion_id uuid,
  _approve boolean,
  _notes text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.training_completions;
  v_region text;
  v_total int;
  v_verified int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_admin_privilege() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.training_completions
     SET verification_status = CASE WHEN _approve THEN 'verified' ELSE 'rejected' END,
         verified_by = v_uid,
         verified_at = now(),
         review_notes = _notes
   WHERE id = _completion_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Training completion not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(preferred_country, 'US') INTO v_region FROM public.profiles WHERE id = v_row.user_id;

  SELECT count(*) INTO v_total
  FROM public.training_modules m
  WHERE COALESCE(m.is_active, true) AND (m.region = 'all' OR m.region = v_region);

  SELECT count(*) INTO v_verified
  FROM public.training_completions tc
  JOIN public.training_modules m ON m.id = tc.module_id
  WHERE tc.user_id = v_row.user_id
    AND tc.verification_status = 'verified'
    AND COALESCE(m.is_active, true)
    AND (m.region = 'all' OR m.region = v_region);

  IF v_total > 0 AND v_verified >= v_total THEN
    INSERT INTO public.training_refresh_requirements (user_id, last_completed_at, next_due_at, status)
    VALUES (v_row.user_id, now(), now() + interval '180 days', 'completed')
    ON CONFLICT (user_id) DO UPDATE
      SET last_completed_at = EXCLUDED.last_completed_at,
          next_due_at = EXCLUDED.next_due_at,
          status = 'completed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_row.user_id,
    'status', v_row.verification_status,
    'verified', v_verified,
    'total', v_total,
    'training_complete', v_total > 0 AND v_verified >= v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_training_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_pending_training_completions(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_training_completion(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_training_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_training_completions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_training_completion(uuid, boolean, text) TO authenticated;