
-- Add renewal tracking columns to legal_agreements
ALTER TABLE public.legal_agreements
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_compulsory BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS renewal_notified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS parent_agreement_id UUID REFERENCES public.legal_agreements(id) ON DELETE SET NULL;

-- Set expires_at on existing active agreements (30 days from creation)
UPDATE public.legal_agreements
  SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL AND status = 'active';

-- Create agreement renewal alerts table
CREATE TABLE IF NOT EXISTS public.agreement_renewal_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.legal_agreements(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- '7_day_warning', '3_day_warning', 'expired', 'renewed'
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_to JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agreement_renewal_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage renewal alerts"
  ON public.agreement_renewal_alerts
  FOR ALL
  USING (public.is_admin());

-- Index for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_legal_agreements_expires_at
  ON public.legal_agreements(expires_at)
  WHERE status IN ('active', 'pending_signatures');

CREATE INDEX IF NOT EXISTS idx_agreement_renewal_alerts_agreement_id
  ON public.agreement_renewal_alerts(agreement_id);
