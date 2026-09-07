CREATE TABLE IF NOT EXISTS public.admin_assistant_user_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assistant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_assistant_user_assignment_assistant_id_target_user_id_key
    UNIQUE (assistant_id, target_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_assistant_user_assignments TO authenticated;
GRANT ALL ON public.admin_assistant_user_assignments TO service_role;

ALTER TABLE public.admin_assistant_user_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.admin_assistant_user_assignments'::regclass AND polname='Admins manage assistant user assignments') THEN
    CREATE POLICY "Admins manage assistant user assignments"
      ON public.admin_assistant_user_assignments FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.admin_assistant_user_assignments'::regclass AND polname='Assistants view their own assignments') THEN
    CREATE POLICY "Assistants view their own assignments"
      ON public.admin_assistant_user_assignments FOR SELECT TO authenticated
      USING (assistant_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_aaua_assistant ON public.admin_assistant_user_assignments (assistant_id);
CREATE INDEX IF NOT EXISTS idx_aaua_target ON public.admin_assistant_user_assignments (target_user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_assistant_user_assignments'::regclass AND tgname='update_aaua_updated_at') THEN
    CREATE TRIGGER update_aaua_updated_at
      BEFORE UPDATE ON public.admin_assistant_user_assignments
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Authoritative definition, exactly as pg_get_functiondef() returns it on the
-- original RentMaikar database. Do not alter the security semantics.
CREATE OR REPLACE FUNCTION public.assistant_can_access_user(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_assistant_user_assignments
    WHERE assistant_id = auth.uid() AND target_user_id = _target
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.assistant_can_access_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_can_access_user(uuid) TO authenticated, service_role;