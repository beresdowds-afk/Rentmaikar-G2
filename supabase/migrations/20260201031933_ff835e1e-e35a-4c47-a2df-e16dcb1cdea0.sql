-- Drop the old INSERT policy that requires authentication
DROP POLICY IF EXISTS "Authenticated users can submit applications" ON public.applications;

-- Create a new policy that allows anyone to submit applications
-- This is necessary because the registration forms are public-facing
CREATE POLICY "Anyone can submit applications"
ON public.applications
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- Prevent duplicate pending applications from the same email
  NOT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.email = email
      AND a.status IN ('pending', 'under_review')
  )
);