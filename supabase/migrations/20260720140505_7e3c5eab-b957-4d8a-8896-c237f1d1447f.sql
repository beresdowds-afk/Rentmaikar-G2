
-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.profile_settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  field TEXT NOT NULL,
  action TEXT NOT NULL, -- 'updated' | 'uploaded' | 'replaced' | 'removed'
  old_value TEXT,
  new_value TEXT,
  source TEXT, -- 'web' | 'ios' | 'android' | 'trigger'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_settings_audit_user_created
  ON public.profile_settings_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_settings_audit_field
  ON public.profile_settings_audit(field);

GRANT SELECT, INSERT ON public.profile_settings_audit TO authenticated;
GRANT ALL ON public.profile_settings_audit TO service_role;

ALTER TABLE public.profile_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit entries"
  ON public.profile_settings_audit FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own audit entries"
  ON public.profile_settings_audit FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all audit entries"
  ON public.profile_settings_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Trigger on profiles that records changes for tracked columns
CREATE OR REPLACE FUNCTION public.log_profile_settings_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID;
BEGIN
  actor := COALESCE(auth.uid(), NEW.id);

  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source)
    VALUES (NEW.id, actor, 'full_name', 'updated', OLD.full_name, NEW.full_name, 'trigger');
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source)
    VALUES (NEW.id, actor, 'phone', 'updated', OLD.phone, NEW.phone, 'trigger');
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source)
    VALUES (NEW.id, actor, 'email', 'updated', OLD.email, NEW.email, 'trigger');
  END IF;

  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source)
    VALUES (
      NEW.id,
      actor,
      'avatar_url',
      CASE
        WHEN OLD.avatar_url IS NULL AND NEW.avatar_url IS NOT NULL THEN 'uploaded'
        WHEN OLD.avatar_url IS NOT NULL AND NEW.avatar_url IS NULL THEN 'removed'
        ELSE 'replaced'
      END,
      OLD.avatar_url,
      NEW.avatar_url,
      'trigger'
    );
  END IF;

  IF NEW.identity_verification_status IS DISTINCT FROM OLD.identity_verification_status THEN
    INSERT INTO public.profile_settings_audit (user_id, changed_by, field, action, old_value, new_value, source)
    VALUES (NEW.id, actor, 'identity_verification_status', 'updated',
            OLD.identity_verification_status, NEW.identity_verification_status, 'trigger');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_settings_changes ON public.profiles;
CREATE TRIGGER trg_log_profile_settings_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_settings_changes();
