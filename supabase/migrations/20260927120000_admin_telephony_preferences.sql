-- Migration: 20260927120000_admin_telephony_preferences.sql
-- Description: Creates admin_telephony_preferences to store per-admin telephony engine choices (SOFTPHONE, SERVER_REST, TWIML)

CREATE TABLE IF NOT EXISTS public.admin_telephony_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_engine TEXT NOT NULL DEFAULT 'SOFTPHONE' CHECK (preferred_engine IN ('SOFTPHONE', 'SERVER_REST', 'TWIML')),
  caller_id TEXT,
  auto_record BOOLEAN NOT NULL DEFAULT true,
  webrtc_audio_input_device_id TEXT,
  webrtc_audio_output_device_id TEXT,
  region TEXT NOT NULL DEFAULT 'USA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_admin_telephony_preferences_admin_id UNIQUE (admin_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_telephony_preferences_admin_id ON public.admin_telephony_preferences(admin_id);

-- Enable Row Level Security
ALTER TABLE public.admin_telephony_preferences ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view their own telephony preferences"
  ON public.admin_telephony_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = admin_id);

CREATE POLICY "Admins can insert their own telephony preferences"
  ON public.admin_telephony_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Admins can update their own telephony preferences"
  ON public.admin_telephony_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);
