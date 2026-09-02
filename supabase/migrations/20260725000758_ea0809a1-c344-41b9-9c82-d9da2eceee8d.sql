
-- Realtime for persona_inquiries + profiles (idempotent)
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.persona_inquiries;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.persona_inquiries REPLICA IDENTITY FULL;

-- RPC: current identity status + recent self inquiry timeline
CREATE OR REPLACE FUNCTION public.get_my_identity_verification()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prof RECORD;
  latest RECORD;
  timeline jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT identity_verification_status, identity_verified_at, identity_verified_inquiry_id
    INTO prof
  FROM public.profiles
  WHERE user_id = uid;

  SELECT id, inquiry_id, status, mismatch_fields, created_at, updated_at, verified_at, region, template_id
    INTO latest
  FROM public.persona_inquiries
  WHERE user_id = uid AND subject_type = 'self'
  ORDER BY updated_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO timeline
  FROM (
    SELECT inquiry_id, status, mismatch_fields, created_at, updated_at, verified_at
    FROM public.persona_inquiries
    WHERE user_id = uid AND subject_type = 'self'
    ORDER BY updated_at DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'authenticated', true,
    'profile_status', prof.identity_verification_status,
    'profile_verified_at', prof.identity_verified_at,
    'profile_inquiry_id', prof.identity_verified_inquiry_id,
    'latest_inquiry', CASE WHEN latest.id IS NULL THEN NULL ELSE to_jsonb(latest) END,
    'timeline', timeline,
    'is_verified', COALESCE(prof.identity_verification_status = 'approved', false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_identity_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_identity_verification() TO authenticated;
