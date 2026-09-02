
-- Reviewer action: override, reject, or acknowledge a Persona inquiry outcome.
CREATE OR REPLACE FUNCTION public.admin_review_persona_inquiry(
  _inquiry_row_id uuid,
  _action text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewer uuid := auth.uid();
  row_rec RECORD;
  prev_status text;
  new_status text;
  is_reviewer boolean;
BEGIN
  IF reviewer IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  is_reviewer :=
    public.has_role(reviewer, 'admin')
    OR public.has_admin_assistant_permission(reviewer, 'can_review_persona');
  IF NOT is_reviewer THEN
    RAISE EXCEPTION 'not authorized to review persona inquiries' USING ERRCODE = '42501';
  END IF;

  IF _action NOT IN ('approve', 'reject', 'acknowledge') THEN
    RAISE EXCEPTION 'invalid action: %', _action USING ERRCODE = '22023';
  END IF;

  SELECT * INTO row_rec FROM public.persona_inquiries WHERE id = _inquiry_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inquiry not found' USING ERRCODE = 'P0002';
  END IF;

  prev_status := row_rec.status;
  new_status := CASE _action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'declined'
    ELSE row_rec.status
  END;

  IF _action IN ('approve', 'reject') THEN
    UPDATE public.persona_inquiries
       SET status = new_status,
           verified_at = CASE WHEN _action = 'approve' THEN now() ELSE NULL END,
           updated_at = now(),
           mismatch_fields = COALESCE(row_rec.mismatch_fields, '{}'::jsonb)
             || jsonb_build_object(
                  '_admin_review',
                  jsonb_build_object(
                    'reviewer', reviewer,
                    'action', _action,
                    'prev_status', prev_status,
                    'notes', _notes,
                    'reviewed_at', now()
                  )
                )
     WHERE id = _inquiry_row_id;

    IF row_rec.subject_type = 'self' THEN
      UPDATE public.profiles
         SET identity_verification_status = new_status,
             identity_verified_at = CASE WHEN _action = 'approve' THEN now() ELSE NULL END,
             identity_verified_inquiry_id = CASE WHEN _action = 'approve' THEN row_rec.inquiry_id ELSE NULL END
       WHERE user_id = row_rec.user_id;
    END IF;
  END IF;

  INSERT INTO public.admin_audit_log(admin_id, action, target_table, target_id, details)
  VALUES (
    reviewer,
    'persona_review_' || _action,
    'persona_inquiries',
    _inquiry_row_id::text,
    jsonb_build_object(
      'target_user_id', row_rec.user_id,
      'inquiry_id', row_rec.inquiry_id,
      'subject_type', row_rec.subject_type,
      'region', row_rec.region,
      'prev_status', prev_status,
      'new_status', new_status,
      'notes', _notes
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', _action,
    'prev_status', prev_status,
    'new_status', new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_persona_inquiry(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_persona_inquiry(uuid, text, text) TO authenticated;

-- Search users by name/email/id with their latest Persona status.
CREATE OR REPLACE FUNCTION public.admin_search_persona_users(
  _query text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit int DEFAULT 50
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  identity_verification_status text,
  identity_verified_at timestamptz,
  latest_inquiry_row_id uuid,
  latest_inquiry_id text,
  latest_inquiry_status text,
  latest_inquiry_updated_at timestamptz,
  latest_region text,
  latest_mismatch_fields jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_reviewer boolean;
  q text := NULLIF(trim(_query), '');
  like_needle text;
BEGIN
  is_reviewer :=
    public.has_role(auth.uid(), 'admin')
    OR public.has_admin_assistant_permission(auth.uid(), 'can_review_persona');
  IF NOT is_reviewer THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  like_needle := CASE WHEN q IS NULL THEN NULL ELSE '%' || lower(q) || '%' END;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (pi.user_id)
      pi.user_id, pi.id AS row_id, pi.inquiry_id, pi.status, pi.updated_at,
      pi.region, pi.mismatch_fields
    FROM public.persona_inquiries pi
    WHERE pi.subject_type = 'self'
    ORDER BY pi.user_id, pi.updated_at DESC
  )
  SELECT
    p.user_id,
    p.full_name,
    p.email,
    p.identity_verification_status,
    p.identity_verified_at,
    l.row_id,
    l.inquiry_id,
    l.status,
    l.updated_at,
    l.region,
    l.mismatch_fields
  FROM public.profiles p
  LEFT JOIN latest l ON l.user_id = p.user_id
  WHERE
    (like_needle IS NULL
      OR lower(coalesce(p.full_name, '')) LIKE like_needle
      OR lower(coalesce(p.email, '')) LIKE like_needle
      OR p.user_id::text = q
      OR l.inquiry_id = q)
    AND (_status IS NULL OR _status = 'all'
         OR coalesce(p.identity_verification_status, 'unstarted') = _status
         OR l.status = _status)
  ORDER BY coalesce(l.updated_at, p.updated_at) DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(_limit, 50), 200));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_persona_users(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_persona_users(text, text, int) TO authenticated;
