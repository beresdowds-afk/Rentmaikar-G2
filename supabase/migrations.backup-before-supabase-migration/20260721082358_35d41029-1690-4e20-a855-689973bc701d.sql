
-- 1. Readability columns on the audit table (UUIDs remain primary references)
ALTER TABLE public.profile_settings_audit
  ADD COLUMN IF NOT EXISTS subject_name text,
  ADD COLUMN IF NOT EXISTS actor_name text;

-- 2. Fix trigger: use NEW.user_id (auth.users id) instead of NEW.id (profile row id)
CREATE OR REPLACE FUNCTION public.log_profile_settings_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  subject UUID;
  actor UUID;
  subject_display TEXT;
  actor_display TEXT;
BEGIN
  subject := NEW.user_id;
  actor := COALESCE(auth.uid(), NEW.user_id);
  subject_display := COALESCE(NEW.full_name, OLD.full_name);

  IF actor = subject THEN
    actor_display := subject_display;
  ELSE
    SELECT full_name INTO actor_display FROM public.profiles WHERE user_id = actor LIMIT 1;
  END IF;

  IF subject IS NULL THEN
    -- Cannot audit without a valid auth user id; skip silently to avoid blocking the write.
    RETURN NEW;
  END IF;

  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source, subject_name, actor_name)
    VALUES (subject, actor, 'full_name', 'updated', OLD.full_name, NEW.full_name, 'trigger', subject_display, actor_display);
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source, subject_name, actor_name)
    VALUES (subject, actor, 'phone', 'updated', OLD.phone, NEW.phone, 'trigger', subject_display, actor_display);
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source, subject_name, actor_name)
    VALUES (subject, actor, 'email', 'updated', OLD.email, NEW.email, 'trigger', subject_display, actor_display);
  END IF;

  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source, subject_name, actor_name)
    VALUES (
      subject, actor, 'avatar_url',
      CASE
        WHEN OLD.avatar_url IS NULL AND NEW.avatar_url IS NOT NULL THEN 'uploaded'
        WHEN OLD.avatar_url IS NOT NULL AND NEW.avatar_url IS NULL THEN 'removed'
        ELSE 'replaced'
      END,
      OLD.avatar_url, NEW.avatar_url, 'trigger', subject_display, actor_display
    );
  END IF;

  IF NEW.identity_verification_status IS DISTINCT FROM OLD.identity_verification_status THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source, subject_name, actor_name)
    VALUES (subject, actor, 'identity_verification_status', 'updated',
            OLD.identity_verification_status, NEW.identity_verification_status, 'trigger', subject_display, actor_display);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_profile_settings_changes() FROM PUBLIC, anon;

-- 3. Persona template config
CREATE TABLE IF NOT EXISTS public.persona_template_config (
  subject_role text PRIMARY KEY
    CHECK (subject_role IN ('driver','owner','referee','proxy','admin_assistant','support_staff')),
  template_id text NOT NULL,
  environment_id text,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.persona_template_config TO authenticated;
GRANT ALL ON public.persona_template_config TO service_role;

ALTER TABLE public.persona_template_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage persona template config"
  ON public.persona_template_config
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_persona_template_config()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_persona_template_config ON public.persona_template_config;
CREATE TRIGGER trg_touch_persona_template_config
  BEFORE UPDATE ON public.persona_template_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_persona_template_config();

-- Seed defaults from existing hard-coded mapping (idempotent)
INSERT INTO public.persona_template_config (subject_role, template_id) VALUES
  ('driver',           'itmpl_As49Kz1t61PoxLPDXCPBzcbHXZhrzW'),
  ('owner',            'itmpl_As49Kz1CuM9iVGdfhwWvR8AZe7ShLA'),
  ('referee',          'itmpl_As49Kz1ryTH3yu3AVUJiwa2CuSgscY'),
  ('proxy',            'itmpl_As49Kz1dvgymYmjWVUYM27nivb2bco'),
  ('support_staff',    'itmpl_As49Kz1dvgymYmjWVUYM27nivb2bco'),
  ('admin_assistant',  'itmpl_As49Kz1ryTH3yu3AVUJiwa2CuSgscY')
ON CONFLICT (subject_role) DO NOTHING;
