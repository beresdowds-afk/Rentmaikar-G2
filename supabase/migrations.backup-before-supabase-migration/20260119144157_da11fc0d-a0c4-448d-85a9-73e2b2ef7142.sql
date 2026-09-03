-- Create weekly inspection reports table
CREATE TABLE public.weekly_inspection_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  owner_id UUID,
  week_start_date DATE NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  
  -- 10 Required Photo URLs
  photo_front_view TEXT,
  photo_back_view TEXT,
  photo_driver_side TEXT,
  photo_passenger_side TEXT,
  photo_front_right_tyre TEXT,
  photo_front_left_tyre TEXT,
  photo_back_left_tyre TEXT,
  photo_back_right_tyre TEXT,
  photo_dashboard TEXT,
  photo_interior TEXT,
  
  -- Timestamps for each photo (JSONB)
  photo_timestamps JSONB DEFAULT '{}',
  
  -- Status workflow
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'owner_reviewed', 'recall_requested', 
    'reassignment_requested', 'admin_reviewed', 
    'approved', 'recall_approved', 'reassignment_approved', 
    'recall_denied', 'reassignment_denied', 'forced_withdrawal', 'completed'
  )),
  
  -- Owner review fields
  owner_reviewed_at TIMESTAMPTZ,
  owner_notes TEXT,
  owner_action TEXT CHECK (owner_action IN ('approved', 'recall', 'reassignment')),
  
  -- Admin decision fields
  admin_reviewed_at TIMESTAMPTZ,
  admin_decision TEXT CHECK (admin_decision IN (
    'approved', 'recall_approved', 'reassignment_approved', 
    'recall_denied', 'reassignment_denied', 'forced_withdrawal'
  )),
  admin_notes TEXT,
  admin_id UUID,
  
  -- Driver response for forced withdrawal
  driver_responded_at TIMESTAMPTZ,
  driver_accepted_withdrawal BOOLEAN,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(vehicle_id, driver_id, week_start_date)
);

-- Create weekly report settings table
CREATE TABLE public.weekly_report_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_enabled BOOLEAN DEFAULT true,
  report_due_day TEXT DEFAULT 'sunday',
  grace_period_hours INTEGER DEFAULT 24,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default settings
INSERT INTO public.weekly_report_settings (feature_enabled, report_due_day, grace_period_hours)
VALUES (true, 'sunday', 24);

-- Enable RLS
ALTER TABLE public.weekly_inspection_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_report_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for weekly_inspection_reports
CREATE POLICY "Drivers can create own reports"
ON public.weekly_inspection_reports FOR INSERT
WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Drivers can view own reports"
ON public.weekly_inspection_reports FOR SELECT
USING (driver_id = auth.uid());

CREATE POLICY "Drivers can update pending reports"
ON public.weekly_inspection_reports FOR UPDATE
USING (driver_id = auth.uid() AND status = 'pending');

CREATE POLICY "Owners can view their vehicle reports"
ON public.weekly_inspection_reports FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Owners can update review fields"
ON public.weekly_inspection_reports FOR UPDATE
USING (owner_id = auth.uid() AND status IN ('pending', 'owner_reviewed'));

CREATE POLICY "Admins can manage all reports"
ON public.weekly_inspection_reports FOR ALL
USING (public.is_admin());

-- RLS Policies for weekly_report_settings
CREATE POLICY "Anyone can view settings"
ON public.weekly_report_settings FOR SELECT
USING (true);

CREATE POLICY "Admins can manage settings"
ON public.weekly_report_settings FOR ALL
USING (public.is_admin());

-- Create updated_at trigger
CREATE TRIGGER update_weekly_inspection_reports_updated_at
BEFORE UPDATE ON public.weekly_inspection_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for inspection photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('weekly-inspection-photos', 'weekly-inspection-photos', true);

-- Storage policies
CREATE POLICY "Users can upload inspection photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'weekly-inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view inspection photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'weekly-inspection-photos');

CREATE POLICY "Users can update their inspection photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'weekly-inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their inspection photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'weekly-inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);