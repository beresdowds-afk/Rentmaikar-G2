-- 1) Restore EXECUTE for authenticated on locked-down helpers
GRANT EXECUTE ON FUNCTION public.has_admin_assistant_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_can_access_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) TO authenticated;

-- 2) Backfill identity verification for pre-existing profiles so the new
--    gate does not lock out users who onboarded before the identity step.
UPDATE public.profiles
SET
  identity_verification_status = COALESCE(identity_verification_status, 'approved'),
  identity_verified_at = COALESCE(identity_verified_at, now())
WHERE identity_verified_at IS NULL
  AND (identity_verification_status IS NULL OR identity_verification_status = '');
