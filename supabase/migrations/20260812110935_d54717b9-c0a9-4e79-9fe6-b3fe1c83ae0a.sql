ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS messaging_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS messaging_channel text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS data_sharing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_messaging_channel_check') THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_messaging_channel_check
      CHECK (messaging_channel IN ('none','sms','whatsapp'));
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS data_sharing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_sharing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS messaging_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_profile_from_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _country text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  _country := CASE lower(coalesce(NEW.country, ''))
                WHEN 'usa' THEN 'USA'
                WHEN 'nigeria' THEN 'Nigeria'
                ELSE NULL
              END;

  UPDATE public.profiles p
     SET full_name = coalesce(nullif(btrim(p.full_name), ''),
                              btrim(NEW.first_name || ' ' || NEW.last_name)),
         email = coalesce(p.email, NEW.email),
         phone = coalesce(nullif(btrim(p.phone), ''),
                          CASE WHEN NEW.phone_number ~ '^\+[1-9][0-9]{6,14}$'
                                AND NOT EXISTS (
                                      SELECT 1 FROM public.profiles p2
                                       WHERE p2.phone = NEW.phone_number
                                         AND p2.user_id <> NEW.user_id)
                               THEN NEW.phone_number END),
         preferred_country = coalesce(p.preferred_country, _country),
         city = coalesce(nullif(btrim(p.city), ''), NEW.city),
         street_address = coalesce(nullif(btrim(p.street_address), ''), NEW.street_address),
         notification_email = true,
         notification_sms = CASE WHEN NEW.messaging_consent AND NEW.messaging_channel = 'sms'
                                 THEN true ELSE coalesce(p.notification_sms, false) END,
         notification_whatsapp = CASE WHEN NEW.messaging_consent AND NEW.messaging_channel = 'whatsapp'
                                      THEN true ELSE coalesce(p.notification_whatsapp, false) END,
         messaging_consent_at = CASE WHEN NEW.messaging_consent
                                     THEN coalesce(p.messaging_consent_at, coalesce(NEW.consent_recorded_at, now()))
                                     ELSE p.messaging_consent_at END,
         data_sharing_consent = p.data_sharing_consent OR NEW.data_sharing_consent,
         data_sharing_consent_at = CASE WHEN NEW.data_sharing_consent
                                        THEN coalesce(p.data_sharing_consent_at, coalesce(NEW.consent_recorded_at, now()))
                                        ELSE p.data_sharing_consent_at END,
         emergency_contact_name = CASE
           WHEN NEW.application_type = 'driver'
             THEN coalesce(nullif(btrim(p.emergency_contact_name), ''), NEW.referee1_name)
           ELSE p.emergency_contact_name END,
         emergency_contact_phone = CASE
           WHEN NEW.application_type = 'driver'
             THEN coalesce(nullif(btrim(p.emergency_contact_phone), ''),
                           CASE WHEN NEW.referee1_phone ~ '^\+[1-9][0-9]{6,14}$' THEN NEW.referee1_phone END)
           ELSE p.emergency_contact_phone END,
         updated_at = now()
   WHERE p.user_id = NEW.user_id;

  RETURN NEW;
END;
$function$;