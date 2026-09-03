-- Create rentals table to track active vehicle rentals
CREATE TABLE public.rentals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  driver_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  return_confirmed_at TIMESTAMP WITH TIME ZONE,
  return_inspection_notes TEXT,
  payment_frequency TEXT NOT NULL DEFAULT 'weekly',
  daily_rate NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active',
  region TEXT NOT NULL DEFAULT 'USA',
  pickup_location TEXT,
  return_location TEXT,
  return_reminder_sent BOOLEAN NOT NULL DEFAULT false,
  extension_requested BOOLEAN NOT NULL DEFAULT false,
  extension_approved BOOLEAN,
  extended_end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage all rentals"
  ON public.rentals FOR ALL USING (is_admin());

CREATE POLICY "Drivers can view their own rentals"
  ON public.rentals FOR SELECT USING (driver_id = auth.uid());

CREATE POLICY "Owners can view rentals for their vehicles"
  ON public.rentals FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Drivers can update their active rentals"
  ON public.rentals FOR UPDATE USING (driver_id = auth.uid() AND status = 'active');

-- Timestamp trigger
CREATE TRIGGER update_rentals_updated_at
  BEFORE UPDATE ON public.rentals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for return reminder queries
CREATE INDEX idx_rentals_end_date_status ON public.rentals(end_date, status) WHERE status = 'active';

-- Enable realtime for rental status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.rentals;