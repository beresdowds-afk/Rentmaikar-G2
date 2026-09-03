CREATE OR REPLACE FUNCTION public.admin_list_pending_training_completions(_status text DEFAULT 'pending'::text)
 RETURNS TABLE(id uuid, user_id uuid, full_name text, email text, phone text, module_id uuid, module_title text, module_region text, score integer, completed_at timestamp with time zone, verification_status text, verified_at timestamp with time zone, review_notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_privilege(auth.uid(), 'can_manage_content') THEN
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

CREATE OR REPLACE FUNCTION public.admin_review_training_completion(_completion_id uuid, _approve boolean, _notes text DEFAULT NULL::text)
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
  IF v_uid IS NULL OR NOT public.has_admin_privilege(v_uid, 'can_manage_content') THEN
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

REVOKE EXECUTE ON FUNCTION public.admin_list_pending_training_completions(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_training_completion(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_training_completions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_training_completion(uuid, boolean, text) TO authenticated;