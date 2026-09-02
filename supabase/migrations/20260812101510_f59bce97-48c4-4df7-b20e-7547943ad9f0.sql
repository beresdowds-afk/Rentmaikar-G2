DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_features',
    'platform_feature_overrides',
    'platform_kv_settings',
    'faq_items',
    'faq_categories',
    'tour_step_configs',
    'subscription_plans',
    'vehicles',
    'admin_notifications',
    'region_localized_content'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;