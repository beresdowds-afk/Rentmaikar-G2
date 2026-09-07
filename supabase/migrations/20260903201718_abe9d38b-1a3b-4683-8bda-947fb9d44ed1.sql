CREATE TABLE IF NOT EXISTS public.admin_assistant_vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assistant_id, vehicle_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_assistant_vehicle_assignments TO authenticated;
GRANT ALL ON public.admin_assistant_vehicle_assignments TO service_role;

ALTER TABLE public.admin_assistant_vehicle_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage assistant vehicle assignments" ON public.admin_assistant_vehicle_assignments;
CREATE POLICY "Admins manage assistant vehicle assignments"
  ON public.admin_assistant_vehicle_assignments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Assistants view their own vehicle assignments" ON public.admin_assistant_vehicle_assignments;
CREATE POLICY "Assistants view their own vehicle assignments"
  ON public.admin_assistant_vehicle_assignments
  FOR SELECT TO authenticated
  USING (assistant_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_aava_assistant ON public.admin_assistant_vehicle_assignments (assistant_id);
CREATE INDEX IF NOT EXISTS idx_aava_vehicle ON public.admin_assistant_vehicle_assignments (vehicle_id);

DROP TRIGGER IF EXISTS update_aava_updated_at ON public.admin_assistant_vehicle_assignments;
CREATE TRIGGER update_aava_updated_at
  BEFORE UPDATE ON public.admin_assistant_vehicle_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.assistant_can_access_vehicle(_vehicle uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_assistant_vehicle_assignments
    WHERE assistant_id = auth.uid() AND vehicle_id = _vehicle
  )
$$;

REVOKE EXECUTE ON FUNCTION public.assistant_can_access_vehicle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_can_access_vehicle(uuid) TO authenticated, service_role;