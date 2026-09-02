CREATE OR REPLACE FUNCTION public.sync_outreach_contact_from_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_name text;
  v_email text;
  v_role text;
  v_existing uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  v_phone := regexp_replace(coalesce(NEW.phone_country,'') || coalesce(NEW.phone_number,''), '[^0-9+]', '', 'g');
  IF v_phone <> '' AND left(v_phone,1) <> '+' THEN
    v_phone := '+' || v_phone;
  END IF;
  IF v_phone !~ '^\+[1-9]\d{7,14}$' THEN
    v_phone := NULL;
  END IF;

  v_name := btrim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
  IF v_name = '' THEN v_name := coalesce(NEW.email, 'Unknown'); END IF;
  v_email := lower(nullif(btrim(coalesce(NEW.email,'')), ''));
  v_role := CASE WHEN NEW.application_type::text = 'owner' THEN 'owner' ELSE 'driver' END;

  SELECT id INTO v_existing
  FROM public.outreach_contacts
  WHERE (v_phone IS NOT NULL AND phone_e164 = v_phone)
     OR (v_email IS NOT NULL AND lower(email) = v_email)
  ORDER BY created_at
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.outreach_contacts
    SET full_name = v_name,
        email = coalesce(v_email, email),
        phone_e164 = coalesce(phone_e164, v_phone),
        raw_phone = coalesce(nullif(raw_phone,''), coalesce(v_phone,'unknown')),
        contact_type = v_role,
        signup_role = v_role,
        status = 'signed_up',
        converted_user_id = coalesce(NEW.user_id, converted_user_id),
        updated_at = now()
    WHERE id = v_existing;
  ELSE
    INSERT INTO public.outreach_contacts
      (full_name, raw_phone, phone_e164, email, contact_type, signup_role, status, converted_user_id, source)
    VALUES
      (v_name, coalesce(v_phone,'unknown'), v_phone, v_email, v_role, v_role, 'signed_up', NEW.user_id, 'approved_application');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_outreach_contact_from_application() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_outreach_contact_from_application ON public.applications;
CREATE TRIGGER trg_sync_outreach_contact_from_application
AFTER INSERT OR UPDATE OF status ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_outreach_contact_from_application();