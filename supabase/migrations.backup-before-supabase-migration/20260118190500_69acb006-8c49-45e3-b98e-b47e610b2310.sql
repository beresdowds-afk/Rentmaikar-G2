-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create enum for incident types
CREATE TYPE public.incident_type AS ENUM ('accident', 'maintenance', 'breakdown', 'theft', 'other');

-- Create enum for incident status
CREATE TYPE public.incident_status AS ENUM ('reported', 'acknowledged', 'in_progress', 'resolved', 'closed');

-- Create enum for severity level
CREATE TYPE public.incident_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- Create vehicle_incidents table for accident and maintenance reporting
CREATE TABLE public.vehicle_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  owner_id UUID,
  incident_type incident_type NOT NULL,
  severity incident_severity NOT NULL DEFAULT 'medium',
  status incident_status NOT NULL DEFAULT 'reported',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_lat NUMERIC,
  location_lng NUMERIC,
  location_address TEXT,
  is_iot_detected BOOLEAN NOT NULL DEFAULT FALSE,
  iot_data JSONB,
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  resolution_notes TEXT,
  photos TEXT[],
  estimated_downtime_hours INTEGER,
  actual_downtime_hours INTEGER,
  is_late_report BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_late_report CHECK (
    is_late_report = (EXTRACT(EPOCH FROM (reported_at - occurred_at)) / 3600 > 1)
  )
);

-- Enable RLS
ALTER TABLE public.vehicle_incidents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Drivers can view their own incidents"
ON public.vehicle_incidents
FOR SELECT
USING (driver_id = auth.uid());

CREATE POLICY "Drivers can create incidents"
ON public.vehicle_incidents
FOR INSERT
WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Drivers can update their pending incidents"
ON public.vehicle_incidents
FOR UPDATE
USING (driver_id = auth.uid() AND status = 'reported');

CREATE POLICY "Owners can view incidents for their vehicles"
ON public.vehicle_incidents
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Admins can manage all incidents"
ON public.vehicle_incidents
FOR ALL
USING (is_admin());

-- Create indexes
CREATE INDEX idx_vehicle_incidents_driver_id ON public.vehicle_incidents(driver_id);
CREATE INDEX idx_vehicle_incidents_owner_id ON public.vehicle_incidents(owner_id);
CREATE INDEX idx_vehicle_incidents_vehicle_id ON public.vehicle_incidents(vehicle_id);
CREATE INDEX idx_vehicle_incidents_status ON public.vehicle_incidents(status);
CREATE INDEX idx_vehicle_incidents_type ON public.vehicle_incidents(incident_type);
CREATE INDEX idx_vehicle_incidents_occurred_at ON public.vehicle_incidents(occurred_at);

-- Create trigger to update updated_at
CREATE TRIGGER update_vehicle_incidents_updated_at
BEFORE UPDATE ON public.vehicle_incidents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to check for late reports
CREATE OR REPLACE FUNCTION public.check_late_incident_report()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if report is more than 1 hour after occurrence
  IF EXTRACT(EPOCH FROM (NEW.reported_at - NEW.occurred_at)) / 3600 > 1 THEN
    NEW.is_late_report := TRUE;
  ELSE
    NEW.is_late_report := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for late report check
CREATE TRIGGER check_late_report_trigger
BEFORE INSERT ON public.vehicle_incidents
FOR EACH ROW
EXECUTE FUNCTION public.check_late_incident_report();