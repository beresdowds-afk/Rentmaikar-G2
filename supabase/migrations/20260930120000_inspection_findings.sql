-- Migration: Create inspection_findings for Automated Visual Damage Detection and Structured Comparison Findings
CREATE TABLE IF NOT EXISTS public.inspection_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES public.weekly_inspection_reports(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  photo_type TEXT NOT NULL,
  photo_url TEXT,
  baseline_photo_url TEXT,
  finding_type TEXT NOT NULL DEFAULT 'damage',
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  confidence NUMERIC(4,3) DEFAULT 0.85,
  diff_status TEXT NOT NULL DEFAULT 'new_damage',
  status TEXT NOT NULL DEFAULT 'open',
  bounding_box JSONB,
  recommendation TEXT,
  detected_by TEXT DEFAULT 'automated_visual_detection',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inspection_findings_inspection_id ON public.inspection_findings(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_findings_vehicle_id ON public.inspection_findings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_inspection_findings_driver_id ON public.inspection_findings(driver_id);
CREATE INDEX IF NOT EXISTS idx_inspection_findings_status ON public.inspection_findings(status);
CREATE INDEX IF NOT EXISTS idx_inspection_findings_severity ON public.inspection_findings(severity);

-- Enable RLS
ALTER TABLE public.inspection_findings ENABLE ROW LEVEL SECURITY;

-- Driver can read findings for their own inspections
CREATE POLICY "Drivers can view findings for their inspections"
  ON public.inspection_findings
  FOR SELECT
  TO authenticated
  USING (
    driver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = inspection_findings.vehicle_id AND v.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'admin_assistant', 'inspector')
    )
  );

-- Admins and Inspectors can manage findings
CREATE POLICY "Admins and inspectors can insert and update findings"
  ON public.inspection_findings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'admin_assistant', 'inspector')
    )
  );

-- Drivers and owners can update status (acknowledge, dispute)
CREATE POLICY "Drivers and owners can acknowledge or dispute findings"
  ON public.inspection_findings
  FOR UPDATE
  TO authenticated
  USING (
    driver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = inspection_findings.vehicle_id AND v.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    driver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = inspection_findings.vehicle_id AND v.owner_id = auth.uid()
    )
  );
