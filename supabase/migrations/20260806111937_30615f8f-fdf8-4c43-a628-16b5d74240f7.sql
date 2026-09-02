UPDATE public.profiles p
SET access_level = 'full'::access_level_enum,
    registration_stage = 'approved'::registration_stage_enum,
    updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.user_id
    AND ur.role IN ('admin','admin_assistant','legal_support','iot_support','vehicle_support')
)
AND (p.access_level IS DISTINCT FROM 'full'::access_level_enum
     OR p.registration_stage IS DISTINCT FROM 'approved'::registration_stage_enum);