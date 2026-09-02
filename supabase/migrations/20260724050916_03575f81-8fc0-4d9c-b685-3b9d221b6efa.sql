
CREATE OR REPLACE FUNCTION public.is_valid_e164(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p IS NULL OR p = '' OR p ~ '^\+[1-9][0-9]{6,14}$';
$$;

REVOKE ALL ON FUNCTION public.is_valid_e164(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_e164(text) TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION public.enforce_e164_phone_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  col text;
  val text;
  new_json jsonb := to_jsonb(NEW);
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    val := new_json ->> col;
    IF val IS NOT NULL AND val <> '' THEN
      val := regexp_replace(val, '\s+', '', 'g');
      IF NOT public.is_valid_e164(val) THEN
        RAISE EXCEPTION 'Phone number in column % must be E.164 formatted (got %)', col, val
          USING ERRCODE = '22023';
      END IF;
      new_json := jsonb_set(new_json, ARRAY[col], to_jsonb(val));
    END IF;
  END LOOP;
  NEW := jsonb_populate_record(NEW, new_json);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_e164_phone_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_e164_profiles ON public.profiles;
CREATE TRIGGER trg_e164_profiles BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone');

DROP TRIGGER IF EXISTS trg_e164_applications ON public.applications;
CREATE TRIGGER trg_e164_applications BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone_number', 'referee1_phone', 'referee2_phone', 'referee3_phone');

DROP TRIGGER IF EXISTS trg_e164_two_factor_settings ON public.two_factor_settings;
CREATE TRIGGER trg_e164_two_factor_settings BEFORE INSERT OR UPDATE ON public.two_factor_settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone_number');

DROP TRIGGER IF EXISTS trg_e164_driver_proxy_billing_accounts ON public.driver_proxy_billing_accounts;
CREATE TRIGGER trg_e164_driver_proxy_billing_accounts BEFORE INSERT OR UPDATE ON public.driver_proxy_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('proxy_phone');

DROP TRIGGER IF EXISTS trg_e164_roadside_partners ON public.roadside_partners;
CREATE TRIGGER trg_e164_roadside_partners BEFORE INSERT OR UPDATE ON public.roadside_partners
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone');

DROP TRIGGER IF EXISTS trg_e164_support_staff ON public.support_staff;
CREATE TRIGGER trg_e164_support_staff BEFORE INSERT OR UPDATE ON public.support_staff
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone');

DROP TRIGGER IF EXISTS trg_e164_voip_call_requests ON public.voip_call_requests;
CREATE TRIGGER trg_e164_voip_call_requests BEFORE INSERT OR UPDATE ON public.voip_call_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone_number');

DROP TRIGGER IF EXISTS trg_e164_voip_call_participants ON public.voip_call_participants;
CREATE TRIGGER trg_e164_voip_call_participants BEFORE INSERT OR UPDATE ON public.voip_call_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone_number');

DROP TRIGGER IF EXISTS trg_e164_voip_group_members ON public.voip_group_members;
CREATE TRIGGER trg_e164_voip_group_members BEFORE INSERT OR UPDATE ON public.voip_group_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone_number');

DROP TRIGGER IF EXISTS trg_e164_referee_verifications ON public.referee_verifications;
CREATE TRIGGER trg_e164_referee_verifications BEFORE INSERT OR UPDATE ON public.referee_verifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_e164_phone_columns('phone');
