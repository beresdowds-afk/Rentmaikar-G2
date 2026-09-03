-- Create rent_to_own_settings table for global feature toggle
CREATE TABLE public.rent_to_own_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Insert default settings
INSERT INTO public.rent_to_own_settings (feature_enabled) VALUES (false);

-- Enable RLS
ALTER TABLE public.rent_to_own_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for settings
CREATE POLICY "Admins can manage RTO settings" ON public.rent_to_own_settings
  FOR ALL USING (is_admin());

CREATE POLICY "Anyone can view RTO settings" ON public.rent_to_own_settings
  FOR SELECT USING (true);

-- Create rent_to_own_listings table for owner vehicle listings
CREATE TABLE public.rent_to_own_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  
  -- Financial terms proposed by owner
  total_price numeric NOT NULL,
  down_payment numeric NOT NULL DEFAULT 0,
  monthly_payment numeric NOT NULL,
  duration_months integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  
  -- Early exit options (owner can toggle these)
  allow_buyout boolean NOT NULL DEFAULT true,
  allow_conversion_to_rental boolean NOT NULL DEFAULT false,
  
  -- Negotiation fields
  admin_counter_total_price numeric,
  admin_counter_down_payment numeric,
  admin_counter_monthly_payment numeric,
  admin_counter_duration_months integer,
  admin_response text,
  owner_message text,
  
  -- Final approved terms
  final_total_price numeric,
  final_down_payment numeric,
  final_monthly_payment numeric,
  final_duration_months integer,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'counter_offer', 'approved', 'rejected', 'active', 'completed', 'cancelled')),
  is_available boolean NOT NULL DEFAULT false,
  
  -- Approval tracking
  approved_at timestamp with time zone,
  approved_by uuid,
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rent_to_own_listings ENABLE ROW LEVEL SECURITY;

-- RLS policies for listings
CREATE POLICY "Admins can manage all RTO listings" ON public.rent_to_own_listings
  FOR ALL USING (is_admin());

CREATE POLICY "Owners can create RTO listings" ON public.rent_to_own_listings
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update pending listings" ON public.rent_to_own_listings
  FOR UPDATE USING (owner_id = auth.uid() AND status IN ('pending', 'counter_offer'));

CREATE POLICY "Owners can view their RTO listings" ON public.rent_to_own_listings
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Drivers can view available RTO listings" ON public.rent_to_own_listings
  FOR SELECT USING (is_available = true AND status = 'active');

-- Create rent_to_own_agreements table for driver-owner contracts
CREATE TABLE public.rent_to_own_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.rent_to_own_listings(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  
  -- Locked-in terms from the listing
  total_price numeric NOT NULL,
  down_payment numeric NOT NULL,
  monthly_payment numeric NOT NULL,
  duration_months integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  
  -- Early exit options
  allow_buyout boolean NOT NULL DEFAULT true,
  allow_conversion_to_rental boolean NOT NULL DEFAULT false,
  
  -- Payment tracking
  payments_made integer NOT NULL DEFAULT 0,
  total_amount_paid numeric NOT NULL DEFAULT 0,
  next_payment_due date,
  
  -- Status
  status text NOT NULL DEFAULT 'pending_signatures' CHECK (status IN ('pending_signatures', 'active', 'completed', 'defaulted', 'bought_out', 'converted_to_rental', 'cancelled')),
  
  -- Signatures
  driver_signature text,
  driver_signed_at timestamp with time zone,
  owner_signature text,
  owner_signed_at timestamp with time zone,
  admin_witness_signature text,
  admin_witnessed_at timestamp with time zone,
  admin_witness_id uuid,
  
  -- Agreement content
  agreement_content text NOT NULL,
  
  -- Resolution fields
  resolution_notes text,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rent_to_own_agreements ENABLE ROW LEVEL SECURITY;

-- RLS policies for agreements
CREATE POLICY "Admins can manage all RTO agreements" ON public.rent_to_own_agreements
  FOR ALL USING (is_admin());

CREATE POLICY "Drivers can view their RTO agreements" ON public.rent_to_own_agreements
  FOR SELECT USING (driver_id = auth.uid());

CREATE POLICY "Drivers can update their signature" ON public.rent_to_own_agreements
  FOR UPDATE USING (driver_id = auth.uid() AND status = 'pending_signatures')
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Owners can view their RTO agreements" ON public.rent_to_own_agreements
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Owners can update their signature" ON public.rent_to_own_agreements
  FOR UPDATE USING (owner_id = auth.uid() AND status = 'pending_signatures')
  WITH CHECK (owner_id = auth.uid());

-- Create triggers for updated_at
CREATE TRIGGER update_rent_to_own_settings_updated_at
  BEFORE UPDATE ON public.rent_to_own_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rent_to_own_listings_updated_at
  BEFORE UPDATE ON public.rent_to_own_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rent_to_own_agreements_updated_at
  BEFORE UPDATE ON public.rent_to_own_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for RTO tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.rent_to_own_listings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rent_to_own_agreements;