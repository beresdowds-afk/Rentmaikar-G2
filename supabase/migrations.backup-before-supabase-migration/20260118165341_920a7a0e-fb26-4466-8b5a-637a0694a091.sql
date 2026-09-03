-- Add delivery and installation confirmation fields to iot_device_orders
ALTER TABLE public.iot_device_orders
ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS delivery_confirmed_by uuid,
ADD COLUMN IF NOT EXISTS installation_confirmed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS installed_sim_number text,
ADD COLUMN IF NOT EXISTS installed_sim_provider text,
ADD COLUMN IF NOT EXISTS installation_notes text;