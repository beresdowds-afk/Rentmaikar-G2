CREATE OR REPLACE FUNCTION public.audit_assistant_user_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor UUID := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  _action TEXT;
  _details JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'assistant_user_assigned';
    _details := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'assistant_user_assignment_updated';
    _details := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSE
    _action := 'assistant_user_unassigned';
    _details := to_jsonb(OLD);
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (_actor, _action, 'admin_assistant_user_assignments',
          COALESCE(NEW.assistant_id, OLD.assistant_id)::text, _details);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_admin_assistant_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor UUID := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  _action TEXT;
  _target UUID;
  _details JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'assistant_permissions_granted';
    _target := NEW.user_id;
    _details := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'assistant_permissions_updated';
    _target := NEW.user_id;
    _details := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSE
    _action := 'assistant_permissions_revoked';
    _target := OLD.user_id;
    _details := to_jsonb(OLD);
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (_actor, _action, 'admin_assistant_permissions', _target::text, _details);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_document_rejection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
    VALUES (
      COALESCE(NEW.verified_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'document_verification_failed',
      'user_documents',
      NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'document_type', NEW.document_type,
        'document_category', NEW.document_category,
        'vehicle_id', NEW.vehicle_id,
        'rejection_reason', NEW.rejection_reason,
        'file_name', NEW.file_name,
        'rejected_at', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;