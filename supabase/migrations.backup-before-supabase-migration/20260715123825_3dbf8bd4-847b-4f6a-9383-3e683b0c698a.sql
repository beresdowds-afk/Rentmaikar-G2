
-- ============================================================
-- Column-level guards via BEFORE UPDATE triggers
-- ============================================================

-- Legal agreements
CREATE OR REPLACE FUNCTION public.enforce_legal_agreement_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF uid = OLD.driver_id AND uid <> COALESCE(OLD.owner_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    -- Driver: only their own signature fields
    IF NEW.owner_signature IS DISTINCT FROM OLD.owner_signature
       OR NEW.owner_signed_at IS DISTINCT FROM OLD.owner_signed_at
       OR NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature
       OR NEW.admin_witnessed_at IS DISTINCT FROM OLD.admin_witnessed_at
       OR NEW.admin_witness_id IS DISTINCT FROM OLD.admin_witness_id
       OR NEW.agreement_content IS DISTINCT FROM OLD.agreement_content
       OR NEW.agreement_type IS DISTINCT FROM OLD.agreement_type
       OR NEW.agreement_version IS DISTINCT FROM OLD.agreement_version
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.pdf_url IS DISTINCT FROM OLD.pdf_url
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.is_compulsory IS DISTINCT FROM OLD.is_compulsory
       OR NEW.parent_agreement_id IS DISTINCT FROM OLD.parent_agreement_id
    THEN
      RAISE EXCEPTION 'Drivers may only update their own signature on legal agreements';
    END IF;
  ELSIF uid = OLD.owner_id THEN
    IF NEW.driver_signature IS DISTINCT FROM OLD.driver_signature
       OR NEW.driver_signed_at IS DISTINCT FROM OLD.driver_signed_at
       OR NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature
       OR NEW.admin_witnessed_at IS DISTINCT FROM OLD.admin_witnessed_at
       OR NEW.admin_witness_id IS DISTINCT FROM OLD.admin_witness_id
       OR NEW.agreement_content IS DISTINCT FROM OLD.agreement_content
       OR NEW.agreement_type IS DISTINCT FROM OLD.agreement_type
       OR NEW.agreement_version IS DISTINCT FROM OLD.agreement_version
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.pdf_url IS DISTINCT FROM OLD.pdf_url
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.is_compulsory IS DISTINCT FROM OLD.is_compulsory
       OR NEW.parent_agreement_id IS DISTINCT FROM OLD.parent_agreement_id
    THEN
      RAISE EXCEPTION 'Owners may only update their own signature on legal agreements';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_legal_agreement_column_scope ON public.legal_agreements;
CREATE TRIGGER enforce_legal_agreement_column_scope
BEFORE UPDATE ON public.legal_agreements
FOR EACH ROW EXECUTE FUNCTION public.enforce_legal_agreement_column_scope();

-- Rent-to-own agreements
CREATE OR REPLACE FUNCTION public.enforce_rto_agreement_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF uid = OLD.driver_id AND uid <> COALESCE(OLD.owner_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    IF NEW.owner_signature IS DISTINCT FROM OLD.owner_signature
       OR NEW.owner_signed_at IS DISTINCT FROM OLD.owner_signed_at
       OR NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature
       OR NEW.admin_witnessed_at IS DISTINCT FROM OLD.admin_witnessed_at
       OR NEW.admin_witness_id IS DISTINCT FROM OLD.admin_witness_id
       OR NEW.agreement_content IS DISTINCT FROM OLD.agreement_content
       OR NEW.total_price IS DISTINCT FROM OLD.total_price
       OR NEW.down_payment IS DISTINCT FROM OLD.down_payment
       OR NEW.monthly_payment IS DISTINCT FROM OLD.monthly_payment
       OR NEW.duration_months IS DISTINCT FROM OLD.duration_months
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.allow_buyout IS DISTINCT FROM OLD.allow_buyout
       OR NEW.allow_conversion_to_rental IS DISTINCT FROM OLD.allow_conversion_to_rental
       OR NEW.payments_made IS DISTINCT FROM OLD.payments_made
       OR NEW.total_amount_paid IS DISTINCT FROM OLD.total_amount_paid
       OR NEW.next_payment_due IS DISTINCT FROM OLD.next_payment_due
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    THEN
      RAISE EXCEPTION 'Drivers may only update their own signature on rent-to-own agreements';
    END IF;
  ELSIF uid = OLD.owner_id THEN
    IF NEW.driver_signature IS DISTINCT FROM OLD.driver_signature
       OR NEW.driver_signed_at IS DISTINCT FROM OLD.driver_signed_at
       OR NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature
       OR NEW.admin_witnessed_at IS DISTINCT FROM OLD.admin_witnessed_at
       OR NEW.admin_witness_id IS DISTINCT FROM OLD.admin_witness_id
       OR NEW.agreement_content IS DISTINCT FROM OLD.agreement_content
       OR NEW.total_price IS DISTINCT FROM OLD.total_price
       OR NEW.down_payment IS DISTINCT FROM OLD.down_payment
       OR NEW.monthly_payment IS DISTINCT FROM OLD.monthly_payment
       OR NEW.duration_months IS DISTINCT FROM OLD.duration_months
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.allow_buyout IS DISTINCT FROM OLD.allow_buyout
       OR NEW.allow_conversion_to_rental IS DISTINCT FROM OLD.allow_conversion_to_rental
       OR NEW.payments_made IS DISTINCT FROM OLD.payments_made
       OR NEW.total_amount_paid IS DISTINCT FROM OLD.total_amount_paid
       OR NEW.next_payment_due IS DISTINCT FROM OLD.next_payment_due
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    THEN
      RAISE EXCEPTION 'Owners may only update their own signature on rent-to-own agreements';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_rto_agreement_column_scope ON public.rent_to_own_agreements;
CREATE TRIGGER enforce_rto_agreement_column_scope
BEFORE UPDATE ON public.rent_to_own_agreements
FOR EACH ROW EXECUTE FUNCTION public.enforce_rto_agreement_column_scope();

-- Price negotiations
CREATE OR REPLACE FUNCTION public.enforce_price_negotiation_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
     OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
     OR NEW.locked_by IS DISTINCT FROM OLD.locked_by
     OR NEW.admin_response IS DISTINCT FROM OLD.admin_response
     OR NEW.admin_counter_offer IS DISTINCT FROM OLD.admin_counter_offer
     OR NEW.final_daily_rate IS DISTINCT FROM OLD.final_daily_rate
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
  THEN
    RAISE EXCEPTION 'Only admins can change approval, locking, or admin-response fields on price negotiations';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_price_negotiation_column_scope ON public.price_negotiations;
CREATE TRIGGER enforce_price_negotiation_column_scope
BEFORE UPDATE ON public.price_negotiations
FOR EACH ROW EXECUTE FUNCTION public.enforce_price_negotiation_column_scope();

-- Rentals
CREATE OR REPLACE FUNCTION public.enforce_rental_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF uid = OLD.driver_id THEN
    IF NEW.daily_rate IS DISTINCT FROM OLD.daily_rate
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.extended_end_date IS DISTINCT FROM OLD.extended_end_date
       OR NEW.extension_approved IS DISTINCT FROM OLD.extension_approved
       OR NEW.payment_frequency IS DISTINCT FROM OLD.payment_frequency
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.region IS DISTINCT FROM OLD.region
       OR NEW.return_confirmed_at IS DISTINCT FROM OLD.return_confirmed_at
       OR NEW.return_reminder_sent IS DISTINCT FROM OLD.return_reminder_sent
    THEN
      RAISE EXCEPTION 'Drivers may only update return notes or request an extension on a rental';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_rental_column_scope ON public.rentals;
CREATE TRIGGER enforce_rental_column_scope
BEFORE UPDATE ON public.rentals
FOR EACH ROW EXECUTE FUNCTION public.enforce_rental_column_scope();

-- Rideshare profile submissions
CREATE OR REPLACE FUNCTION public.enforce_rideshare_submission_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.admin_reviewed_at IS DISTINCT FROM OLD.admin_reviewed_at
     OR NEW.admin_reviewed_by IS DISTINCT FROM OLD.admin_reviewed_by
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.week_start_date IS DISTINCT FROM OLD.week_start_date
  THEN
    RAISE EXCEPTION 'Only admins can change review status or admin fields on rideshare submissions';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_rideshare_submission_column_scope ON public.rideshare_profile_submissions;
CREATE TRIGGER enforce_rideshare_submission_column_scope
BEFORE UPDATE ON public.rideshare_profile_submissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_rideshare_submission_column_scope();

-- Vehicle incidents
CREATE OR REPLACE FUNCTION public.enforce_vehicle_incident_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR public.is_any_support_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.severity IS DISTINCT FROM OLD.severity
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
     OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
     OR NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by
     OR NEW.iot_data IS DISTINCT FROM OLD.iot_data
     OR NEW.is_iot_detected IS DISTINCT FROM OLD.is_iot_detected
     OR NEW.iot_trigger_type IS DISTINCT FROM OLD.iot_trigger_type
     OR NEW.iot_deceleration_g IS DISTINCT FROM OLD.iot_deceleration_g
     OR NEW.iot_impact_severity IS DISTINCT FROM OLD.iot_impact_severity
     OR NEW.iot_speed_at_impact IS DISTINCT FROM OLD.iot_speed_at_impact
     OR NEW.iot_triggered_at IS DISTINCT FROM OLD.iot_triggered_at
     OR NEW.is_late_report IS DISTINCT FROM OLD.is_late_report
     OR NEW.actual_downtime_hours IS DISTINCT FROM OLD.actual_downtime_hours
     OR NEW.estimated_downtime_hours IS DISTINCT FROM OLD.estimated_downtime_hours
     OR NEW.reported_at IS DISTINCT FROM OLD.reported_at
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.incident_type IS DISTINCT FROM OLD.incident_type
  THEN
    RAISE EXCEPTION 'Only admins or support staff can change severity, IoT data, or resolution fields on an incident';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vehicle_incident_column_scope ON public.vehicle_incidents;
CREATE TRIGGER enforce_vehicle_incident_column_scope
BEFORE UPDATE ON public.vehicle_incidents
FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_incident_column_scope();

-- Weekly inspection reports
CREATE OR REPLACE FUNCTION public.enforce_weekly_report_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF uid = OLD.driver_id AND uid <> COALESCE(OLD.owner_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    -- Driver: photos + their own response only
    IF NEW.owner_reviewed_at IS DISTINCT FROM OLD.owner_reviewed_at
       OR NEW.owner_notes IS DISTINCT FROM OLD.owner_notes
       OR NEW.owner_action IS DISTINCT FROM OLD.owner_action
       OR NEW.admin_reviewed_at IS DISTINCT FROM OLD.admin_reviewed_at
       OR NEW.admin_decision IS DISTINCT FROM OLD.admin_decision
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
       OR NEW.admin_id IS DISTINCT FROM OLD.admin_id
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.week_start_date IS DISTINCT FROM OLD.week_start_date
    THEN
      RAISE EXCEPTION 'Drivers may only update their own inspection photos and response fields';
    END IF;
  ELSIF uid = OLD.owner_id THEN
    -- Owner: only review fields
    IF NEW.photo_front_view IS DISTINCT FROM OLD.photo_front_view
       OR NEW.photo_back_view IS DISTINCT FROM OLD.photo_back_view
       OR NEW.photo_driver_side IS DISTINCT FROM OLD.photo_driver_side
       OR NEW.photo_passenger_side IS DISTINCT FROM OLD.photo_passenger_side
       OR NEW.photo_front_right_tyre IS DISTINCT FROM OLD.photo_front_right_tyre
       OR NEW.photo_front_left_tyre IS DISTINCT FROM OLD.photo_front_left_tyre
       OR NEW.photo_back_left_tyre IS DISTINCT FROM OLD.photo_back_left_tyre
       OR NEW.photo_back_right_tyre IS DISTINCT FROM OLD.photo_back_right_tyre
       OR NEW.photo_dashboard IS DISTINCT FROM OLD.photo_dashboard
       OR NEW.photo_interior IS DISTINCT FROM OLD.photo_interior
       OR NEW.photo_rideshare_profile IS DISTINCT FROM OLD.photo_rideshare_profile
       OR NEW.photo_timestamps IS DISTINCT FROM OLD.photo_timestamps
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.driver_responded_at IS DISTINCT FROM OLD.driver_responded_at
       OR NEW.driver_accepted_withdrawal IS DISTINCT FROM OLD.driver_accepted_withdrawal
       OR NEW.admin_reviewed_at IS DISTINCT FROM OLD.admin_reviewed_at
       OR NEW.admin_decision IS DISTINCT FROM OLD.admin_decision
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
       OR NEW.admin_id IS DISTINCT FROM OLD.admin_id
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.week_start_date IS DISTINCT FROM OLD.week_start_date
    THEN
      RAISE EXCEPTION 'Owners may only update owner-review fields on inspection reports';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_weekly_report_column_scope ON public.weekly_inspection_reports;
CREATE TRIGGER enforce_weekly_report_column_scope
BEFORE UPDATE ON public.weekly_inspection_reports
FOR EACH ROW EXECUTE FUNCTION public.enforce_weekly_report_column_scope();

-- ============================================================
-- Lock down SECURITY DEFINER helpers so anon can't call them
-- (authenticated retains EXECUTE for RLS helpers)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.assistant_can_access_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_support_staff_city(uuid, support_task_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_admin_assistant_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_any_support_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_support_staff(uuid, support_task_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_single_account_link() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assistant_can_access_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_support_staff_city(uuid, support_task_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_admin_assistant_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_any_support_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_support_staff(uuid, support_task_type) TO authenticated, service_role;
