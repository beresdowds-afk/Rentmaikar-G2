ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}'::text[];

DROP POLICY IF EXISTS "Vehicle photos are publicly viewable" ON storage.objects;
CREATE POLICY "Vehicle photos are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "Admins can manage vehicle photos" ON storage.objects;
CREATE POLICY "Admins can manage vehicle photos"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'vehicle-photos' AND public.is_admin())
WITH CHECK (bucket_id = 'vehicle-photos' AND public.is_admin());