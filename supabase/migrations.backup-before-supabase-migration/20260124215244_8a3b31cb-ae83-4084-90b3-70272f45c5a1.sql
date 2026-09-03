-- Create role audit log table
CREATE TABLE public.role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'role_assigned', 'role_changed', 'role_removed')),
  old_role app_role,
  new_role app_role,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view role audit logs"
ON public.role_audit_log
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Only admins can insert audit logs
CREATE POLICY "Admins can insert role audit logs"
ON public.role_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());