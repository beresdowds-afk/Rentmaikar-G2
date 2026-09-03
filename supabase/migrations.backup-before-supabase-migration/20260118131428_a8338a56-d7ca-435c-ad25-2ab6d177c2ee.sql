-- Create enum for negotiation status
CREATE TYPE public.negotiation_status AS ENUM ('pending', 'counter_offer', 'approved', 'rejected', 'locked');

-- Create price negotiations table
CREATE TABLE public.price_negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID,
  
  -- Price details
  requested_daily_rate DECIMAL(10, 2) NOT NULL,
  admin_counter_offer DECIMAL(10, 2),
  final_daily_rate DECIMAL(10, 2),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'NGN')),
  
  -- Vehicle info snapshot
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  vehicle_category TEXT CHECK (vehicle_category IN ('budget', 'standard', 'premium')),
  
  -- Status and approval
  status negotiation_status DEFAULT 'pending',
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  
  -- Messages/notes
  driver_message TEXT,
  admin_response TEXT,
  rejection_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id)
);

-- Create modification requests table (for locked prices)
CREATE TABLE public.price_modification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id UUID REFERENCES public.price_negotiations(id) ON DELETE CASCADE NOT NULL,
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  requester_type TEXT NOT NULL CHECK (requester_type IN ('driver', 'owner')),
  
  current_rate DECIMAL(10, 2) NOT NULL,
  requested_rate DECIMAL(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_response TEXT,
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.price_negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_modification_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for price_negotiations
-- Drivers can view their own negotiations
CREATE POLICY "Drivers can view their negotiations"
ON public.price_negotiations FOR SELECT
TO authenticated
USING (driver_id = auth.uid());

-- Drivers can create negotiations
CREATE POLICY "Drivers can create negotiations"
ON public.price_negotiations FOR INSERT
TO authenticated
WITH CHECK (driver_id = auth.uid());

-- Drivers can update their pending negotiations
CREATE POLICY "Drivers can update pending negotiations"
ON public.price_negotiations FOR UPDATE
TO authenticated
USING (driver_id = auth.uid() AND status = 'pending' AND is_locked = false);

-- Admins can view all negotiations
CREATE POLICY "Admins can view all negotiations"
ON public.price_negotiations FOR SELECT
TO authenticated
USING (public.is_admin());

-- Admins can update all negotiations
CREATE POLICY "Admins can update all negotiations"
ON public.price_negotiations FOR UPDATE
TO authenticated
USING (public.is_admin());

-- Admins can delete negotiations
CREATE POLICY "Admins can delete negotiations"
ON public.price_negotiations FOR DELETE
TO authenticated
USING (public.is_admin());

-- RLS Policies for price_modification_requests
-- Users can view their own requests
CREATE POLICY "Users can view their modification requests"
ON public.price_modification_requests FOR SELECT
TO authenticated
USING (requester_id = auth.uid());

-- Users can create modification requests
CREATE POLICY "Users can create modification requests"
ON public.price_modification_requests FOR INSERT
TO authenticated
WITH CHECK (requester_id = auth.uid());

-- Admins can view all requests
CREATE POLICY "Admins can view all modification requests"
ON public.price_modification_requests FOR SELECT
TO authenticated
USING (public.is_admin());

-- Admins can update modification requests
CREATE POLICY "Admins can update modification requests"
ON public.price_modification_requests FOR UPDATE
TO authenticated
USING (public.is_admin());

-- Triggers for updated_at
CREATE TRIGGER update_price_negotiations_updated_at
BEFORE UPDATE ON public.price_negotiations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();