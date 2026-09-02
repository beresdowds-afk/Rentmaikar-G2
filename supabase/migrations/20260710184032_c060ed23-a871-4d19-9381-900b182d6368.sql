
-- 1) Storage: enforce ownership on incident-photos INSERT
DROP POLICY IF EXISTS "Drivers can upload incident photos" ON storage.objects;
CREATE POLICY "Drivers can upload incident photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'incident-photos'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.vehicle_incidents vi
      WHERE (storage.foldername(name))[1] = vi.id::text
        AND (vi.driver_id = auth.uid() OR vi.owner_id = auth.uid())
    )
  )
);

-- 2) faq_items: non-public entries should be admin-only
DROP POLICY IF EXISTS "Authenticated users can view non-public FAQ items" ON public.faq_items;
CREATE POLICY "Admins can view non-public FAQ items"
ON public.faq_items
FOR SELECT
TO authenticated
USING (is_active = true AND is_public = false AND public.is_admin());

-- 3) Revoke authenticated EXECUTE on SECURITY DEFINER helpers not referenced by RLS
REVOKE EXECUTE ON FUNCTION public.assistant_can_access_user(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_admin_assistant_permission(uuid, text) FROM authenticated;
