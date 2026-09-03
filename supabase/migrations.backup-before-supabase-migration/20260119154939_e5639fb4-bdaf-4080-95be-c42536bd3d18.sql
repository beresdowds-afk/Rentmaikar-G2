
-- Create table for storing legal agreements
CREATE TABLE public.legal_agreements (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    agreement_type TEXT NOT NULL DEFAULT 'rental_agreement',
    driver_id UUID NOT NULL,
    owner_id UUID NOT NULL,
    vehicle_id UUID,
    
    -- Agreement content
    agreement_content TEXT NOT NULL,
    agreement_version TEXT NOT NULL DEFAULT '1.0',
    
    -- Signatures stored as base64 data URLs
    driver_signature TEXT,
    owner_signature TEXT,
    admin_witness_signature TEXT,
    
    -- Signature timestamps
    driver_signed_at TIMESTAMP WITH TIME ZONE,
    owner_signed_at TIMESTAMP WITH TIME ZONE,
    admin_witnessed_at TIMESTAMP WITH TIME ZONE,
    admin_witness_id UUID,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending_signatures',
    
    -- Email tracking
    email_sent_at TIMESTAMP WITH TIME ZONE,
    email_sent_to JSONB,
    
    -- PDF storage
    pdf_url TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.legal_agreements ENABLE ROW LEVEL SECURITY;

-- Drivers can view and sign their agreements
CREATE POLICY "Drivers can view their agreements"
ON public.legal_agreements
FOR SELECT
USING (driver_id = auth.uid());

CREATE POLICY "Drivers can update their signature"
ON public.legal_agreements
FOR UPDATE
USING (driver_id = auth.uid() AND status = 'pending_signatures')
WITH CHECK (driver_id = auth.uid());

-- Owners can view and sign their agreements
CREATE POLICY "Owners can view their agreements"
ON public.legal_agreements
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Owners can update their signature"
ON public.legal_agreements
FOR UPDATE
USING (owner_id = auth.uid() AND status = 'pending_signatures')
WITH CHECK (owner_id = auth.uid());

-- Admins can manage all agreements
CREATE POLICY "Admins can manage all agreements"
ON public.legal_agreements
FOR ALL
USING (is_admin());

-- Create trigger for updated_at
CREATE TRIGGER update_legal_agreements_updated_at
BEFORE UPDATE ON public.legal_agreements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_legal_agreements_driver ON public.legal_agreements(driver_id);
CREATE INDEX idx_legal_agreements_owner ON public.legal_agreements(owner_id);
CREATE INDEX idx_legal_agreements_status ON public.legal_agreements(status);
