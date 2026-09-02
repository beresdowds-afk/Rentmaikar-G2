-- Generic notification fanout helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_record_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_label text := TG_ARGV[0];
  v_cols text[] := string_to_array(COALESCE(TG_ARGV[1], ''), ',');
  v_roles text[] := string_to_array(COALESCE(TG_ARGV[2], 'admin,admin_assistant'), ',');
  v_status text := v_new->>'status';
  v_prev text := v_old->>'status';
  v_title text;
  v_body text;
  v_kind text;
  v_recipients uuid[] := ARRAY[]::uuid[];
  v_col text;
  v_val text;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(v_status, '') = COALESCE(v_prev, '') THEN
    RETURN NEW;
  END IF;

  v_kind := TG_TABLE_NAME || CASE WHEN TG_OP = 'INSERT' THEN '_created' ELSE '_status' END;
  v_title := v_label || CASE
    WHEN TG_OP = 'INSERT' THEN ' created'
    ELSE ' ' || COALESCE(replace(v_status, '_', ' '), 'updated')
  END;
  v_body := CASE
    WHEN TG_OP = 'INSERT' THEN v_label || ' ' || COALESCE(v_new->>'id', '') || ' was created'
    ELSE v_label || ' ' || COALESCE(v_new->>'id', '') || ' moved from '
         || COALESCE(v_prev, 'n/a') || ' to ' || COALESCE(v_status, 'n/a')
  END;

  -- Party recipients (driver/owner/user/etc.)
  FOREACH v_col IN ARRAY v_cols LOOP
    v_col := btrim(v_col);
    CONTINUE WHEN v_col = '';
    v_val := v_new->>v_col;
    IF v_val IS NOT NULL AND v_val <> '' THEN
      BEGIN
        v_recipients := v_recipients || v_val::uuid;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
  END LOOP;

  -- Staff recipients by role (RBAC)
  SELECT v_recipients || COALESCE(array_agg(ur.user_id), ARRAY[]::uuid[])
    INTO v_recipients
    FROM public.user_roles ur
   WHERE ur.role::text = ANY (v_roles);

  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, metadata)
  SELECT DISTINCT r,
         v_kind,
         v_title,
         v_body,
         NULLIF(v_new->>'user_id', '')::uuid,
         jsonb_build_object(
           'table', TG_TABLE_NAME,
           'record_id', v_new->>'id',
           'operation', TG_OP,
           'status', v_status,
           'previous_status', v_prev
         )
    FROM unnest(v_recipients) AS r
   WHERE r IS NOT NULL;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_record_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_record_event() TO service_role;

-- Applications ------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_applications_created ON public.applications;
CREATE TRIGGER trg_notify_applications_created
AFTER INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Application', 'user_id', 'admin,admin_assistant');

DROP TRIGGER IF EXISTS trg_notify_applications_status ON public.applications;
CREATE TRIGGER trg_notify_applications_status
AFTER UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Application', 'user_id', 'admin,admin_assistant');

-- Invoices ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_invoices_created ON public.invoices;
CREATE TRIGGER trg_notify_invoices_created
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Invoice', 'driver_id,owner_id', 'admin,admin_assistant');

DROP TRIGGER IF EXISTS trg_notify_invoices_status ON public.invoices;
CREATE TRIGGER trg_notify_invoices_status
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Invoice', 'driver_id,owner_id', 'admin,admin_assistant');

-- Payments ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_payments_status ON public.payments;
CREATE TRIGGER trg_notify_payments_status
AFTER UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Payment', 'driver_id,owner_id', 'admin,admin_assistant');

-- Rentals -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_rentals_created ON public.rentals;
CREATE TRIGGER trg_notify_rentals_created
AFTER INSERT ON public.rentals
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Rental', 'driver_id,owner_id', 'admin,admin_assistant');

DROP TRIGGER IF EXISTS trg_notify_rentals_status ON public.rentals;
CREATE TRIGGER trg_notify_rentals_status
AFTER UPDATE OF status ON public.rentals
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Rental', 'driver_id,owner_id', 'admin,admin_assistant');

-- Subscriptions -----------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_subscriptions_created ON public.user_subscriptions;
CREATE TRIGGER trg_notify_subscriptions_created
AFTER INSERT ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Subscription', 'user_id', 'admin');

DROP TRIGGER IF EXISTS trg_notify_subscriptions_status ON public.user_subscriptions;
CREATE TRIGGER trg_notify_subscriptions_status
AFTER UPDATE OF status ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Subscription', 'user_id', 'admin');

-- Legal agreements --------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_legal_agreements_created ON public.legal_agreements;
CREATE TRIGGER trg_notify_legal_agreements_created
AFTER INSERT ON public.legal_agreements
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Legal agreement', 'driver_id,owner_id', 'admin,legal_support');

DROP TRIGGER IF EXISTS trg_notify_legal_agreements_status ON public.legal_agreements;
CREATE TRIGGER trg_notify_legal_agreements_status
AFTER UPDATE OF status ON public.legal_agreements
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Legal agreement', 'driver_id,owner_id', 'admin,legal_support');

-- Rent to own -------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_rto_created ON public.rent_to_own_agreements;
CREATE TRIGGER trg_notify_rto_created
AFTER INSERT ON public.rent_to_own_agreements
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Rent-to-own agreement', 'driver_id,owner_id', 'admin,legal_support');

DROP TRIGGER IF EXISTS trg_notify_rto_status ON public.rent_to_own_agreements;
CREATE TRIGGER trg_notify_rto_status
AFTER UPDATE OF status ON public.rent_to_own_agreements
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Rent-to-own agreement', 'driver_id,owner_id', 'admin,legal_support');

-- Price negotiations ------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_negotiations_created ON public.price_negotiations;
CREATE TRIGGER trg_notify_negotiations_created
AFTER INSERT ON public.price_negotiations
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Price negotiation', 'driver_id,owner_id', 'admin,admin_assistant');

DROP TRIGGER IF EXISTS trg_notify_negotiations_status ON public.price_negotiations;
CREATE TRIGGER trg_notify_negotiations_status
AFTER UPDATE OF status ON public.price_negotiations
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Price negotiation', 'driver_id,owner_id', 'admin,admin_assistant');

-- Booking requests --------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_booking_requests_created ON public.vehicle_booking_requests;
CREATE TRIGGER trg_notify_booking_requests_created
AFTER INSERT ON public.vehicle_booking_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Booking request', 'driver_id', 'admin,admin_assistant');

DROP TRIGGER IF EXISTS trg_notify_booking_requests_status ON public.vehicle_booking_requests;
CREATE TRIGGER trg_notify_booking_requests_status
AFTER UPDATE OF status ON public.vehicle_booking_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Booking request', 'driver_id', 'admin,admin_assistant');

-- Owner payouts -----------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_owner_payouts_status ON public.owner_payouts;
CREATE TRIGGER trg_notify_owner_payouts_status
AFTER UPDATE OF status ON public.owner_payouts
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Payout', 'owner_id', 'admin');

-- Withdrawal authorizations -----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_withdrawals_status ON public.withdrawal_authorizations;
CREATE TRIGGER trg_notify_withdrawals_status
AFTER UPDATE OF status ON public.withdrawal_authorizations
FOR EACH ROW EXECUTE FUNCTION public.notify_record_event('Withdrawal request', 'subject_user_id,requested_by', 'admin');

-- Onboarding: also notify the user themselves ------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user_onboarding_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type IN ('access_granted', 'grant_full_access') THEN
    v_title := 'Full access granted';
    v_body := 'Your account now has full dashboard access.';
  ELSIF NEW.event_type IN ('access_revoked', 'revoke_full_access') THEN
    v_title := 'Access restricted';
    v_body := 'Your dashboard access was restricted. Contact support for details.';
  ELSIF NEW.event_type IN ('stage_advanced', 'stage_changed') THEN
    v_title := 'Onboarding updated';
    v_body := 'Your onboarding stage is now ' || COALESCE(NEW.new_stage, 'updated') || '.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, related_stage, related_access_level, metadata)
  VALUES
    (NEW.user_id, 'onboarding_stage', v_title, v_body, NEW.user_id, NEW.new_stage, NEW.new_access_level,
     jsonb_build_object('audit_id', NEW.id, 'event_type', NEW.event_type, 'self', true));

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user_onboarding_stage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_user_onboarding_stage() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_user_onboarding_stage ON public.onboarding_stage_audit;
CREATE TRIGGER trg_notify_user_onboarding_stage
AFTER INSERT ON public.onboarding_stage_audit
FOR EACH ROW EXECUTE FUNCTION public.notify_user_onboarding_stage();