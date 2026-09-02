-- Create table to track expiry notifications
CREATE TABLE public.expiry_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID,
  vehicle_id UUID,
  notification_type TEXT NOT NULL, -- 'insurance', 'registration', 'license', 'inspection'
  recipient_type TEXT NOT NULL, -- 'owner', 'driver', 'admin'
  recipient_id UUID NOT NULL,
  days_until_expiry INTEGER NOT NULL, -- 30 or 7
  notification_channel TEXT NOT NULL, -- 'email', 'sms', 'whatsapp', 'voip'
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  voip_call_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient lookups
CREATE INDEX idx_expiry_notifications_lookup ON public.expiry_notifications(document_id, vehicle_id, days_until_expiry, recipient_id);
CREATE INDEX idx_expiry_notifications_date ON public.expiry_notifications(sent_at);

-- Enable RLS
ALTER TABLE public.expiry_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can manage all notifications
CREATE POLICY "Admins can manage expiry notifications"
  ON public.expiry_notifications
  FOR ALL
  USING (is_admin());

-- Users can view their own notifications
CREATE POLICY "Users can view own expiry notifications"
  ON public.expiry_notifications
  FOR SELECT
  USING (recipient_id = auth.uid());

-- Add expiry columns to vehicles if not exists
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
ADD COLUMN IF NOT EXISTS registration_expiry DATE,
ADD COLUMN IF NOT EXISTS inspection_expiry DATE;

-- Add expiry column to user_documents if not exists
ALTER TABLE public.user_documents
ADD COLUMN IF NOT EXISTS expiry_date DATE;