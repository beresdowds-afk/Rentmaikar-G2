-- ==============================================================================
-- Hardens public.event_deep_link with comprehensive table coverage, role safety,
-- search_path isolation, and frontend URL/tab synchronization.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.event_deep_link(_table text, _record_id text, _recipient uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_table text := lower(btrim(COALESCE(_table, '')));
  v_record text := btrim(COALESCE(_record_id, ''));
  v_is_staff boolean := FALSE;
  v_role text;
  v_path text;
BEGIN
  -- 1. Determine staff eligibility safely
  IF _recipient IS NOT NULL THEN
    v_is_staff := COALESCE(public.is_admin(_recipient), false)
                  OR EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = _recipient
                      AND ur.role::text IN (
                        'admin',
                        'admin_assistant',
                        'legal_support',
                        'iot_support',
                        'vehicle_support',
                        'finance_admin',
                        'superadmin'
                      )
                  );
  END IF;

  -- 2. Staff routing
  IF v_is_staff THEN
    v_path := CASE v_table
      WHEN 'applications' THEN '/admin?portal=crm&tab=applications'
      WHEN 'invoices' THEN '/admin?portal=crm&tab=billing'
      WHEN 'payments' THEN '/admin/payments'
      WHEN 'rentals' THEN '/admin/rental-reconciliation'
      WHEN 'user_subscriptions' THEN '/admin?portal=crm&tab=subscriptions'
      WHEN 'subscriptions' THEN '/admin?portal=crm&tab=subscriptions'
      WHEN 'legal_agreements' THEN '/admin?portal=crm&tab=legal-agreements'
      WHEN 'rent_to_own_agreements' THEN '/admin?portal=crm&tab=rent-to-own'
      WHEN 'price_negotiations' THEN '/admin?portal=crm&tab=negotiations'
      WHEN 'vehicle_booking_requests' THEN '/admin?portal=crm&tab=approvals'
      WHEN 'booking_requests' THEN '/admin?portal=crm&tab=approvals'
      WHEN 'vehicles' THEN '/admin/vehicle-queue'
      WHEN 'owner_payouts' THEN '/admin/treasury'
      WHEN 'payouts' THEN '/admin/treasury'
      WHEN 'withdrawal_authorizations' THEN '/admin/treasury'
      WHEN 'withdrawals' THEN '/admin/treasury'
      WHEN 'driver_call_ins' THEN '/admin?portal=operations&tab=call-ins'
      WHEN 'call_ins' THEN '/admin?portal=operations&tab=call-ins'
      WHEN 'incidents' THEN '/admin?portal=operations&tab=incidents'
      WHEN 'support_tasks' THEN '/admin?portal=operations&tab=tasks'
      ELSE '/admin'
    END;

  -- 3. Non-staff or driver/owner routing
  ELSE
    IF _recipient IS NOT NULL THEN
      SELECT ur.role::text INTO v_role
        FROM public.user_roles ur
       WHERE ur.user_id = _recipient
       ORDER BY CASE ur.role::text WHEN 'owner' THEN 1 WHEN 'driver' THEN 2 ELSE 3 END
       LIMIT 1;
    END IF;

    IF v_role = 'owner' THEN
      v_path := CASE v_table
        WHEN 'invoices' THEN '/owner/dashboard?tab=earnings'
        WHEN 'payments' THEN '/owner/dashboard?tab=earnings'
        WHEN 'owner_payouts' THEN '/owner/dashboard?tab=earnings'
        WHEN 'payouts' THEN '/owner/dashboard?tab=earnings'
        WHEN 'withdrawal_authorizations' THEN '/owner/dashboard?tab=withdrawals'
        WHEN 'withdrawals' THEN '/owner/dashboard?tab=withdrawals'
        WHEN 'rentals' THEN '/owner/dashboard?tab=vehicles'
        WHEN 'vehicles' THEN '/owner/dashboard?tab=vehicles'
        WHEN 'rent_to_own_agreements' THEN '/owner/dashboard?tab=rent-to-own'
        WHEN 'legal_agreements' THEN '/owner/dashboard?tab=agreements'
        WHEN 'price_negotiations' THEN '/owner/dashboard?tab=pricing'
        WHEN 'vehicle_booking_requests' THEN '/owner/dashboard?tab=vehicles'
        WHEN 'booking_requests' THEN '/owner/dashboard?tab=vehicles'
        WHEN 'user_subscriptions' THEN '/owner/dashboard?tab=settings'
        WHEN 'subscriptions' THEN '/owner/dashboard?tab=settings'
        WHEN 'driver_call_ins' THEN '/owner/dashboard?tab=call-history'
        WHEN 'call_ins' THEN '/owner/dashboard?tab=call-history'
        WHEN 'incidents' THEN '/owner/dashboard?tab=vehicles'
        WHEN 'applications' THEN '/owner/dashboard?tab=overview'
        ELSE '/owner/dashboard'
      END;
    ELSIF v_role = 'driver' THEN
      v_path := CASE v_table
        WHEN 'invoices' THEN '/driver/dashboard?tab=payments'
        WHEN 'payments' THEN '/driver/dashboard?tab=payments'
        WHEN 'rentals' THEN '/driver/dashboard?tab=overview'
        WHEN 'rent_to_own_agreements' THEN '/driver/dashboard?tab=lease-to-own'
        WHEN 'legal_agreements' THEN '/driver/dashboard?tab=agreements'
        WHEN 'price_negotiations' THEN '/driver/dashboard?tab=negotiate'
        WHEN 'vehicle_booking_requests' THEN '/driver/dashboard?tab=overview'
        WHEN 'booking_requests' THEN '/driver/dashboard?tab=overview'
        WHEN 'user_subscriptions' THEN '/driver/dashboard?tab=subscriptions'
        WHEN 'subscriptions' THEN '/driver/dashboard?tab=subscriptions'
        WHEN 'driver_call_ins' THEN '/driver/dashboard?tab=call-history'
        WHEN 'call_ins' THEN '/driver/dashboard?tab=call-history'
        WHEN 'incidents' THEN '/driver/dashboard?tab=incidents'
        WHEN 'vehicles' THEN '/catalogue/budget'
        WHEN 'applications' THEN '/driver/dashboard?tab=overview'
        ELSE '/driver/dashboard'
      END;
    ELSE
      -- Recipient has no explicit role or is null: infer reasonable default
      IF v_table IN ('vehicles', 'applications', 'owner_payouts', 'withdrawal_authorizations', 'withdrawals') THEN
        v_path := '/admin';
      ELSE
        v_path := '/dashboard';
      END IF;
    END IF;
  END IF;

  -- 4. Append record query parameter when provided
  IF v_record <> '' THEN
    v_path := v_path || CASE WHEN position('?' in v_path) > 0 THEN '&' ELSE '?' END
              || 'record=' || v_record;
  END IF;

  RETURN 'https://rentmaikar.com' || v_path;
END;
$function$;

REVOKE ALL ON FUNCTION public.event_deep_link(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_deep_link(text, text, uuid) TO authenticated, service_role;
