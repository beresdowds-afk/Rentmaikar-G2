-- Add phone verification and notification preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS phone_verification_code text,
ADD COLUMN IF NOT EXISTS phone_verification_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS notification_email boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_sms boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_whatsapp boolean DEFAULT false;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_phone_verified ON public.profiles(phone_verified);