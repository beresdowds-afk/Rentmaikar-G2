-- Allow authenticated users to read only active legal agreement templates
DROP POLICY IF EXISTS "Authenticated users can read active templates" ON public.legal_agreement_templates;
CREATE POLICY "Authenticated users can read active templates"
  ON public.legal_agreement_templates
  FOR SELECT
  TO authenticated
  USING (is_active = true);