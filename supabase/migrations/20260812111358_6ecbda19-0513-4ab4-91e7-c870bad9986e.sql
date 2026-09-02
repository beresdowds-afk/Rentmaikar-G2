-- 1. Vehicles: defense-in-depth WITH CHECK on owner UPDATE policy
CREATE OR REPLACE FUNCTION public.vehicle_publish_fields_unchanged(
  _id uuid, _is_public boolean, _status text, _review_status text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = _id
      AND v.is_public IS NOT DISTINCT FROM _is_public
      AND v.status IS NOT DISTINCT FROM _status
      AND v.review_status IS NOT DISTINCT FROM _review_status
  )
$$;

REVOKE ALL ON FUNCTION public.vehicle_publish_fields_unchanged(uuid, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vehicle_publish_fields_unchanged(uuid, boolean, text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Owners can update their own vehicles" ON public.vehicles;
CREATE POLICY "Owners can update their own vehicles"
ON public.vehicles
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (
  owner_id = auth.uid()
  AND public.vehicle_publish_fields_unchanged(id, is_public, status, review_status)
);

-- 2. Rent-to-own listings: owners cannot self-publish
DROP POLICY IF EXISTS "Owners can update pending listings" ON public.rent_to_own_listings;
CREATE POLICY "Owners can update pending listings"
ON public.rent_to_own_listings
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  AND status = ANY (ARRAY['pending'::text, 'counter_offer'::text])
)
WITH CHECK (
  owner_id = auth.uid()
  AND status = ANY (ARRAY['pending'::text, 'counter_offer'::text])
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND COALESCE(is_available, false) = false
);

CREATE OR REPLACE FUNCTION public.enforce_rto_listing_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.is_available IS DISTINCT FROM OLD.is_available
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Only administrators can approve or publish rent-to-own listings';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_rto_listing_column_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_rto_listing_column_scope ON public.rent_to_own_listings;
CREATE TRIGGER trg_enforce_rto_listing_column_scope
BEFORE UPDATE ON public.rent_to_own_listings
FOR EACH ROW EXECUTE FUNCTION public.enforce_rto_listing_column_scope();