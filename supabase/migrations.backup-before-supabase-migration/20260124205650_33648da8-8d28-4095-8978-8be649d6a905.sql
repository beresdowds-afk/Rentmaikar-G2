-- Create enum for application type
CREATE TYPE public.application_type AS ENUM ('driver', 'owner');

-- Create enum for application status
CREATE TYPE public.application_status AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'needs_info');

-- Create applications table
CREATE TABLE public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_type public.application_type NOT NULL,
  status public.application_status NOT NULL DEFAULT 'pending',
  
  -- Applicant info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_country TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  
  -- Location
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'usa',
  
  -- Driver-specific fields
  rideshare_platforms TEXT[] DEFAULT '{}',
  has_driver_license BOOLEAN DEFAULT FALSE,
  
  -- Owner-specific fields (vehicle info)
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  vehicle_color TEXT,
  vehicle_plate TEXT,
  desired_weekly_price NUMERIC,
  vehicle_description TEXT,
  has_registration BOOLEAN DEFAULT FALSE,
  has_insurance BOOLEAN DEFAULT FALSE,
  
  -- Policy acceptances
  agreed_terms BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_privacy BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_iot BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_fees BOOLEAN DEFAULT FALSE,
  
  -- Review workflow
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  rejection_reason TEXT,
  
  -- Task assignment
  assigned_to UUID,
  assigned_at TIMESTAMP WITH TIME ZONE,
  assigned_by UUID,
  
  -- User linking (after approval)
  user_id UUID,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage applications"
ON public.applications
FOR ALL
TO authenticated
USING (public.is_admin());

-- Support staff can view and update applications
CREATE POLICY "Support staff can view applications"
ON public.applications
FOR SELECT
TO authenticated
USING (public.is_any_support_staff(auth.uid()));

CREATE POLICY "Support staff can update applications"
ON public.applications
FOR UPDATE
TO authenticated
USING (public.is_any_support_staff(auth.uid()));

-- Public can insert (for registration forms)
CREATE POLICY "Anyone can submit applications"
ON public.applications
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- Users can view their own applications
CREATE POLICY "Users can view own applications"
ON public.applications
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_applications_updated_at
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for common queries
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_applications_type ON public.applications(application_type);
CREATE INDEX idx_applications_region ON public.applications(region);
CREATE INDEX idx_applications_created_at ON public.applications(created_at DESC);