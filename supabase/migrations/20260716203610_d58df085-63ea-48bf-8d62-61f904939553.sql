
-- 1) Grants required for the existing RLS policies to actually execute
GRANT INSERT ON public.applications TO anon, authenticated;
GRANT SELECT, UPDATE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;

-- 2) Detailed audit trail for application creation and updates
CREATE OR REPLACE FUNCTION public.audit_application_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _action text;
  _details jsonb;
  _changed jsonb := '{}'::jsonb;
  _key text;
BEGIN
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
      'status', NEW.status,
      'submitted_at', NEW.created_at
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Diff a curated set of reviewable fields
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
      RETURN NEW; -- nothing auditable changed
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
      'new_status', NEW.status,
      'changed', _changed
    );
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (_actor, _action, 'applications', NEW.id::text, _details);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break registration or admin updates due to audit failures
  RAISE WARNING 'audit_application_changes failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_applications_insert ON public.applications;
CREATE TRIGGER trg_audit_applications_insert
AFTER INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.audit_application_changes();

DROP TRIGGER IF EXISTS trg_audit_applications_update ON public.applications;
CREATE TRIGGER trg_audit_applications_update
AFTER UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.audit_application_changes();
