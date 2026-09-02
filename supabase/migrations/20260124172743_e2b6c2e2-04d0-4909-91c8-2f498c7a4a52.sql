-- Create storage bucket for call recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false);

-- RLS policies for call recordings bucket
CREATE POLICY "Admins can manage all recordings"
ON storage.objects
FOR ALL
USING (bucket_id = 'call-recordings' AND public.is_admin());

CREATE POLICY "Admins can upload recordings"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'call-recordings' AND public.is_admin());

-- Add columns to voip_calls for recording metadata
ALTER TABLE public.voip_calls
ADD COLUMN IF NOT EXISTS recording_status TEXT DEFAULT 'none' CHECK (recording_status IN ('none', 'recording', 'processing', 'ready', 'failed')),
ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS recording_size_bytes BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS recording_stored_at TIMESTAMP WITH TIME ZONE;