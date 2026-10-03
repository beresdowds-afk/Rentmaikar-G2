-- ============================================================================
-- Migration: 20261001090500_background_screening.sql
-- Tier 2 Feature 23: Criminal & Background Checks
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.driver_background_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_case_id text,
  check_type text NOT NULL, -- e.g. 'criminal_mvr', 'police_clearance', 'driving_record'
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','consent_required','submitted','processing','clear','consider','adverse','expired','failed')),
  consent_id uuid,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_background_checks_driver_id
  ON public.driver_background_checks(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_background_checks_status
  ON public.driver_background_checks(status);

ALTER TABLE public.driver_background_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view their own background checks" ON public.driver_background_checks;
CREATE POLICY "Drivers can view their own background checks"
  ON public.driver_background_checks
  FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all background checks" ON public.driver_background_checks;
CREATE POLICY "Admins can view all background checks"
  ON public.driver_background_checks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'admin_assistant')
    )
  );

-- Helper RPC for checking if driver has a clear background check
CREATE OR REPLACE FUNCTION public.get_driver_background_status(_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.driver_background_checks%ROWTYPE;
BEGIN
  SELECT *
  INTO v_rec
  FROM public.driver_background_checks
  WHERE driver_id = _driver_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_check', false,
      'is_clear', false,
      'status', 'none'
    );
  END IF;

  RETURN jsonb_build_object(
    'has_check', true,
    'id', v_rec.id,
    'status', v_rec.status,
    'is_clear', (v_rec.status = 'clear' AND (v_rec.expires_at IS NULL OR v_rec.expires_at > now())),
    'provider', v_rec.provider,
    'completed_at', v_rec.completed_at,
    'expires_at', v_rec.expires_at
  );
END;
$$;
