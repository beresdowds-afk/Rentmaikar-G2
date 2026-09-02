-- Add column to profiles to track if driver is forbidden from daily payment plans
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS daily_plan_forbidden BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS daily_plan_forbidden_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS daily_plan_forbidden_reason TEXT;

-- Create payment_defaults table to track defaults with 36-hour/12-hourly notification logic
CREATE TABLE IF NOT EXISTS public.payment_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  rental_id TEXT NOT NULL,
  amount_due NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_frequency TEXT NOT NULL DEFAULT 'weekly',
  hours_overdue INTEGER NOT NULL DEFAULT 0,
  notifications_sent INTEGER NOT NULL DEFAULT 0,
  last_notification_at TIMESTAMP WITH TIME ZONE,
  deactivation_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  deactivated_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_status CHECK (status IN ('active', 'resolved', 'deactivated')),
  CONSTRAINT valid_frequency CHECK (payment_frequency IN ('daily', 'weekly')),
  CONSTRAINT valid_currency CHECK (currency IN ('USD', 'NGN'))
);

-- Enable RLS on payment_defaults
ALTER TABLE public.payment_defaults ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_defaults
CREATE POLICY "Admins can manage all payment defaults"
ON public.payment_defaults
FOR ALL
USING (is_admin());

CREATE POLICY "Drivers can view their own payment defaults"
ON public.payment_defaults
FOR SELECT
USING (driver_id = auth.uid());

-- Create function to forbid daily plans after a default
CREATE OR REPLACE FUNCTION public.forbid_daily_plan_on_default()
RETURNS TRIGGER AS $$
BEGIN
  -- When a payment default is created, forbid daily plans for that driver
  UPDATE public.profiles
  SET 
    daily_plan_forbidden = TRUE,
    daily_plan_forbidden_at = NOW(),
    daily_plan_forbidden_reason = 'Payment default on rental ' || NEW.rental_id
  WHERE user_id = NEW.driver_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-forbid daily plans on default
DROP TRIGGER IF EXISTS forbid_daily_plan_trigger ON public.payment_defaults;
CREATE TRIGGER forbid_daily_plan_trigger
AFTER INSERT ON public.payment_defaults
FOR EACH ROW
EXECUTE FUNCTION public.forbid_daily_plan_on_default();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_defaults_driver_id ON public.payment_defaults(driver_id);
CREATE INDEX IF NOT EXISTS idx_payment_defaults_status ON public.payment_defaults(status);
CREATE INDEX IF NOT EXISTS idx_profiles_daily_plan_forbidden ON public.profiles(daily_plan_forbidden) WHERE daily_plan_forbidden = TRUE;