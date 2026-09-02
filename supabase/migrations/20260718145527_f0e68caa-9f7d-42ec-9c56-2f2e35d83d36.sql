
-- Revoke PUBLIC (which anon inherits) from privileged security-definer functions
REVOKE EXECUTE ON FUNCTION public.register_push_device(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_review_proxy_billing(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_elevenlabs_retention(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_elevenlabs_test_log(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_voice_agent_transcript(text, text, text, jsonb, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_proxy_billing(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_elevenlabs_test_logs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_user_subscription(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_push_device_prefs(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.driver_update_proxy_terms(uuid, text, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sign_legal_agreement(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sign_rent_to_own_agreement(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_owner_available_balance(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_proxy_charge(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.driver_request_rental_extension(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_onboarding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_application(uuid, text) FROM PUBLIC;

-- Grant back to authenticated so signed-in users/admin can still call them
GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_proxy_billing(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_elevenlabs_retention(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_elevenlabs_test_log(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_voice_agent_transcript(text, text, text, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_proxy_billing(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_user_subscription(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_push_device_prefs(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_update_proxy_terms(uuid, text, timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_legal_agreement(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_rent_to_own_agreement(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_available_balance(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_proxy_charge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_request_rental_extension(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_application(uuid, text) TO authenticated;

-- Trigger functions: revoke from PUBLIC (they only need to run via trigger owner)
REVOKE EXECUTE ON FUNCTION public.enforce_proxy_billing_column_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_proxy_billing_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_proxy_state_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_legal_agreement_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_rto_agreement_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_application_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_generate_receipt_from_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_invoice_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._enforce_single_active_subscription() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_elevenlabs_test_logs() FROM authenticated;
