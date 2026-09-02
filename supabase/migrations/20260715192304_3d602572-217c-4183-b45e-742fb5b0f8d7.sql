
CREATE OR REPLACE FUNCTION public._testkit_run_trigger_guard_tests(_confirm text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  admin_id      uuid;
  driver_uid    uuid;
  owner_uid     uuid;
  vehicle_id    uuid;
  denied_before bigint;
  denied_after  bigint;
  la_id         uuid;
  rto_id        uuid;
  pn_id         uuid;
  rent_id       uuid;
  rs_id         uuid;
  inc_id        uuid;
  wr_id         uuid;
  listing_id    uuid;
  prev_claims   text := current_setting('request.jwt.claims', true);
BEGIN
  IF _confirm IS DISTINCT FROM 'YES_RUN_TESTS' THEN
    RAISE EXCEPTION 'Refusing to run testkit without confirmation string YES_RUN_TESTS';
  END IF;

  SELECT ur.user_id INTO admin_id FROM public.user_roles ur WHERE ur.role='admin'::app_role LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'No admin user exists'; END IF;

  SELECT p.user_id INTO driver_uid FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.user_id AND ur.role='admin'::app_role)
   ORDER BY p.created_at LIMIT 1;
  SELECT p.user_id INTO owner_uid FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.user_id AND ur.role='admin'::app_role)
     AND p.user_id <> driver_uid
   ORDER BY p.created_at LIMIT 1;
  IF driver_uid IS NULL OR owner_uid IS NULL THEN
    RAISE EXCEPTION 'Need at least two non-admin users';
  END IF;

  INSERT INTO public.vehicles(owner_id, make, model, year, license_plate)
  VALUES (owner_uid, 'TestMake', 'TestModel', 2024, 'TG-' || substr(gen_random_uuid()::text,1,10))
  RETURNING id INTO vehicle_id;

  INSERT INTO public.legal_agreements(driver_id, owner_id, vehicle_id, agreement_type, agreement_version, agreement_content, status, is_compulsory)
  VALUES (driver_uid, owner_uid, vehicle_id, 'rental', 1, 'ORIGINAL', 'pending', true) RETURNING id INTO la_id;

  INSERT INTO public.rent_to_own_listings(vehicle_id, owner_id, total_price, down_payment, monthly_payment, duration_months, currency, allow_buyout, allow_conversion_to_rental, status, is_available)
  VALUES (vehicle_id, owner_uid, 20000, 2000, 500, 36, 'USD', true, false, 'active', true) RETURNING id INTO listing_id;

  INSERT INTO public.rent_to_own_agreements(driver_id, owner_id, vehicle_id, listing_id, agreement_content, total_price, down_payment, monthly_payment, duration_months, currency, status)
  VALUES (driver_uid, owner_uid, vehicle_id, listing_id, 'ORIGINAL', 20000, 2000, 500, 36, 'USD', 'pending_signatures') RETURNING id INTO rto_id;

  INSERT INTO public.price_negotiations(driver_id, owner_id, vehicle_id, requested_daily_rate, currency, status)
  VALUES (driver_uid, owner_uid, vehicle_id, 55, 'USD', 'pending') RETURNING id INTO pn_id;

  INSERT INTO public.rentals(driver_id, owner_id, vehicle_id, daily_rate, currency, status, start_date, end_date, payment_frequency, region)
  VALUES (driver_uid, owner_uid, vehicle_id, 75, 'USD', 'active', now(), now() + interval '7 days', 'daily', 'USA') RETURNING id INTO rent_id;

  INSERT INTO public.rideshare_profile_submissions(driver_id, vehicle_id, week_start_date, status)
  VALUES (driver_uid, vehicle_id, date_trunc('week', now())::date, 'submitted') RETURNING id INTO rs_id;

  INSERT INTO public.vehicle_incidents(driver_id, owner_id, vehicle_id, incident_type, severity, status, title, description, reported_at, occurred_at)
  VALUES (driver_uid, owner_uid, vehicle_id, 'accident', 'low', 'reported', 'TG Incident', 'fixture', now(), now()) RETURNING id INTO inc_id;

  INSERT INTO public.weekly_inspection_reports(driver_id, owner_id, vehicle_id, week_start_date)
  VALUES (driver_uid, owner_uid, vehicle_id, date_trunc('week', now())::date) RETURNING id INTO wr_id;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', driver_uid::text, 'role', 'authenticated')::text, true);

  -- Test 1
  SELECT count(*) INTO denied_before FROM public.permission_denied_log WHERE target_table='legal_agreements' AND target_row_id=la_id::text;
  UPDATE public.legal_agreements SET status='active', driver_signature='drv-sig' WHERE id=la_id;
  ASSERT (SELECT status FROM public.legal_agreements WHERE id=la_id)='pending', 'legal_agreements.status must not change';
  ASSERT (SELECT driver_signature FROM public.legal_agreements WHERE id=la_id)='drv-sig', 'legal_agreements.driver_signature updatable';
  SELECT count(*) INTO denied_after FROM public.permission_denied_log WHERE target_table='legal_agreements' AND target_row_id=la_id::text;
  ASSERT denied_after=denied_before+1, 'legal_agreements denial log';

  -- Test 2
  SELECT count(*) INTO denied_before FROM public.permission_denied_log WHERE target_table='rent_to_own_agreements' AND target_row_id=rto_id::text;
  UPDATE public.rent_to_own_agreements SET total_price=1, driver_signature='drv-sig' WHERE id=rto_id;
  ASSERT (SELECT total_price FROM public.rent_to_own_agreements WHERE id=rto_id)=20000, 'RTO.total_price must not change';
  ASSERT (SELECT driver_signature FROM public.rent_to_own_agreements WHERE id=rto_id)='drv-sig', 'RTO.driver_signature updatable';
  SELECT count(*) INTO denied_after FROM public.permission_denied_log WHERE target_table='rent_to_own_agreements' AND target_row_id=rto_id::text;
  ASSERT denied_after=denied_before+1, 'RTO denial log';

  -- Test 3
  SELECT count(*) INTO denied_before FROM public.permission_denied_log WHERE target_table='price_negotiations' AND target_row_id=pn_id::text;
  UPDATE public.price_negotiations SET status='approved', final_daily_rate=40 WHERE id=pn_id;
  ASSERT (SELECT status FROM public.price_negotiations WHERE id=pn_id)='pending', 'price_negotiations.status must not change';
  ASSERT (SELECT final_daily_rate FROM public.price_negotiations WHERE id=pn_id) IS NULL, 'price_negotiations.final_daily_rate must not change';
  SELECT count(*) INTO denied_after FROM public.permission_denied_log WHERE target_table='price_negotiations' AND target_row_id=pn_id::text;
  ASSERT denied_after=denied_before+1, 'price_negotiations denial log';

  -- Test 4
  SELECT count(*) INTO denied_before FROM public.permission_denied_log WHERE target_table='rentals' AND target_row_id=rent_id::text;
  UPDATE public.rentals SET daily_rate=1 WHERE id=rent_id;
  ASSERT (SELECT daily_rate FROM public.rentals WHERE id=rent_id)=75, 'rentals.daily_rate must not change';
  SELECT count(*) INTO denied_after FROM public.permission_denied_log WHERE target_table='rentals' AND target_row_id=rent_id::text;
  ASSERT denied_after=denied_before+1, 'rentals denial log';

  -- Test 5
  SELECT count(*) INTO denied_before FROM public.permission_denied_log WHERE target_table='rideshare_profile_submissions' AND target_row_id=rs_id::text;
  UPDATE public.rideshare_profile_submissions SET status='approved', admin_notes='self' WHERE id=rs_id;
  ASSERT (SELECT status FROM public.rideshare_profile_submissions WHERE id=rs_id)='submitted', 'rideshare.status must not change';
  ASSERT (SELECT admin_notes FROM public.rideshare_profile_submissions WHERE id=rs_id) IS NULL, 'rideshare.admin_notes must not change';
  SELECT count(*) INTO denied_after FROM public.permission_denied_log WHERE target_table='rideshare_profile_submissions' AND target_row_id=rs_id::text;
  ASSERT denied_after=denied_before+1, 'rideshare denial log';

  -- Test 6 (fixed: no ambiguous driver_id ref)
  SELECT count(*) INTO denied_before FROM public.permission_denied_log WHERE target_table='vehicle_incidents' AND target_row_id=inc_id::text;
  UPDATE public.vehicle_incidents SET status='resolved', severity='high' WHERE id=inc_id;
  ASSERT (SELECT status FROM public.vehicle_incidents WHERE id=inc_id)='reported', 'vehicle_incidents.status must not change';
  ASSERT (SELECT severity FROM public.vehicle_incidents WHERE id=inc_id)='low', 'vehicle_incidents.severity must not change';
  SELECT count(*) INTO denied_after FROM public.permission_denied_log WHERE target_table='vehicle_incidents' AND target_row_id=inc_id::text;
  ASSERT denied_after=denied_before+1, 'vehicle_incidents denial log';

  -- Test 7
  SELECT count(*) INTO denied_before FROM public.permission_denied_log WHERE target_table='weekly_inspection_reports' AND target_row_id=wr_id::text;
  UPDATE public.weekly_inspection_reports SET admin_decision='approved', photo_front_view='https://cdn/front.jpg' WHERE id=wr_id;
  ASSERT (SELECT admin_decision FROM public.weekly_inspection_reports WHERE id=wr_id) IS NULL, 'weekly_reports.admin_decision must not change';
  ASSERT (SELECT photo_front_view FROM public.weekly_inspection_reports WHERE id=wr_id)='https://cdn/front.jpg', 'weekly_reports.photo_front_view updatable';
  SELECT count(*) INTO denied_after FROM public.permission_denied_log WHERE target_table='weekly_inspection_reports' AND target_row_id=wr_id::text;
  ASSERT denied_after=denied_before+1, 'weekly_reports denial log';

  -- Test 8: admin bypass
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO denied_before FROM public.permission_denied_log;
  UPDATE public.legal_agreements SET status='active' WHERE id=la_id;
  UPDATE public.rent_to_own_agreements SET total_price=25000 WHERE id=rto_id;
  UPDATE public.price_negotiations SET status='approved', final_daily_rate=50 WHERE id=pn_id;
  UPDATE public.rentals SET daily_rate=80 WHERE id=rent_id;
  UPDATE public.rideshare_profile_submissions SET status='approved', admin_notes='ok' WHERE id=rs_id;
  UPDATE public.vehicle_incidents SET status='resolved', severity='high' WHERE id=inc_id;
  UPDATE public.weekly_inspection_reports SET admin_decision='approved' WHERE id=wr_id;

  ASSERT (SELECT status FROM public.legal_agreements WHERE id=la_id)='active', 'admin: legal_agreements.status';
  ASSERT (SELECT total_price FROM public.rent_to_own_agreements WHERE id=rto_id)=25000, 'admin: RTO.total_price';
  ASSERT (SELECT status FROM public.price_negotiations WHERE id=pn_id)='approved', 'admin: price_negotiations.status';
  ASSERT (SELECT daily_rate FROM public.rentals WHERE id=rent_id)=80, 'admin: rentals.daily_rate';
  ASSERT (SELECT status FROM public.rideshare_profile_submissions WHERE id=rs_id)='approved', 'admin: rideshare.status';
  ASSERT (SELECT status FROM public.vehicle_incidents WHERE id=inc_id)='resolved', 'admin: incidents.status';
  ASSERT (SELECT admin_decision FROM public.weekly_inspection_reports WHERE id=wr_id)='approved', 'admin: weekly.admin_decision';
  SELECT count(*) INTO denied_after FROM public.permission_denied_log;
  ASSERT denied_after=denied_before, 'admin must not log denials';

  -- Cleanup
  DELETE FROM public.permission_denied_log
   WHERE target_row_id IN (la_id::text, rto_id::text, pn_id::text, rent_id::text, rs_id::text, inc_id::text, wr_id::text);
  DELETE FROM public.weekly_inspection_reports WHERE id=wr_id;
  DELETE FROM public.vehicle_incidents WHERE id=inc_id;
  DELETE FROM public.rideshare_profile_submissions WHERE id=rs_id;
  DELETE FROM public.rentals WHERE id=rent_id;
  DELETE FROM public.price_negotiations WHERE id=pn_id;
  DELETE FROM public.rent_to_own_agreements WHERE id=rto_id;
  DELETE FROM public.rent_to_own_listings WHERE id=listing_id;
  DELETE FROM public.legal_agreements WHERE id=la_id;
  DELETE FROM public.vehicles WHERE id=vehicle_id;

  PERFORM set_config('request.jwt.claims', COALESCE(prev_claims, ''), true);
  RETURN 'PASSED: 7 trigger-guard tests + admin bypass';

EXCEPTION WHEN OTHERS THEN
  BEGIN
    DELETE FROM public.weekly_inspection_reports WHERE id=wr_id;
    DELETE FROM public.vehicle_incidents WHERE id=inc_id;
    DELETE FROM public.rideshare_profile_submissions WHERE id=rs_id;
    DELETE FROM public.rentals WHERE id=rent_id;
    DELETE FROM public.price_negotiations WHERE id=pn_id;
    DELETE FROM public.rent_to_own_agreements WHERE id=rto_id;
    DELETE FROM public.rent_to_own_listings WHERE id=listing_id;
    DELETE FROM public.legal_agreements WHERE id=la_id;
    DELETE FROM public.vehicles WHERE id=vehicle_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM set_config('request.jwt.claims', COALESCE(prev_claims, ''), true);
  RAISE;
END;
$fn$;

REVOKE ALL ON FUNCTION public._testkit_run_trigger_guard_tests(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._testkit_run_trigger_guard_tests(text) TO authenticated, service_role;
