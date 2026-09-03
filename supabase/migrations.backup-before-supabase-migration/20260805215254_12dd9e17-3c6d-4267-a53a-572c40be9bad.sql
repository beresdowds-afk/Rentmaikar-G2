DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- users / CRM
      ('profiles','can_view_users'),
      ('user_roles','can_view_users'),
      ('applications','can_view_users'),
      ('user_uuid_assignments','can_view_users'),
      ('rideshare_profile_submissions','can_view_users'),
      ('referee_verifications','can_view_users'),
      ('user_documents','can_view_users'),
      -- vehicles
      ('vehicles','can_view_vehicles'),
      ('vehicle_incidents','can_view_vehicles'),
      ('vehicle_recalls','can_view_vehicles'),
      -- rentals
      ('rentals','can_view_rentals'),
      ('rent_to_own_agreements','can_view_rentals'),
      ('rent_to_own_listings','can_view_rentals'),
      ('legal_agreements','can_view_rentals'),
      ('price_negotiations','can_view_rentals'),
      -- payments
      ('payments','can_view_payments'),
      ('invoices','can_view_payments'),
      ('receipts','can_view_payments'),
      ('owner_earnings','can_view_payments'),
      ('owner_payouts','can_view_payments'),
      ('payment_defaults','can_view_payments'),
      ('user_subscriptions','can_view_payments'),
      ('driver_proxy_billing_accounts','can_view_payments'),
      -- support
      ('support_tasks','can_view_support_tasks'),
      ('support_task_updates','can_view_support_tasks'),
      ('expiry_notifications','can_view_support_tasks'),
      -- iot
      ('iot_devices','can_view_iot'),
      ('iot_sim_cards','can_view_iot'),
      ('iot_device_orders','can_view_iot'),
      ('driver_behavior_logs','can_view_iot'),
      ('mqtt_telemetry_logs','can_view_iot'),
      ('vehicle_geofences','can_view_iot'),
      -- communications
      ('inbox_conversations','can_view_communications'),
      ('inbox_messages','can_view_communications'),
      ('unified_message_log','can_view_communications'),
      ('email_logs','can_view_communications'),
      -- reports
      ('weekly_inspection_reports','can_view_reports'),
      ('vehicle_analytics_events','can_view_reports'),
      -- audit
      ('admin_audit_log','can_view_audit_log'),
      ('role_audit_log','can_view_audit_log'),
      ('application_audit_log','can_view_audit_log'),
      ('onboarding_stage_audit','can_view_audit_log'),
      -- content (read for everyone with content permission)
      ('faq_items','can_manage_content'),
      ('faq_categories','can_manage_content'),
      ('training_modules','can_manage_content'),
      ('policy_versions','can_manage_content')
    ) AS t(tbl, perm)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'Assistants view ' || r.tbl, r.tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_admin_privilege(auth.uid(), %L))',
      'Assistants view ' || r.tbl, r.tbl, r.perm
    );
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.tbl);
  END LOOP;
END;
$$;

-- Content managers may also create/edit the content catalogues.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['faq_items','faq_categories','training_modules','policy_versions'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Assistants insert ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Assistants update ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_admin_privilege(auth.uid(), ''can_manage_content''))',
      'Assistants insert ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_admin_privilege(auth.uid(), ''can_manage_content'')) WITH CHECK (public.has_admin_privilege(auth.uid(), ''can_manage_content''))',
      'Assistants update ' || t, t);
    EXECUTE format('GRANT INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END;
$$;

-- Support-task managers may progress the tasks they can see.
DROP POLICY IF EXISTS "Assistants update support tasks" ON public.support_tasks;
CREATE POLICY "Assistants update support tasks"
  ON public.support_tasks FOR UPDATE TO authenticated
  USING (public.has_admin_privilege(auth.uid(), 'can_manage_support_tasks'))
  WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_manage_support_tasks'));

DROP POLICY IF EXISTS "Assistants add support task updates" ON public.support_task_updates;
CREATE POLICY "Assistants add support task updates"
  ON public.support_task_updates FOR INSERT TO authenticated
  WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_manage_support_tasks'));