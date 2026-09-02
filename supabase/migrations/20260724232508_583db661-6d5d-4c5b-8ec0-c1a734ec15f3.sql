
CREATE OR REPLACE FUNCTION public.log_user_public_uuid_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.public_uuid IS NULL THEN
    NEW.public_uuid := gen_random_uuid();
  END IF;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = NEW.user_id
  LIMIT 1;

  INSERT INTO public.user_uuid_assignments (user_id, public_uuid, role, source)
  VALUES (NEW.user_id, NEW.public_uuid, v_role, 'trigger')
  ON CONFLICT (public_uuid) DO NOTHING;

  RETURN NEW;
END;
$$;
