
CREATE POLICY "users read own document exports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'document-exports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "admins read all document exports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'document-exports'
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'admin_assistant'::app_role))
  );

CREATE POLICY "users delete own document exports"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'document-exports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
