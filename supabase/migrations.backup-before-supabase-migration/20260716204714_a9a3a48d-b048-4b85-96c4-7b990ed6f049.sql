
CREATE TABLE IF NOT EXISTS public.application_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  changed jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.application_audit_log TO authenticated;
GRANT ALL ON public.application_audit_log TO service_role;

ALTER TABLE public.application_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and support staff can view application audit log"
  ON public.application_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_any_support_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_application_audit_log_app ON public.application_audit_log(application_id, created_at DESC);

-- Replace the earlier trigger to write to the new dedicated table and
-- gracefully handle anonymous submissions (auth.uid() is NULL).
CREATE OR REPLACE FUNCTION public.audit_application_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _role text;
  _action text;
  _changed jsonb := '{}'::jsonb;
  _details jsonb;
  _key text;
BEGIN
  IF _actor IS NULL THEN
    _role := 'anonymous';
  ELSIF public.is_admin() THEN
    _role := 'admin';
  ELSIF public.is_any_support_staff(_actor) THEN
    _role := 'support_staff';
  ELSE
    _role := 'user';
  END IF;

  IF TG_OP = 'INSERT' THEN
    _action := 'application_created';
    _details := jsonb_build_object(
      'application_type', NEW.application_type,
      'email', NEW.email,
      'first_name', NEW.first_name,
      'last_name', NEW.last_name,
      'country', NEW.country,
      'city', NEW.city,
      'region', NEW.region,
      'status', NEW.status
    );
  ELSIF TG_OP = 'UPDATE' THEN
    FOR _key IN SELECT unnest(ARRAY[
      'status','reviewed_by','reviewed_at','review_notes','rejection_reason',
      'assigned_to','assigned_at','assigned_by','user_id'
    ]) LOOP
      IF to_jsonb(NEW) -> _key IS DISTINCT FROM to_jsonb(OLD) -> _key THEN
        _changed := _changed || jsonb_build_object(
          _key,
          jsonb_build_object('old', to_jsonb(OLD) -> _key, 'new', to_jsonb(NEW) -> _key)
        );
      END IF;
    END LOOP;

    IF _changed = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    _action := CASE
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'application_status_changed'
      WHEN NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN 'application_assigned'
      ELSE 'application_updated'
    END;

    _details := jsonb_build_object(
      'application_type', NEW.application_type,
      'email', NEW.email,
      'old_status', OLD.status,
      'new_status', NEW.status
    );
  END IF;

  INSERT INTO public.application_audit_log
    (application_id, actor_id, actor_role, action, changed, details)
  VALUES (NEW.id, _actor, _role, _action, _changed, _details);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'audit_application_changes failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
