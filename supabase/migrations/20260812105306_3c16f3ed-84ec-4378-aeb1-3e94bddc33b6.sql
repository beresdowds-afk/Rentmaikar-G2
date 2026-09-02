ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_review_status_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_review_status_check
  CHECK (review_status = ANY (ARRAY['pending'::text, 'published'::text, 'rejected'::text, 'needs_info'::text]));

CREATE OR REPLACE FUNCTION public.admin_review_vehicle(_vehicle_id uuid, _decision text, _reason text DEFAULT NULL)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row public.vehicles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (public.is_admin() OR public.has_admin_privilege(auth.uid(), 'can_manage_vehicles')) THEN
    RAISE EXCEPTION 'Not authorised to review vehicle submissions';
  END IF;

  IF _decision NOT IN ('published','rejected','pending','needs_info') THEN
    RAISE EXCEPTION 'Invalid decision: %', _decision;
  END IF;

  IF _decision IN ('rejected','needs_info') AND COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A message to the owner is required';
  END IF;

  UPDATE public.vehicles
  SET review_status = _decision,
      review_notes = NULLIF(btrim(COALESCE(_reason, '')), ''),
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      published_at = CASE WHEN _decision = 'published' THEN now() ELSE NULL END,
      is_public = (_decision = 'published'),
      status = CASE
                 WHEN _decision = 'published' AND status = 'pending' THEN 'available'
                 WHEN _decision IN ('rejected','needs_info') THEN 'pending'
                 ELSE status
               END,
      updated_at = now()
  WHERE id = _vehicle_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_review_vehicle(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_vehicle(uuid, text, text) TO authenticated;