-- Add platform-wide activation flag to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Ensure all existing users are enabled
UPDATE public.profiles SET is_active = true WHERE is_active IS DISTINCT FROM true;