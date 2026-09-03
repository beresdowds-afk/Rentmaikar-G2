
-- 1. Anon must be able to *evaluate* is_admin() when RLS policies reference it.
--    The function is SECURITY DEFINER and simply returns false for a signed-out
--    caller, so granting EXECUTE is safe and does NOT grant admin privileges.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- 2. Public read for active regional contact settings (footer / support links).
--    Only exposes rows explicitly marked is_active = true.
DROP POLICY IF EXISTS "Public can view active contact settings" ON public.contact_settings;
CREATE POLICY "Public can view active contact settings"
ON public.contact_settings
FOR SELECT
TO anon, authenticated
USING (is_active = true);

GRANT SELECT ON public.contact_settings TO anon;
