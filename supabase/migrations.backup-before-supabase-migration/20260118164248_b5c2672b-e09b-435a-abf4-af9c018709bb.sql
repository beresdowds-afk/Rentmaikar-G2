-- Create table for IoT device orders
CREATE TABLE public.iot_device_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  device_price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT,
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_confirmed_at TIMESTAMP WITH TIME ZONE,
  payment_confirmed_by UUID,
  shipping_status TEXT NOT NULL DEFAULT 'pending',
  shipped_at TIMESTAMP WITH TIME ZONE,
  shipped_by UUID,
  tracking_number TEXT,
  shipping_address TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for IoT device pricing configuration
CREATE TABLE public.iot_device_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region TEXT NOT NULL,
  currency TEXT NOT NULL,
  price NUMERIC NOT NULL,
  description TEXT,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(region)
);

-- Insert default pricing
INSERT INTO public.iot_device_pricing (region, currency, price, description) VALUES
  ('usa', 'USD', 150.00, 'GPS tracking device for USA fleet'),
  ('nigeria', 'NGN', 75000.00, 'GPS tracking device for Nigeria fleet');

-- Enable RLS
ALTER TABLE public.iot_device_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iot_device_pricing ENABLE ROW LEVEL SECURITY;

-- RLS policies for iot_device_orders
CREATE POLICY "Owners can view their own orders"
  ON public.iot_device_orders FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can create their own orders"
  ON public.iot_device_orders FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins can view all orders"
  ON public.iot_device_orders FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can update all orders"
  ON public.iot_device_orders FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins can delete orders"
  ON public.iot_device_orders FOR DELETE
  USING (is_admin());

-- RLS policies for iot_device_pricing
CREATE POLICY "Anyone can view pricing"
  ON public.iot_device_pricing FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage pricing"
  ON public.iot_device_pricing FOR ALL
  USING (is_admin());

-- Create trigger for updated_at
CREATE TRIGGER update_iot_device_orders_updated_at
  BEFORE UPDATE ON public.iot_device_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_iot_device_pricing_updated_at
  BEFORE UPDATE ON public.iot_device_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();