ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_kind_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_kind_check
  CHECK (
    kind IS NOT NULL
    AND length(btrim(kind)) > 0
    AND length(kind) <= 100
  );