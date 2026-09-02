-- Add region and frequency support to inspection reports
ALTER TABLE public.weekly_inspection_reports 
ADD COLUMN IF NOT EXISTS region text DEFAULT 'nigeria',
ADD COLUMN IF NOT EXISTS report_type text DEFAULT 'vehicle_inspection',
ADD COLUMN IF NOT EXISTS report_frequency text DEFAULT 'weekly';

-- Add rideshare profile photo column for weekly requirement
ALTER TABLE public.weekly_inspection_reports 
ADD COLUMN IF NOT EXISTS photo_rideshare_profile text;

-- Create table for rideshare profile submissions (weekly requirement for all)
CREATE TABLE IF NOT EXISTS public.rideshare_profile_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL,
  vehicle_id uuid,
  week_start_date date NOT NULL,
  profile_photo_url text,
  rating_screenshot_url text,
  platform text,
  current_rating numeric(3,2),
  submitted_at timestamp with time zone,
  status text DEFAULT 'pending',
  admin_reviewed_at timestamp with time zone,
  admin_reviewed_by uuid,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(driver_id, week_start_date)
);

-- Enable RLS
ALTER TABLE public.rideshare_profile_submissions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Drivers can view their own profile submissions" 
ON public.rideshare_profile_submissions 
FOR SELECT 
USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can create their own profile submissions" 
ON public.rideshare_profile_submissions 
FOR INSERT 
WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update their own pending submissions" 
ON public.rideshare_profile_submissions 
FOR UPDATE 
USING (auth.uid() = driver_id AND status = 'pending');

CREATE POLICY "Admins can view all profile submissions"
ON public.rideshare_profile_submissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Admins can update all profile submissions"
ON public.rideshare_profile_submissions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_rideshare_profile_submissions_updated_at
BEFORE UPDATE ON public.rideshare_profile_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();