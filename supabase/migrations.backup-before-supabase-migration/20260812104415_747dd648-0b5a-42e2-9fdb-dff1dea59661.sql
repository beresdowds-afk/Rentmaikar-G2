ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_review_status_check'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_review_status_check
      CHECK (review_status IN ('pending','published','rejected'));
  END IF;
END $$;

UPDATE public.vehicles
SET review_status = 'published',
    published_at = COALESCE(published_at, updated_at, created_at),
    reviewed_at = COALESCE(reviewed_at, updated_at, created_at)
WHERE is_public IS TRUE AND review_status = 'pending';

UPDATE public.vehicles
SET submitted_at = COALESCE(created_at, now())
WHERE submitted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_review_status ON public.vehicles(review_status, submitted_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_vehicle_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_public IS DISTINCT FROM OLD.is_public
     OR NEW.review_status IS DISTINCT FROM OLD.review_status
     OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'Only administrators can change vehicle ownership, status, visibility or review outcome';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_vehicle(
  _vehicle_id uuid,
  _decision text,
  _reason text DEFAULT NULL
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF _decision NOT IN ('published','rejected','pending') THEN
    RAISE EXCEPTION 'Invalid decision: %', _decision;
  END IF;

  IF _decision = 'rejected' AND COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required';
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
                 WHEN _decision = 'rejected' THEN 'pending'
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