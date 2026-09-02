-- Create vehicle_recalls table for IoT failure tracking and recall management
CREATE TABLE public.vehicle_recalls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID,
  owner_id UUID,
  recall_reason TEXT NOT NULL,
  recall_type TEXT NOT NULL DEFAULT 'iot_failure', -- 'iot_failure', 'safety', 'maintenance', 'manual'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'acknowledged', 'in_progress', 'resolved', 'cancelled'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  
  -- IoT failure details
  iot_failure_type TEXT, -- 'telemetry_timeout', 'connection_lost', 'data_corruption', 'sensor_malfunction'
  last_known_location_lat NUMERIC,
  last_known_location_lng NUMERIC,
  last_known_location_address TEXT,
  last_successful_ping TIMESTAMP WITH TIME ZONE,
  failed_capture_attempts INTEGER DEFAULT 0,
  
  -- Telemetry at time of failure (if available)
  last_telemetry_snapshot JSONB,
  
  -- Admin handling
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  resolution_notes TEXT,
  
  -- Driver/owner notification tracking
  driver_notified_at TIMESTAMP WITH TIME ZONE,
  owner_notified_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vehicle_recalls ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all recalls"
  ON public.vehicle_recalls
  FOR ALL
  USING (is_admin());

CREATE POLICY "Owners can view recalls for their vehicles"
  ON public.vehicle_recalls
  FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Drivers can view their vehicle recalls"
  ON public.vehicle_recalls
  FOR SELECT
  USING (driver_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_vehicle_recalls_updated_at
  BEFORE UPDATE ON public.vehicle_recalls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_vehicle_recalls_status ON public.vehicle_recalls(status);
CREATE INDEX idx_vehicle_recalls_vehicle_id ON public.vehicle_recalls(vehicle_id);
CREATE INDEX idx_vehicle_recalls_created_at ON public.vehicle_recalls(created_at DESC);