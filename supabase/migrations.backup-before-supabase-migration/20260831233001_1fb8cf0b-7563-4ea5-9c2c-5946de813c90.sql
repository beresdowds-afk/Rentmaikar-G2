
CREATE TABLE IF NOT EXISTS public.vehicle_mileage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  driver_id uuid,
  owner_id uuid,
  log_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  miles numeric NOT NULL DEFAULT 0,
  odometer_start numeric,
  odometer_end numeric,
  source text NOT NULL DEFAULT 'telemetry',
  region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, driver_id, log_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_mileage_logs TO authenticated;
GRANT ALL ON public.vehicle_mileage_logs TO service_role;

ALTER TABLE public.vehicle_mileage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage vehicle mileage"
ON public.vehicle_mileage_logs FOR ALL TO authenticated
USING (public.is_admin() OR public.has_role(auth.uid(), 'iot_support'::app_role))
WITH CHECK (public.is_admin() OR public.has_role(auth.uid(), 'iot_support'::app_role));

CREATE POLICY "Owners view mileage for their vehicles"
ON public.vehicle_mileage_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_mileage_logs.vehicle_id AND v.owner_id = auth.uid()));

CREATE POLICY "Drivers view their own mileage"
ON public.vehicle_mileage_logs FOR SELECT TO authenticated
USING (driver_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_logs_vehicle_date ON public.vehicle_mileage_logs (vehicle_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_logs_driver_date ON public.vehicle_mileage_logs (driver_id, log_date DESC);

CREATE TRIGGER update_vehicle_mileage_logs_updated_at
BEFORE UPDATE ON public.vehicle_mileage_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Monthly rollup view (inherits RLS from base table)
CREATE OR REPLACE VIEW public.vehicle_mileage_monthly
WITH (security_invoker = true) AS
SELECT
  vehicle_id,
  driver_id,
  date_trunc('month', log_date)::date AS month,
  sum(miles) AS miles,
  count(*) AS days_logged,
  max(log_date) AS last_log_date
FROM public.vehicle_mileage_logs
GROUP BY vehicle_id, driver_id, date_trunc('month', log_date)::date;

GRANT SELECT ON public.vehicle_mileage_monthly TO authenticated, service_role;

-- Editable geofences
ALTER TABLE public.vehicle_geofences
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DROP POLICY IF EXISTS "Admins manage vehicle geofences" ON public.vehicle_geofences;
CREATE POLICY "Admins manage vehicle geofences"
ON public.vehicle_geofences FOR ALL TO authenticated
USING (public.is_admin() OR public.has_role(auth.uid(), 'iot_support'::app_role))
WITH CHECK (public.is_admin() OR public.has_role(auth.uid(), 'iot_support'::app_role));

DROP POLICY IF EXISTS "Owners manage geofences on their vehicles" ON public.vehicle_geofences;
CREATE POLICY "Owners manage geofences on their vehicles"
ON public.vehicle_geofences FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_geofences.vehicle_id AND v.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_geofences.vehicle_id AND v.owner_id = auth.uid()));

-- Record mileage from a telemetry snapshot / manual entry
CREATE OR REPLACE FUNCTION public.record_vehicle_mileage(
  _vehicle_id uuid,
  _driver_id uuid,
  _miles numeric,
  _log_date date DEFAULT (now() AT TIME ZONE 'utc')::date,
  _source text DEFAULT 'telemetry'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _owner uuid;
BEGIN
  IF NOT (public.is_admin() OR public.has_role(auth.uid(), 'iot_support'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to record mileage';
  END IF;

  SELECT owner_id INTO _owner FROM public.vehicles WHERE id = _vehicle_id;

  INSERT INTO public.vehicle_mileage_logs (vehicle_id, driver_id, owner_id, log_date, miles, source)
  VALUES (_vehicle_id, _driver_id, _owner, _log_date, COALESCE(_miles, 0), COALESCE(_source, 'telemetry'))
  ON CONFLICT (vehicle_id, driver_id, log_date)
  DO UPDATE SET miles = public.vehicle_mileage_logs.miles + EXCLUDED.miles,
                source = EXCLUDED.source,
                updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_vehicle_mileage(uuid, uuid, numeric, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_vehicle_mileage(uuid, uuid, numeric, date, text) TO authenticated, service_role;
