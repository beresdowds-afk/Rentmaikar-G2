CREATE TABLE public.agreement_reminder_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  opted_in boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT true,
  reminder_days integer[] NOT NULL DEFAULT ARRAY[14,7,3,1],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreement_reminder_preferences TO authenticated;
GRANT ALL ON public.agreement_reminder_preferences TO service_role;

ALTER TABLE public.agreement_reminder_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own agreement reminder preferences"
ON public.agreement_reminder_preferences
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view agreement reminder preferences"
ON public.agreement_reminder_preferences
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.validate_agreement_reminder_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE d integer;
BEGIN
  IF array_length(NEW.reminder_days, 1) IS NULL THEN
    NEW.reminder_days := ARRAY[]::integer[];
  END IF;
  FOREACH d IN ARRAY NEW.reminder_days LOOP
    IF d NOT IN (14, 7, 3, 1) THEN
      RAISE EXCEPTION 'Reminder days must be one of 14, 7, 3 or 1' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_agreement_reminder_days
BEFORE INSERT OR UPDATE ON public.agreement_reminder_preferences
FOR EACH ROW EXECUTE FUNCTION public.validate_agreement_reminder_days();