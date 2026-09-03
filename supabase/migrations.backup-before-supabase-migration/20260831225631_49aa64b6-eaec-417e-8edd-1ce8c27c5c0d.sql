
CREATE TABLE public.iot_provisioning_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL UNIQUE REFERENCES public.vehicles(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.iot_devices(id) ON DELETE SET NULL,
  sim_id uuid REFERENCES public.iot_sim_cards(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'pending',
  test_status text NOT NULL DEFAULT 'not_tested',
  test_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  tested_at timestamptz,
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.iot_provisioning_state TO authenticated;
GRANT ALL ON public.iot_provisioning_state TO service_role;
ALTER TABLE public.iot_provisioning_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view provisioning state"
ON public.iot_provisioning_state FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'iot_support'));

CREATE TABLE public.iot_provisioning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sims_linked integer NOT NULL DEFAULT 0,
  devices_enabled integer NOT NULL DEFAULT 0,
  vehicles_linked integer NOT NULL DEFAULT 0,
  vehicles_tested integer NOT NULL DEFAULT 0,
  vehicles_ready integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.iot_provisioning_runs TO authenticated;
GRANT ALL ON public.iot_provisioning_runs TO service_role;
ALTER TABLE public.iot_provisioning_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view provisioning runs"
ON public.iot_provisioning_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'iot_support'));

CREATE TABLE public.iot_provisioning_control (
  id boolean PRIMARY KEY DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  batch_size integer NOT NULL DEFAULT 25,
  lease_owner uuid,
  lease_expires_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iot_provisioning_control_singleton CHECK (id)
);

GRANT SELECT, UPDATE ON public.iot_provisioning_control TO authenticated;
GRANT ALL ON public.iot_provisioning_control TO service_role;
ALTER TABLE public.iot_provisioning_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view provisioning control"
ON public.iot_provisioning_control FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'iot_support'));

CREATE POLICY "Admins can update provisioning control"
ON public.iot_provisioning_control FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.iot_provisioning_control (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE INDEX idx_iot_provisioning_state_stage ON public.iot_provisioning_state(stage);
CREATE INDEX idx_iot_provisioning_state_ready ON public.iot_provisioning_state(ready_at) WHERE ready_at IS NOT NULL;

CREATE TRIGGER update_iot_provisioning_state_updated_at
BEFORE UPDATE ON public.iot_provisioning_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_iot_provisioning_control_updated_at
BEFORE UPDATE ON public.iot_provisioning_control
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
