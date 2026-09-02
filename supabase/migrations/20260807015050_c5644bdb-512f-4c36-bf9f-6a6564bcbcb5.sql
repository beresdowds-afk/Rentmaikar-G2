CREATE TABLE public.outreach_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  raw_phone text NOT NULL,
  phone_e164 text,
  country_code text,
  contact_type text NOT NULL DEFAULT 'driver',
  status text NOT NULL DEFAULT 'prospect',
  region text,
  source text,
  notes text,
  converted_user_id uuid,
  last_contacted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_contacts_type_chk CHECK (contact_type IN ('driver','owner','other')),
  CONSTRAINT outreach_contacts_status_chk CHECK (status IN ('prospect','contacted','invited','signed_up','onboarded','unreachable','opted_out')),
  CONSTRAINT outreach_contacts_e164_chk CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9]\d{7,14}$')
);

CREATE UNIQUE INDEX outreach_contacts_phone_e164_key ON public.outreach_contacts (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX idx_outreach_contacts_status ON public.outreach_contacts (status);
CREATE INDEX idx_outreach_contacts_type ON public.outreach_contacts (contact_type);
CREATE INDEX idx_outreach_contacts_name ON public.outreach_contacts (lower(full_name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_contacts TO authenticated;
GRANT ALL ON public.outreach_contacts TO service_role;

ALTER TABLE public.outreach_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outreach_contacts_staff_read" ON public.outreach_contacts
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.has_role(auth.uid(), 'admin_assistant'::app_role)
  OR public.is_any_support_staff(auth.uid())
);

CREATE POLICY "outreach_contacts_staff_insert" ON public.outreach_contacts
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.has_role(auth.uid(), 'admin_assistant'::app_role)
);

CREATE POLICY "outreach_contacts_staff_update" ON public.outreach_contacts
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR public.has_role(auth.uid(), 'admin_assistant'::app_role)
  OR public.is_any_support_staff(auth.uid())
)
WITH CHECK (
  public.is_admin()
  OR public.has_role(auth.uid(), 'admin_assistant'::app_role)
  OR public.is_any_support_staff(auth.uid())
);

CREATE POLICY "outreach_contacts_admin_delete" ON public.outreach_contacts
FOR DELETE TO authenticated
USING (public.is_admin());

CREATE TRIGGER update_outreach_contacts_updated_at
BEFORE UPDATE ON public.outreach_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();