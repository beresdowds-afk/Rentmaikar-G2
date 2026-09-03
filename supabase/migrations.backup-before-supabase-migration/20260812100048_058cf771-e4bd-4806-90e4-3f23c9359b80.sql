CREATE TABLE public.registration_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  application_id uuid,
  event_type text NOT NULL,
  application_type text,
  source text NOT NULL DEFAULT 'server',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.registration_audit_log TO authenticated;
GRANT ALL ON public.registration_audit_log TO service_role;

ALTER TABLE public.registration_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own registration audit"
  ON public.registration_audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all registration audit"
  ON public.registration_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_admin_privilege(auth.uid(), 'can_view_users'));

CREATE INDEX idx_reg_audit_created_at ON public.registration_audit_log (created_at DESC);
CREATE INDEX idx_reg_audit_user ON public.registration_audit_log (user_id, created_at DESC);
CREATE INDEX idx_reg_audit_email ON public.registration_audit_log (lower(email));
CREATE INDEX idx_reg_audit_event ON public.registration_audit_log (event_type, created_at DESC);

-- Client-callable logger (server derives the user; never trusts a passed id)
CREATE OR REPLACE FUNCTION public.log_registration_event(
  _event_type text,
  _email text DEFAULT NULL,
  _application_id uuid DEFAULT NULL,
  _application_type text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event_type IS NULL OR length(_event_type) > 64 THEN
    RAISE EXCEPTION 'invalid event_type';
  END IF;

  INSERT INTO public.registration_audit_log(
    user_id, email, application_id, event_type, application_type, source, metadata)
  VALUES (
    auth.uid(),
    lower(nullif(btrim(_email), '')),
    _application_id,
    _event_type,
    nullif(btrim(_application_type), ''),
    'client',
    coalesce(_metadata, '{}'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_registration_event(text, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_registration_event(text, text, uuid, text, jsonb) TO anon, authenticated;

-- Server-side trigger: record every registration upsert into applications
CREATE OR REPLACE FUNCTION public.log_registration_upsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changed text[] := '{}';
  _profile_synced boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key)
      INTO _changed
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key)
       AND n.key NOT IN ('updated_at');
    IF _changed IS NULL OR array_length(_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = NEW.user_id)
      INTO _profile_synced;
  END IF;

  INSERT INTO public.registration_audit_log(
    user_id, email, application_id, event_type, application_type, source, metadata)
  VALUES (
    NEW.user_id,
    lower(nullif(btrim(NEW.email), '')),
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'registration_submitted' ELSE 'registration_updated' END,
    NEW.application_type::text,
    'trigger',
    jsonb_build_object(
      'status', NEW.status,
      'has_street_address', coalesce(btrim(NEW.street_address), '') <> '',
      'changed_fields', coalesce(to_jsonb(_changed), '[]'::jsonb),
      'profile_synced', _profile_synced));

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_registration_upsert() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_log_registration_upsert ON public.applications;
CREATE TRIGGER trg_log_registration_upsert
AFTER INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.log_registration_upsert();