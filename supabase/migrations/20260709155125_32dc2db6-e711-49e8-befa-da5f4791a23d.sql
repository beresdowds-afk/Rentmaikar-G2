
-- Add admin_assistant to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_assistant';
