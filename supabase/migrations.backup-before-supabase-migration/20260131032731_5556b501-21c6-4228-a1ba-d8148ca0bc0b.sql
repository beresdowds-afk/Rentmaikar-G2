-- Security Fix: Tighten applications table RLS policies

-- Step 1: Drop the overly permissive anon INSERT policy
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;

-- Step 2: Create authenticated-only INSERT policy
CREATE POLICY "Authenticated users can submit applications"
ON public.applications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Step 3: Add unique constraint to prevent duplicate pending applications from same email
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_email_pending 
ON public.applications(email) 
WHERE status = 'pending';