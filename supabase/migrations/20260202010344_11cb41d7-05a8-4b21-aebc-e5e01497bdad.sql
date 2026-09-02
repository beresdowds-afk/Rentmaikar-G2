-- Add min_price column to vehicle_category_prices for price ranges
ALTER TABLE public.vehicle_category_prices 
ADD COLUMN IF NOT EXISTS min_price numeric;

-- Update min_price to be 80% of current price as a default range
UPDATE public.vehicle_category_prices 
SET min_price = price * 0.8;

-- Update Nigeria security deposit to 100,000 NGN (was incorrectly set to 100)
UPDATE public.security_deposit_settings 
SET amount = 100000, description = 'Security deposit for Nigeria drivers (₦100,000)'
WHERE region = 'Nigeria';

-- Update USA description for clarity
UPDATE public.security_deposit_settings 
SET description = 'Security deposit for USA drivers ($200)'
WHERE region = 'USA';