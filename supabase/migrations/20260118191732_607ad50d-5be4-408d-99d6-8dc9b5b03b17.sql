-- Create storage bucket for incident photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-photos', 'incident-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for incident photos bucket
CREATE POLICY "Drivers can upload incident photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'incident-photos' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Anyone can view incident photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'incident-photos');

CREATE POLICY "Drivers can delete their own photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'incident-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add IoT detection fields to vehicle_incidents table
ALTER TABLE public.vehicle_incidents
ADD COLUMN IF NOT EXISTS iot_trigger_type TEXT,
ADD COLUMN IF NOT EXISTS iot_deceleration_g NUMERIC,
ADD COLUMN IF NOT EXISTS iot_impact_severity TEXT,
ADD COLUMN IF NOT EXISTS iot_speed_at_impact NUMERIC,
ADD COLUMN IF NOT EXISTS iot_triggered_at TIMESTAMP WITH TIME ZONE;