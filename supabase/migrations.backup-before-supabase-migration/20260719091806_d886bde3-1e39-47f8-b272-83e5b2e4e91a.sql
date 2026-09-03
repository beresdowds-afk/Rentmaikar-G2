
-- =========================================================================
-- 1. USER PUBLIC UUIDs + AUDIT LOG
-- =========================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_uuid uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_uuid_key ON public.profiles(public_uuid);

CREATE TABLE IF NOT EXISTS public.user_uuid_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  public_uuid uuid NOT NULL UNIQUE,
  role text,
  source text NOT NULL DEFAULT 'trigger',
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

GRANT SELECT ON public.user_uuid_assignments TO authenticated;
GRANT ALL ON public.user_uuid_assignments TO service_role;

ALTER TABLE public.user_uuid_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own uuid assignment" ON public.user_uuid_assignments;
CREATE POLICY "Users read own uuid assignment"
  ON public.user_uuid_assignments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS user_uuid_assignments_user_id_idx ON public.user_uuid_assignments(user_id);

-- Trigger: log assignment when a profile row is inserted (auto for future users)
CREATE OR REPLACE FUNCTION public.log_user_public_uuid_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.public_uuid IS NULL THEN
    NEW.public_uuid := gen_random_uuid();
  END IF;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = NEW.user_id
  ORDER BY created_at ASC
  LIMIT 1;

  INSERT INTO public.user_uuid_assignments (user_id, public_uuid, role, source)
  VALUES (NEW.user_id, NEW.public_uuid, v_role, 'trigger')
  ON CONFLICT (public_uuid) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_log_public_uuid ON public.profiles;
CREATE TRIGGER trg_profiles_log_public_uuid
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_public_uuid_assignment();

-- Back-fill: record every existing profile that has no assignment yet
INSERT INTO public.user_uuid_assignments (user_id, public_uuid, role, source)
SELECT
  p.user_id,
  p.public_uuid,
  (SELECT role::text FROM public.user_roles ur WHERE ur.user_id = p.user_id ORDER BY created_at ASC LIMIT 1),
  'backfill'
FROM public.profiles p
LEFT JOIN public.user_uuid_assignments a ON a.user_id = p.user_id
WHERE a.id IS NULL
ON CONFLICT (public_uuid) DO NOTHING;

-- =========================================================================
-- 2. ADMIN ASSISTANTS INHERIT ADMIN
-- =========================================================================
CREATE OR REPLACE FUNCTION public.has_admin_assistant_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  -- Admins implicitly pass every assistant-permission check
  IF public.has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Guard against SQL-injection in dynamic column name
  IF _permission IS NULL OR _permission !~ '^[a-z_][a-z0-9_]*$' THEN
    RETURN false;
  END IF;

  EXECUTE format('SELECT %I FROM public.admin_assistant_permissions WHERE user_id = $1', _permission)
    INTO result
    USING _user_id;

  RETURN COALESCE(result, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_admin_assistant_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_assistant_permission(uuid, text) TO authenticated, service_role;

-- Convenience helper for future policies: returns true if caller is admin OR
-- an assistant with the given permission.
CREATE OR REPLACE FUNCTION public.has_admin_privilege(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR (public.has_role(_user_id, 'admin_assistant'::app_role)
          AND public.has_admin_assistant_permission(_user_id, _permission));
$$;

REVOKE EXECUTE ON FUNCTION public.has_admin_privilege(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_privilege(uuid, text) TO authenticated, service_role;

-- =========================================================================
-- 3. COMPANY INFORMATION BY REGION (drives landing footer)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.platform_company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL UNIQUE,
  company_name text NOT NULL,
  address_line text,
  city text,
  state text,
  country_name text,
  postal_code text,
  full_address text,
  phone text,
  phone_raw text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_company_info TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_company_info TO authenticated;
GRANT ALL ON public.platform_company_info TO service_role;

ALTER TABLE public.platform_company_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read company info" ON public.platform_company_info;
CREATE POLICY "Public read company info"
  ON public.platform_company_info FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage company info" ON public.platform_company_info;
CREATE POLICY "Admins manage company info"
  ON public.platform_company_info FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_platform_company_info_updated_at ON public.platform_company_info;
CREATE TRIGGER trg_platform_company_info_updated_at
  BEFORE UPDATE ON public.platform_company_info
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_company_info
  (region, company_name, address_line, city, state, country_name, postal_code, full_address, phone, phone_raw, email)
VALUES
  ('USA', 'Inte-Gritty LLC', '2002 East Marlboro Avenue, Apt 203', 'Hyattsville', 'Maryland', 'United States', '20785',
   '2002 East Marlboro Avenue, Apt 203, Hyattsville, Maryland, United States 20785',
   '+1 (608) 384-3932', '+16083843932', 'support@rentmaikar.com'),
  ('Nigeria', 'Rentmaikar Nigeria', NULL, 'Lagos', 'Lagos', 'Nigeria', NULL,
   'Lagos, Nigeria',
   '+234 803 555 0123', '+2348035550123', 'support@rentmaikar.com')
ON CONFLICT (region) DO NOTHING;

-- =========================================================================
-- 4. VEHICLE ↔ OWNER DB-ENFORCED INTEGRITY
-- =========================================================================
ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_id_owner_unique;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_id_owner_unique UNIQUE (id, owner_id);

ALTER TABLE public.vehicle_incidents
  DROP CONSTRAINT IF EXISTS vehicle_incidents_vehicle_owner_fk;
ALTER TABLE public.vehicle_incidents
  ADD CONSTRAINT vehicle_incidents_vehicle_owner_fk
  FOREIGN KEY (vehicle_id, owner_id)
  REFERENCES public.vehicles(id, owner_id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY IMMEDIATE
  NOT VALID;

ALTER TABLE public.vehicle_incidents VALIDATE CONSTRAINT vehicle_incidents_vehicle_owner_fk;

ALTER TABLE public.weekly_inspection_reports
  DROP CONSTRAINT IF EXISTS weekly_inspection_reports_vehicle_owner_fk;
ALTER TABLE public.weekly_inspection_reports
  ADD CONSTRAINT weekly_inspection_reports_vehicle_owner_fk
  FOREIGN KEY (vehicle_id, owner_id)
  REFERENCES public.vehicles(id, owner_id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY IMMEDIATE
  NOT VALID;

ALTER TABLE public.weekly_inspection_reports VALIDATE CONSTRAINT weekly_inspection_reports_vehicle_owner_fk;

ALTER TABLE public.price_negotiations
  DROP CONSTRAINT IF EXISTS price_negotiations_vehicle_owner_fk;
ALTER TABLE public.price_negotiations
  ADD CONSTRAINT price_negotiations_vehicle_owner_fk
  FOREIGN KEY (vehicle_id, owner_id)
  REFERENCES public.vehicles(id, owner_id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY IMMEDIATE
  NOT VALID;

ALTER TABLE public.price_negotiations VALIDATE CONSTRAINT price_negotiations_vehicle_owner_fk;
