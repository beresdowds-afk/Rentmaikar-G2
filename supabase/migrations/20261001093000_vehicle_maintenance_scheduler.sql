-- ============================================================================
-- Migration: 20261001093000_vehicle_maintenance_scheduler.sql
-- Tier 2 Feature 29: Maintenance & Service Scheduler
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_type text NOT NULL, -- e.g. 'oil_change', 'brake_pads', 'tire_rotation', 'inspection'
  interval_miles integer,
  interval_days integer,
  last_service_mileage numeric,
  last_service_at timestamptz,
  next_due_mileage numeric,
  next_due_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','due','overdue','completed','cancelled')),
  vendor_name text,
  estimated_cost numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.vehicle_maintenance_schedules(id) ON DELETE SET NULL,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  mileage numeric,
  serviced_at timestamptz NOT NULL DEFAULT now(),
  vendor_name text,
  cost numeric,
  notes text,
  evidence_document_id uuid REFERENCES public.user_documents(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vms_vehicle_status
  ON public.vehicle_maintenance_schedules(vehicle_id, status);

CREATE INDEX IF NOT EXISTS idx_vmr_vehicle_date
  ON public.vehicle_maintenance_records(vehicle_id, serviced_at DESC);

ALTER TABLE public.vehicle_maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_maintenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view maintenance schedules for their vehicles" ON public.vehicle_maintenance_schedules;
CREATE POLICY "Owners can view maintenance schedules for their vehicles"
  ON public.vehicle_maintenance_schedules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND (v.owner_id = auth.uid() OR v.user_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant', 'vehicle_support')
    )
  );

DROP POLICY IF EXISTS "Owners can view maintenance records for their vehicles" ON public.vehicle_maintenance_records;
CREATE POLICY "Owners can view maintenance records for their vehicles"
  ON public.vehicle_maintenance_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND (v.owner_id = auth.uid() OR v.user_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant', 'vehicle_support')
    )
  );

DROP POLICY IF EXISTS "Admins and vehicle owners can insert maintenance records" ON public.vehicle_maintenance_records;
CREATE POLICY "Admins and vehicle owners can insert maintenance records"
  ON public.vehicle_maintenance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND (v.owner_id = auth.uid() OR v.user_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant', 'vehicle_support')
    )
  );

DROP POLICY IF EXISTS "Admins and vehicle owners can manage maintenance schedules" ON public.vehicle_maintenance_schedules;
CREATE POLICY "Admins and vehicle owners can manage maintenance schedules"
  ON public.vehicle_maintenance_schedules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND (v.owner_id = auth.uid() OR v.user_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant', 'vehicle_support')
    )
  );

-- Trigger to automatically update schedule when a service record is added
CREATE OR REPLACE FUNCTION public.sync_maintenance_schedule_on_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.schedule_id IS NOT NULL THEN
    UPDATE public.vehicle_maintenance_schedules
    SET
      last_service_mileage = NEW.mileage,
      last_service_at = NEW.serviced_at,
      next_due_mileage = CASE
        WHEN interval_miles IS NOT NULL AND NEW.mileage IS NOT NULL
        THEN NEW.mileage + interval_miles
        ELSE next_due_mileage
      END,
      next_due_at = CASE
        WHEN interval_days IS NOT NULL
        THEN NEW.serviced_at + (interval_days || ' days')::interval
        ELSE next_due_at
      END,
      status = 'scheduled',
      updated_at = now()
    WHERE id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_maintenance_schedule_on_record ON public.vehicle_maintenance_records;
CREATE TRIGGER trg_sync_maintenance_schedule_on_record
  AFTER INSERT ON public.vehicle_maintenance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_maintenance_schedule_on_record();
