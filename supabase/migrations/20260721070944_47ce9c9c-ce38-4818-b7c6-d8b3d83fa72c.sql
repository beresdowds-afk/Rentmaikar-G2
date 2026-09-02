
-- Legal agreement acceptance ledger (per-user, per-template-version)
CREATE TABLE public.legal_agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.legal_agreement_templates(id) ON DELETE RESTRICT,
  template_key text NOT NULL,
  agreement_type text NOT NULL,
  region text NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX legal_agreement_acceptances_user_template_uidx
  ON public.legal_agreement_acceptances(user_id, template_id);
CREATE INDEX legal_agreement_acceptances_user_type_idx
  ON public.legal_agreement_acceptances(user_id, agreement_type, region, accepted_at DESC);

GRANT SELECT, INSERT ON public.legal_agreement_acceptances TO authenticated;
GRANT ALL ON public.legal_agreement_acceptances TO service_role;
ALTER TABLE public.legal_agreement_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own acceptances"
  ON public.legal_agreement_acceptances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own acceptances"
  ON public.legal_agreement_acceptances FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Helper: does the caller need to accept the latest active template?
CREATE OR REPLACE FUNCTION public.needs_latest_agreement_acceptance(
  _agreement_type text,
  _region text
) RETURNS TABLE(needs boolean, latest_template_id uuid, accepted_template_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _latest uuid;
  _accepted uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN QUERY SELECT true, NULL::uuid, NULL::uuid; RETURN;
  END IF;

  SELECT id INTO _latest
    FROM public.legal_agreement_templates
   WHERE agreement_type = _agreement_type AND region = _region AND is_active = true
   ORDER BY updated_at DESC LIMIT 1;

  SELECT template_id INTO _accepted
    FROM public.legal_agreement_acceptances
   WHERE user_id = _uid AND agreement_type = _agreement_type AND region = _region
   ORDER BY accepted_at DESC LIMIT 1;

  RETURN QUERY SELECT
    (_latest IS NOT NULL AND (_accepted IS NULL OR _accepted <> _latest)),
    _latest, _accepted;
END; $$;
GRANT EXECUTE ON FUNCTION public.needs_latest_agreement_acceptance(text, text) TO authenticated;

-- Tour step config audit log
CREATE TABLE public.tour_step_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid,
  tour_name text NOT NULL,
  country text NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  actor_id uuid,
  previous_steps jsonb,
  new_steps jsonb,
  previous_is_active boolean,
  new_is_active boolean,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tour_step_config_audit_lookup_idx
  ON public.tour_step_config_audit(tour_name, country, changed_at DESC);

GRANT SELECT ON public.tour_step_config_audit TO authenticated;
GRANT ALL ON public.tour_step_config_audit TO service_role;
ALTER TABLE public.tour_step_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read tour step config audit"
  ON public.tour_step_config_audit FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_tour_step_config_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.tour_step_config_audit(
      config_id, tour_name, country, action, actor_id,
      new_steps, new_is_active
    ) VALUES (
      NEW.id, NEW.tour_name, NEW.country, 'insert', auth.uid(),
      NEW.steps, NEW.is_active
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.tour_step_config_audit(
      config_id, tour_name, country, action, actor_id,
      previous_steps, new_steps, previous_is_active, new_is_active
    ) VALUES (
      NEW.id, NEW.tour_name, NEW.country, 'update', auth.uid(),
      OLD.steps, NEW.steps, OLD.is_active, NEW.is_active
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.tour_step_config_audit(
      config_id, tour_name, country, action, actor_id,
      previous_steps, previous_is_active
    ) VALUES (
      OLD.id, OLD.tour_name, OLD.country, 'delete', auth.uid(),
      OLD.steps, OLD.is_active
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_tour_step_configs_audit ON public.tour_step_configs;
CREATE TRIGGER trg_tour_step_configs_audit
AFTER INSERT OR UPDATE OR DELETE ON public.tour_step_configs
FOR EACH ROW EXECUTE FUNCTION public.log_tour_step_config_changes();
