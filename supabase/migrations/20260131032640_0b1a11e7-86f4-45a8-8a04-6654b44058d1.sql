-- Security Fix: Make storage buckets private and add proper RLS policies

-- Step 1: Make incident-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'incident-photos';

-- Step 2: Make weekly-inspection-photos bucket private  
UPDATE storage.buckets SET public = false WHERE id = 'weekly-inspection-photos';

-- Step 3: Drop overly permissive storage policies
DROP POLICY IF EXISTS "Anyone can view incident photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view inspection photos" ON storage.objects;

-- Step 4: Create restrictive RLS policies for incident-photos
-- Only drivers who reported the incident, owners of the vehicle, or admins can view
CREATE POLICY "Authorized users can view incident photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'incident-photos' AND
  (
    -- Admin access
    public.is_admin() OR
    -- Check if user is the driver or owner of the incident
    EXISTS (
      SELECT 1 FROM public.vehicle_incidents vi
      WHERE (storage.foldername(name))[1] = vi.id::text
      AND (vi.driver_id = auth.uid() OR vi.owner_id = auth.uid())
    )
  )
);

-- Step 5: Create restrictive RLS policies for weekly-inspection-photos
-- Only the user who uploaded (folder owner) or admins can view
CREATE POLICY "Authorized users can view inspection photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'weekly-inspection-photos' AND
  (
    -- Admin access
    public.is_admin() OR
    -- User's own folder (user_id is first folder segment)
    auth.uid()::text = (storage.foldername(name))[1]
  )
);

-- Step 6: Fix iot_device_orders RLS - ensure only owner and admin can access
-- First drop existing policies that may be too permissive
DROP POLICY IF EXISTS "Owners can view their own orders" ON public.iot_device_orders;

-- Recreate with explicit owner check
CREATE POLICY "Owners can only view their own orders"
ON public.iot_device_orders FOR SELECT
TO authenticated
USING (owner_id = auth.uid() OR public.is_admin());