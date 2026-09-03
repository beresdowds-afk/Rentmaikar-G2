-- profile-photos is now a PRIVATE bucket. Reads previously relied on public
-- bucket access; add an explicit SELECT policy so owners can mint signed URLs
-- and admins/assistants can review passport pictures.
DROP POLICY IF EXISTS profile_photos_select_own ON storage.objects;
CREATE POLICY profile_photos_select_own
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin_assistant'::public.app_role)
  )
);