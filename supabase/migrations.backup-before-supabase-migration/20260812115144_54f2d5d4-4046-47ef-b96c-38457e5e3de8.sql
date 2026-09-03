CREATE OR REPLACE FUNCTION public.owner_resubmit_vehicle_for_review(p_vehicle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.vehicles%ROWTYPE;
  v_photos int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v FROM public.vehicles WHERE id = p_vehicle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  IF v.owner_id <> auth.uid()
     AND NOT (public.is_admin(auth.uid()) OR public.has_admin_privilege(auth.uid(), 'can_manage_vehicles')) THEN
    RAISE EXCEPTION 'You can only re-submit your own vehicles';
  END IF;

  SELECT count(*) INTO v_photos
  FROM unnest(COALESCE(v.photo_urls, ARRAY[]::text[])) AS u
  WHERE btrim(COALESCE(u, '')) <> '';

  IF v_photos = 0 THEN
    RAISE EXCEPTION 'Upload at least one vehicle photo before requesting verification';
  END IF;

  IF v.review_status = 'pending' THEN
    RAISE EXCEPTION 'This vehicle is already awaiting admin verification';
  END IF;

  UPDATE public.vehicles
  SET review_status = 'pending',
      review_notes = NULL,
      reviewed_at = NULL,
      reviewed_by = NULL,
      is_public = false,
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object('vehicle_id', p_vehicle_id, 'review_status', 'pending', 'photos', v_photos);
END;
$$;

REVOKE ALL ON FUNCTION public.owner_resubmit_vehicle_for_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_resubmit_vehicle_for_review(uuid) TO authenticated, service_role;