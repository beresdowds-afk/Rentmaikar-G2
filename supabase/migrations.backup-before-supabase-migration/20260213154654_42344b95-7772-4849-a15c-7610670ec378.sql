
-- Add caller_role, receiver_id, and receiver_role to voip_calls for role-based call tracking
ALTER TABLE public.voip_calls
  ADD COLUMN IF NOT EXISTS caller_role text,
  ADD COLUMN IF NOT EXISTS receiver_id uuid,
  ADD COLUMN IF NOT EXISTS receiver_role text;

-- Create a call_permissions table to define which roles can call which
CREATE TABLE IF NOT EXISTS public.voice_call_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_role text NOT NULL,
  receiver_role text NOT NULL,
  requires_rental_link boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(caller_role, receiver_role)
);

ALTER TABLE public.voice_call_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage call permissions"
  ON public.voice_call_permissions FOR ALL
  USING (is_admin());

CREATE POLICY "Authenticated users can view active permissions"
  ON public.voice_call_permissions FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

-- Seed default call permissions
INSERT INTO public.voice_call_permissions (caller_role, receiver_role, requires_rental_link, description) VALUES
  ('driver', 'admin', false, 'Drivers can call Support/Admin'),
  ('owner', 'driver', true, 'Owners can call assigned Drivers only'),
  ('admin', 'driver', false, 'Admin can call any Driver'),
  ('admin', 'owner', false, 'Admin can call any Owner'),
  ('admin', 'admin', false, 'Admin can call other Admins'),
  ('legal_support', 'driver', false, 'Legal support can call Drivers'),
  ('legal_support', 'owner', false, 'Legal support can call Owners'),
  ('iot_support', 'driver', false, 'IoT support can call Drivers'),
  ('iot_support', 'owner', false, 'IoT support can call Owners'),
  ('vehicle_support', 'driver', false, 'Vehicle support can call Drivers'),
  ('vehicle_support', 'owner', false, 'Vehicle support can call Owners')
ON CONFLICT DO NOTHING;

-- Create a call_request_queue for callback requests & incoming call routing
CREATE TABLE IF NOT EXISTS public.voice_call_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  requester_role text NOT NULL,
  target_role text NOT NULL,
  target_id uuid,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  assigned_to uuid,
  call_id uuid REFERENCES public.voip_calls(id),
  region text NOT NULL DEFAULT 'USA',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.voice_call_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all call requests"
  ON public.voice_call_requests FOR ALL
  USING (is_admin());

CREATE POLICY "Support staff can view call requests"
  ON public.voice_call_requests FOR SELECT
  USING (is_any_support_staff(auth.uid()));

CREATE POLICY "Support staff can update assigned requests"
  ON public.voice_call_requests FOR UPDATE
  USING (assigned_to = auth.uid() OR is_any_support_staff(auth.uid()));

CREATE POLICY "Users can create call requests"
  ON public.voice_call_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can view their own call requests"
  ON public.voice_call_requests FOR SELECT
  USING (requester_id = auth.uid());

-- Add realtime for call requests (for support dashboard incoming alerts)
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_call_requests;

-- Add trigger for updated_at
CREATE TRIGGER update_voice_call_permissions_updated_at
  BEFORE UPDATE ON public.voice_call_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_voice_call_requests_updated_at
  BEFORE UPDATE ON public.voice_call_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
