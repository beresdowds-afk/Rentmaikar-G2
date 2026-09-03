
CREATE TABLE public.phone_reference (
  iso2 TEXT PRIMARY KEY,
  country_name TEXT NOT NULL,
  calling_code TEXT NOT NULL,
  example_e164 TEXT,
  example_national TEXT,
  region_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.phone_reference TO anon, authenticated;
GRANT ALL ON public.phone_reference TO service_role;

ALTER TABLE public.phone_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phone_reference_public_read"
  ON public.phone_reference FOR SELECT
  USING (true);

CREATE POLICY "phone_reference_admin_write"
  ON public.phone_reference FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_phone_reference_updated_at
  BEFORE UPDATE ON public.phone_reference
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_phone_reference_calling_code ON public.phone_reference(calling_code);
CREATE INDEX idx_phone_reference_region_label ON public.phone_reference(region_label);
