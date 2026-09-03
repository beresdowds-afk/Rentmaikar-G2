-- Add RLS policies for owners on price_negotiations table
CREATE POLICY "Owners can view negotiations for their vehicles" 
ON public.price_negotiations 
FOR SELECT 
USING (owner_id = auth.uid());

CREATE POLICY "Owners can create negotiations for their vehicles" 
ON public.price_negotiations 
FOR INSERT 
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update pending negotiations" 
ON public.price_negotiations 
FOR UPDATE 
USING ((owner_id = auth.uid()) AND (status = 'pending') AND (is_locked = false));