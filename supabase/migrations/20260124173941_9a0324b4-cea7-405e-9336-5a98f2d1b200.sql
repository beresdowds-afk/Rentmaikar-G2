-- Add pickup_location column to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS pickup_location TEXT,
ADD COLUMN IF NOT EXISTS pickup_address TEXT,
ADD COLUMN IF NOT EXISTS pickup_city TEXT,
ADD COLUMN IF NOT EXISTS pickup_instructions TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.vehicles.pickup_location IS 'General pickup location name or landmark';
COMMENT ON COLUMN public.vehicles.pickup_address IS 'Full address for vehicle pickup';
COMMENT ON COLUMN public.vehicles.pickup_city IS 'City where vehicle can be picked up';
COMMENT ON COLUMN public.vehicles.pickup_instructions IS 'Special instructions for vehicle pickup';

-- Insert FAQ item about driver onboarding and pickup details
INSERT INTO public.faq_items (category_id, question, answer, display_order, region, is_active, is_public)
VALUES (
  '5111e83d-80d8-45a0-a1a2-1a69a509bef0',
  'What happens after I sign the rental agreement?',
  'After all parties (driver, owner, and RentMaiKar admin witness) have signed the agreement, you will receive a confirmation email containing: (1) The vehicle pickup location and address, (2) Owner contact details including phone number, (3) Any special pickup instructions from the owner, and (4) A link to your dashboard where you can view all agreement details. You should coordinate directly with the owner to arrange a convenient pickup time. Make sure to complete the initial vehicle inspection report upon receiving the vehicle.',
  10,
  'all',
  true,
  true
);