
-- Add message forwarding numbers to platform_regions
ALTER TABLE public.platform_regions
  ADD COLUMN forwarding_sms TEXT,
  ADD COLUMN forwarding_whatsapp TEXT,
  ADD COLUMN forwarding_notes TEXT;
