
-- 1. Create table for editable year-model specifications per category + region
CREATE TABLE public.vehicle_category_year_specs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  region TEXT NOT NULL,
  min_year INTEGER NOT NULL,
  max_year INTEGER NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_category_year_specs_year_order CHECK (max_year >= min_year),
  CONSTRAINT vehicle_category_year_specs_year_bounds CHECK (min_year >= 1990 AND max_year <= 2100),
  CONSTRAINT vehicle_category_year_specs_unique UNIQUE (category, region)
);

-- 2. GRANTs — publicly readable (used on landing / registration), admin-only writes
GRANT SELECT ON public.vehicle_category_year_specs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vehicle_category_year_specs TO authenticated;
GRANT ALL ON public.vehicle_category_year_specs TO service_role;

-- 3. RLS
ALTER TABLE public.vehicle_category_year_specs ENABLE ROW LEVEL SECURITY;

-- 4. Policies: everyone can read (public marketing/registration surfaces need the ranges),
--    only admins may insert / update / delete
CREATE POLICY "Anyone can view year specs"
  ON public.vehicle_category_year_specs
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert year specs"
  ON public.vehicle_category_year_specs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update year specs"
  ON public.vehicle_category_year_specs
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete year specs"
  ON public.vehicle_category_year_specs
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 5. updated_at trigger
CREATE TRIGGER trg_vehicle_category_year_specs_updated_at
  BEFORE UPDATE ON public.vehicle_category_year_specs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Seed with current hardcoded ranges (USA + NIGERIA, budget/standard/premium)
INSERT INTO public.vehicle_category_year_specs
  (category, region, min_year, max_year, label, description, sort_order)
VALUES
  ('budget',   'USA',     2015, 2016, 'Budget',   'Entry tier for new drivers',      1),
  ('standard', 'USA',     2017, 2020, 'Standard', 'Mid-tier for growing earnings',   2),
  ('premium',  'USA',     2021, 2025, 'Premium',  'Premium tier for maximum income', 3),
  ('budget',   'NIGERIA', 2015, 2016, 'Budget',   'Entry tier for new drivers',      1),
  ('standard', 'NIGERIA', 2017, 2020, 'Standard', 'Mid-tier for growing earnings',   2),
  ('premium',  'NIGERIA', 2021, 2025, 'Premium',  'Premium tier for maximum income', 3);
