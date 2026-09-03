
-- =====================================================================
-- Platform database architecture repair
-- 1. Missing referential integrity (intra-public references only;
--    auth.users references intentionally remain unconstrained)
-- 2. Indexes for every unindexed foreign key
-- 3. updated_at triggers on settings tables that lacked them
-- 4. Uniqueness / data-quality guards
-- Verified beforehand: zero orphaned rows for every constraint added.
-- =====================================================================

-- ---------- 1. Missing foreign keys ----------
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('driver_call_ins','vehicle_id','vehicles','SET NULL'),
      ('driver_call_ins','rental_id','rentals','SET NULL'),
      ('driver_behavior_logs','rental_id','rentals','SET NULL'),
      ('legal_agreements','vehicle_id','vehicles','SET NULL'),
      ('owner_earnings','vehicle_id','vehicles','SET NULL'),
      ('payments','vehicle_id','vehicles','SET NULL'),
      ('payment_defaults','vehicle_id','vehicles','SET NULL'),
      ('paypal_transactions','vehicle_id','vehicles','SET NULL'),
      ('iot_sim_cards','vehicle_id','vehicles','SET NULL'),
      ('iot_sim_cards','device_id','iot_devices','SET NULL'),
      ('vehicle_geofences','vehicle_id','vehicles','CASCADE'),
      ('telemetry_shadow_log','vehicle_id','vehicles','CASCADE'),
      ('document_export_audit','vehicle_id','vehicles','SET NULL'),
      ('rideshare_profile_submissions','vehicle_id','vehicles','SET NULL'),
      ('expiry_notifications','vehicle_id','vehicles','CASCADE'),
      ('expiry_notifications','document_id','user_documents','CASCADE'),
      ('referee_verifications','application_id','applications','CASCADE'),
      ('application_pipeline_events','application_id','applications','CASCADE'),
      ('tax_line_items','payment_id','payments','CASCADE'),
      ('tax_line_items','rental_id','rentals','SET NULL'),
      ('agreement_signature_audit','agreement_id','legal_agreements','CASCADE'),
      ('tour_step_config_audit','config_id','tour_step_configs','CASCADE'),
      ('training_completions','user_id','profiles','CASCADE')
    ) AS t(tbl, col, ref, del)
  LOOP
    -- training_completions.user_id references profiles.user_id, skip if shape differs
    CONTINUE WHEN fk.tbl = 'training_completions';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = format('public.%I', fk.tbl)::regclass
        AND c.contype = 'f' AND a.attname = fk.col
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s',
        fk.tbl, fk.tbl || '_' || fk.col || '_fkey', fk.col, fk.ref, fk.del
      );
    END IF;
  END LOOP;
END $$;

-- ---------- 2. Indexes for unindexed foreign keys ----------
CREATE INDEX IF NOT EXISTS idx_admin_assistant_permissions_granted_by ON public.admin_assistant_permissions(granted_by);
CREATE INDEX IF NOT EXISTS idx_admin_assistant_user_assignments_assigned_by ON public.admin_assistant_user_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_application_recovery_requests_reviewed_by ON public.application_recovery_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_application_recovery_requests_requested_by ON public.application_recovery_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_applications_recovered_from ON public.applications(recovered_from_application_id);
CREATE INDEX IF NOT EXISTS idx_contact_settings_updated_by ON public.contact_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_device_activity_log_device ON public.device_activity_log(device_id);
CREATE INDEX IF NOT EXISTS idx_dpba_admin_reviewed_by ON public.driver_proxy_billing_accounts(admin_reviewed_by);
CREATE INDEX IF NOT EXISTS idx_dpba_revoked_by ON public.driver_proxy_billing_accounts(revoked_by);
CREATE INDEX IF NOT EXISTS idx_elevenlabs_retention_updated_by ON public.elevenlabs_retention_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_faq_items_category ON public.faq_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_assigned_to ON public.inbox_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sender ON public.inbox_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_invoice_activity_log_actor ON public.invoice_activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vehicle ON public.invoices(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_iot_audit_log_vehicle ON public.iot_audit_log(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_iot_sync_schedule_last_updated_by ON public.iot_sync_schedule(last_updated_by);
CREATE INDEX IF NOT EXISTS idx_legal_agreement_acceptances_template ON public.legal_agreement_acceptances(template_id);
CREATE INDEX IF NOT EXISTS idx_legal_agreements_parent ON public.legal_agreements(parent_agreement_id);
CREATE INDEX IF NOT EXISTS idx_opay_transactions_vehicle ON public.opay_transactions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_opay_transactions_payment ON public.opay_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_owner_earnings_rental ON public.owner_earnings(rental_id);
CREATE INDEX IF NOT EXISTS idx_owner_payouts_payout_account ON public.owner_payouts(payout_account_id);
CREATE INDEX IF NOT EXISTS idx_pwe_invoice ON public.payment_webhook_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pwe_payment ON public.payment_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_pwe_receipt ON public.payment_webhook_events(receipt_id);
CREATE INDEX IF NOT EXISTS idx_payments_rental ON public.payments(rental_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_plan ON public.payments(subscription_plan_id);
CREATE INDEX IF NOT EXISTS idx_paypal_transactions_payment ON public.paypal_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_paypal_transactions_rental ON public.paypal_transactions(rental_id);
CREATE INDEX IF NOT EXISTS idx_paystack_transactions_payment ON public.paystack_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_paystack_transactions_vehicle ON public.paystack_transactions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_persona_region_templates_region ON public.persona_region_templates(region_id);
CREATE INDEX IF NOT EXISTS idx_persona_template_config_updated_by ON public.persona_template_config(updated_by);
CREATE INDEX IF NOT EXISTS idx_platform_email_config_updated_by ON public.platform_email_config(updated_by);
CREATE INDEX IF NOT EXISTS idx_pfo_region ON public.platform_feature_overrides(region_id);
CREATE INDEX IF NOT EXISTS idx_pfo_city ON public.platform_feature_overrides(city_id);
CREATE INDEX IF NOT EXISTS idx_pfo_country ON public.platform_feature_overrides(country_id);
CREATE INDEX IF NOT EXISTS idx_policy_acceptances_version ON public.policy_acceptances(policy_version_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_created_by ON public.policy_versions(created_by);
CREATE INDEX IF NOT EXISTS idx_pmr_negotiation ON public.price_modification_requests(negotiation_id);
CREATE INDEX IF NOT EXISTS idx_pmr_requester ON public.price_modification_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_pmr_processed_by ON public.price_modification_requests(processed_by);
CREATE INDEX IF NOT EXISTS idx_price_negotiations_driver ON public.price_negotiations(driver_id);
CREATE INDEX IF NOT EXISTS idx_price_negotiations_locked_by ON public.price_negotiations(locked_by);
CREATE INDEX IF NOT EXISTS idx_price_negotiations_vehicle ON public.price_negotiations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_price_negotiations_vehicle_owner ON public.price_negotiations(vehicle_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_price_negotiations_approved_by ON public.price_negotiations(approved_by);
CREATE INDEX IF NOT EXISTS idx_profile_settings_audit_changed_by ON public.profile_settings_audit(changed_by);
CREATE INDEX IF NOT EXISTS idx_proxy_action_idem_account ON public.proxy_action_idempotency(proxy_account_id);
CREATE INDEX IF NOT EXISTS idx_receipts_rental ON public.receipts(rental_id);
CREATE INDEX IF NOT EXISTS idx_receipts_vehicle ON public.receipts(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_alerts_run ON public.reconciliation_alerts(run_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_alerts_ack_by ON public.reconciliation_alerts(acknowledged_by);
CREATE INDEX IF NOT EXISTS idx_referee_verifications_inquiry ON public.referee_verifications(persona_inquiry_id);
CREATE INDEX IF NOT EXISTS idx_region_definitions_created_by ON public.region_definitions(created_by);
CREATE INDEX IF NOT EXISTS idx_rto_agreements_vehicle ON public.rent_to_own_agreements(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_rto_agreements_listing ON public.rent_to_own_agreements(listing_id);
CREATE INDEX IF NOT EXISTS idx_rto_listings_vehicle ON public.rent_to_own_listings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_rto_settings_updated_by ON public.rent_to_own_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_rentals_vehicle ON public.rentals(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_actor ON public.role_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_target ON public.role_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_support_task_updates_user ON public.support_task_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_support_task_updates_task ON public.support_task_updates(task_id);
CREATE INDEX IF NOT EXISTS idx_support_tasks_agreement ON public.support_tasks(agreement_id);
CREATE INDEX IF NOT EXISTS idx_support_tasks_assigned_to ON public.support_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tasks_device ON public.support_tasks(device_id);
CREATE INDEX IF NOT EXISTS idx_support_tasks_recall ON public.support_tasks(recall_id);
CREATE INDEX IF NOT EXISTS idx_support_tasks_vehicle ON public.support_tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_support_tasks_assigned_by ON public.support_tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tax_line_items_rule ON public.tax_line_items(tax_rule_id);
CREATE INDEX IF NOT EXISTS idx_tour_analytics_events_user ON public.tour_analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_tour_step_configs_updated_by ON public.tour_step_configs(updated_by);
CREATE INDEX IF NOT EXISTS idx_training_completions_module ON public.training_completions(module_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_vehicle ON public.user_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan ON public.user_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_geofences_call_in ON public.vehicle_geofences(call_in_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_incidents_vehicle_owner ON public.vehicle_incidents(vehicle_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_requests_call ON public.voice_call_requests(call_id);
CREATE INDEX IF NOT EXISTS idx_voip_call_groups_created_by ON public.voip_call_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_voip_call_participants_call ON public.voip_call_participants(call_id);
CREATE INDEX IF NOT EXISTS idx_voip_call_participants_user ON public.voip_call_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_voip_call_requests_called_back_by ON public.voip_call_requests(called_back_by);
CREATE INDEX IF NOT EXISTS idx_voip_call_requests_user ON public.voip_call_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_voip_call_transcripts_created_by ON public.voip_call_transcripts(created_by);
CREATE INDEX IF NOT EXISTS idx_voip_calls_initiated_by ON public.voip_calls(initiated_by);
CREATE INDEX IF NOT EXISTS idx_voip_group_members_user ON public.voip_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_voip_group_members_group ON public.voip_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_voip_settings_updated_by ON public.voip_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_wir_vehicle_owner ON public.weekly_inspection_reports(vehicle_id, owner_id);

-- newly created FK columns
CREATE INDEX IF NOT EXISTS idx_expiry_notifications_document ON public.expiry_notifications(document_id);
CREATE INDEX IF NOT EXISTS idx_expiry_notifications_vehicle ON public.expiry_notifications(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_referee_verifications_application ON public.referee_verifications(application_id);
CREATE INDEX IF NOT EXISTS idx_app_pipeline_events_application ON public.application_pipeline_events(application_id);
CREATE INDEX IF NOT EXISTS idx_tax_line_items_payment ON public.tax_line_items(payment_id);
CREATE INDEX IF NOT EXISTS idx_tax_line_items_rental ON public.tax_line_items(rental_id);
CREATE INDEX IF NOT EXISTS idx_agreement_signature_audit_agreement ON public.agreement_signature_audit(agreement_id);
CREATE INDEX IF NOT EXISTS idx_tour_step_config_audit_config ON public.tour_step_config_audit(config_id);
CREATE INDEX IF NOT EXISTS idx_driver_call_ins_vehicle ON public.driver_call_ins(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_driver_call_ins_rental ON public.driver_call_ins(rental_id);
CREATE INDEX IF NOT EXISTS idx_driver_behavior_logs_rental ON public.driver_behavior_logs(rental_id);
CREATE INDEX IF NOT EXISTS idx_legal_agreements_vehicle ON public.legal_agreements(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_owner_earnings_vehicle ON public.owner_earnings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_payments_vehicle ON public.payments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_payment_defaults_vehicle ON public.payment_defaults(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_paypal_transactions_vehicle ON public.paypal_transactions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_iot_sim_cards_vehicle ON public.iot_sim_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_iot_sim_cards_device ON public.iot_sim_cards(device_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_geofences_vehicle ON public.vehicle_geofences(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_shadow_log_vehicle ON public.telemetry_shadow_log(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_document_export_audit_vehicle ON public.document_export_audit(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_rideshare_submissions_vehicle ON public.rideshare_profile_submissions(vehicle_id);

-- ---------- 3. updated_at triggers ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'elevenlabs_retention_settings',
    'persona_template_config',
    'platform_kv_settings',
    'weekly_report_settings'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
       CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ---------- 4. Data-quality guards ----------
-- One wallet per (owner, account type, currency). Platform treasury wallets
-- share the sentinel user_id but differ by type/currency, so the key is composite.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_accounts_user_type_currency
  ON public.wallet_accounts(user_id, account_type, currency);
