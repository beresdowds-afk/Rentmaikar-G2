-- Owners may submit their own vehicles (always pending + non-public)
CREATE POLICY "Owners can add their own vehicles"
ON public.vehicles
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND public.has_role(auth.uid(), 'owner')
  AND coalesce(status, 'pending') = 'pending'
  AND is_public = false
);

-- Owners may edit their own vehicles; privileged columns are locked by trigger
CREATE POLICY "Owners can update their own vehicles"
ON public.vehicles
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_vehicle_column_scope()
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
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_public IS DISTINCT FROM OLD.is_public THEN
    RAISE EXCEPTION 'Only administrators can change vehicle ownership, status or public visibility';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vehicle_column_scope() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_enforce_vehicle_column_scope ON public.vehicles;
CREATE TRIGGER trg_enforce_vehicle_column_scope
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_column_scope();

-- Realtime streaming for live dashboard/catalogue sync
ALTER TABLE public.vehicles REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'vehicles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.vehicles TO authenticated;
GRANT SELECT ON public.vehicles TO anon;
GRANT ALL ON public.vehicles TO service_role;