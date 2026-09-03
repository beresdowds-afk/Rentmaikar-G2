-- Make training-media bucket private (authenticated access only)
UPDATE storage.buckets 
SET public = false 
WHERE id = 'training-media';

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Anyone can view training media" ON storage.objects;

-- Add authenticated-only read policy
CREATE POLICY "Authenticated users can view training media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'training-media' AND
  auth.uid() IS NOT NULL
);
