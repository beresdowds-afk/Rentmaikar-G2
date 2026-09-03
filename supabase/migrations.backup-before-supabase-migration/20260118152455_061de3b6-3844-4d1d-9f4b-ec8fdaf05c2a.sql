-- Create table for vehicle category pricing
CREATE TABLE public.vehicle_category_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('budget', 'standard', 'premium')),
  region TEXT NOT NULL CHECK (region IN ('USA', 'NIGERIA')),
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category, region)
);

-- Enable RLS
ALTER TABLE public.vehicle_category_prices ENABLE ROW LEVEL SECURITY;

-- Admins can manage prices
CREATE POLICY "Admins can manage category prices"
ON public.vehicle_category_prices
FOR ALL
USING (is_admin());

-- Anyone can view prices (public data for homepage)
CREATE POLICY "Anyone can view category prices"
ON public.vehicle_category_prices
FOR SELECT
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_vehicle_category_prices_updated_at
BEFORE UPDATE ON public.vehicle_category_prices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default prices
INSERT INTO public.vehicle_category_prices (category, region, price, currency) VALUES
  ('budget', 'USA', 250, 'USD'),
  ('standard', 'USA', 300, 'USD'),
  ('premium', 'USA', 350, 'USD'),
  ('budget', 'NIGERIA', 60000, 'NGN'),
  ('standard', 'NIGERIA', 73000, 'NGN'),
  ('premium', 'NIGERIA', 93000, 'NGN');