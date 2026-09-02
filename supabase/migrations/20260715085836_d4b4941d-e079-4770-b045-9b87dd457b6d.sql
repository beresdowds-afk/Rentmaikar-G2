
CREATE TABLE public.account_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL,
  user_b_id UUID NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'couple',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_links_distinct CHECK (user_a_id <> user_b_id)
);

-- Canonical ordering so (A,B) and (B,A) don't duplicate
CREATE UNIQUE INDEX account_links_pair_unique
  ON public.account_links (LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id));
CREATE INDEX account_links_user_a_idx ON public.account_links (user_a_id);
CREATE INDEX account_links_user_b_idx ON public.account_links (user_b_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_links TO authenticated;
GRANT ALL ON public.account_links TO service_role;

ALTER TABLE public.account_links ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins manage account links"
  ON public.account_links
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin assistants with can_manage_users can view + manage
CREATE POLICY "Assistants view account links"
  ON public.account_links
  FOR SELECT
  TO authenticated
  USING (public.has_admin_assistant_permission(auth.uid(), 'can_manage_users'));

CREATE POLICY "Assistants insert account links"
  ON public.account_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_admin_assistant_permission(auth.uid(), 'can_manage_users'));

CREATE POLICY "Assistants delete account links"
  ON public.account_links
  FOR DELETE
  TO authenticated
  USING (public.has_admin_assistant_permission(auth.uid(), 'can_manage_users'));

CREATE TRIGGER update_account_links_updated_at
  BEFORE UPDATE ON public.account_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: fetch all user_ids linked to a given user
CREATE OR REPLACE FUNCTION public.get_linked_user_ids(_user_id UUID)
RETURNS TABLE(linked_user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN user_a_id = _user_id THEN user_b_id ELSE user_a_id END
  FROM public.account_links
  WHERE user_a_id = _user_id OR user_b_id = _user_id
$$;
