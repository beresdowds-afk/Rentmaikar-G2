-- ============================================================================
-- Migration: 20261001090000_authoritative_account_provisioning.sql
-- Foundational Repairs:
-- 1. Authoritative account provisioning (profile + role + wallet)
-- 2. Update handle_new_user and approve_application
-- 3. Vehicle rental eligibility assertion gate (assert_vehicle_rental_eligible)
-- 4. Vehicle catalogue projection sync checking review_status = 'published'
-- 5. Harden submit_booking_request with review_status & eligibility
-- 6. Harden settle_payment_financials with defensive wallet check & owner earnings
-- ============================================================================

-- 1. Central Account Provisioning RPC
CREATE OR REPLACE FUNCTION public.provision_user_account(
  _user_id uuid,
  _role public.app_role,
  _email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_wallet public.wallet_accounts%ROWTYPE;
  v_currency text;
  v_country text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22023';
  END IF;
  IF _role IS NULL THEN
    RAISE EXCEPTION 'role is required' USING ERRCODE = '22023';
  END IF;

  /*
   * 1. Profile must exist. Idempotent insertion/touch.
   */
  INSERT INTO public.profiles (
    user_id,
    email,
    created_at,
    updated_at
  )
  VALUES (
    _user_id,
    _email,
    now(),
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    updated_at = now();

  /*
   * 2. Role must exist.
   * Do not delete an existing legitimate role.
   */
  INSERT INTO public.user_roles (
    user_id,
    role
  )
  VALUES (
    _user_id,
    _role
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  /*
   * 3. Two-factor settings initialization
   */
  INSERT INTO public.two_factor_settings (user_id, is_enabled, is_mandatory, preferred_channel)
  VALUES (_user_id, false, false, 'sms')
  ON CONFLICT (user_id) DO NOTHING;

  /*
   * 4. Financial wallet must always exist for financial users.
   */
  IF _role::text IN ('driver', 'owner') THEN
    SELECT COALESCE(preferred_country, country) INTO v_country
    FROM public.profiles
    WHERE user_id = _user_id;

    v_currency := CASE
      WHEN upper(COALESCE(v_country, '')) = 'NG' OR lower(COALESCE(v_country, '')) = 'nigeria'
      THEN 'NGN'
      ELSE 'USD'
    END;

    INSERT INTO public.wallet_accounts (
      user_id,
      account_type,
      currency,
      status,
      created_at,
      updated_at
    )
    VALUES (
      _user_id,
      _role::text,
      v_currency,
      'active',
      now(),
      now()
    )
    ON CONFLICT (user_id, account_type, currency)
    DO UPDATE SET updated_at = now();
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = _user_id;

  SELECT * INTO v_wallet
  FROM public.wallet_accounts
  WHERE user_id = _user_id
  ORDER BY created_at
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', _user_id,
    'role', _role,
    'profile_created', v_profile.user_id IS NOT NULL,
    'wallet_created', v_wallet.user_id IS NOT NULL
  );
END;
$$;

-- Provide 2-argument signature as well for strict conformance
CREATE OR REPLACE FUNCTION public.provision_user_account(
  _user_id uuid,
  _role public.app_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.provision_user_account(_user_id, _role, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_user_account(uuid, public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_user_account(uuid, public.app_role, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provision_user_account(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_user_account(uuid, public.app_role) TO authenticated, service_role;

-- 2. Update handle_new_user to use authoritative provision_user_account
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name text := COALESCE(
    meta->>'full_name',
    meta->>'name',
    NULLIF(TRIM(CONCAT(meta->>'given_name', ' ', meta->>'family_name')), ''),
    NULL
  );
  v_avatar text := COALESCE(meta->>'avatar_url', meta->>'picture');
  v_phone_raw text := COALESCE(NEW.phone, meta->>'phone');
  v_phone text;
  v_locale text := COALESCE(meta->>'locale', '');
  v_country text := CASE
    WHEN v_locale ILIKE '%-NG' OR v_locale ILIKE 'ng%' THEN 'NG'
    WHEN v_locale ILIKE '%-US' OR v_locale ILIKE 'en-US' THEN 'US'
    ELSE NULL
  END;
  v_email text := COALESCE(NEW.email, meta->>'email');
  v_email_verified boolean := COALESCE(
    (meta->>'email_verified')::boolean,
    NEW.email_confirmed_at IS NOT NULL,
    false
  );
  v_is_admin_seed boolean := lower(COALESCE(v_email, '')) = 'eastfortemain@gmail.com';
  v_requested text := lower(COALESCE(meta->>'requested_role', ''));
  v_seed_role public.app_role;
  v_onboarding_state jsonb := jsonb_build_object(
    'driver',   jsonb_build_object('status', 'pending', 'started_at', NULL, 'completed_at', NULL),
    'renter',   jsonb_build_object('status', 'pending', 'started_at', NULL, 'completed_at', NULL),
    'two_factor', jsonb_build_object('status', 'pending', 'enabled', false),
    'notifications', jsonb_build_object('initialized', true),
    'preferences', jsonb_build_object('initialized', true, 'region_mode', 'auto')
  );
BEGIN
  v_phone := NULLIF(regexp_replace(COALESCE(v_phone_raw, ''), '[^0-9]', '', 'g'), '');
  IF v_phone IS NOT NULL THEN
    v_phone := '+' || v_phone;
    IF v_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
      v_phone := NULL;
    END IF;
  END IF;

  -- 1) Insert/update profile base
  INSERT INTO public.profiles (
    user_id, email, full_name, phone, avatar_url,
    preferred_country, region_mode,
    notification_email, notification_sms, notification_whatsapp,
    email_verified, onboarding_state
  )
  VALUES (
    NEW.id, v_email, NULLIF(v_full_name, ''), v_phone, v_avatar,
    v_country, 'auto',
    true, false, false,
    v_email_verified, v_onboarding_state
  )
  ON CONFLICT (user_id) DO UPDATE
    SET email             = COALESCE(public.profiles.email, EXCLUDED.email),
        full_name         = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone             = COALESCE(public.profiles.phone, EXCLUDED.phone),
        avatar_url        = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
        preferred_country = COALESCE(public.profiles.preferred_country, EXCLUDED.preferred_country),
        region_mode       = COALESCE(public.profiles.region_mode, EXCLUDED.region_mode),
        email_verified    = public.profiles.email_verified OR EXCLUDED.email_verified,
        onboarding_state  = COALESCE(NULLIF(public.profiles.onboarding_state, '{}'::jsonb), EXCLUDED.onboarding_state);

  -- 2) Determine role
  IF v_is_admin_seed THEN
    v_seed_role := 'admin';
  ELSIF v_requested IN ('driver', 'owner') THEN
    v_seed_role := v_requested::public.app_role;
  ELSE
    v_seed_role := 'driver';
  END IF;

  -- 3) Authoritatively provision profile, role, and financial wallet
  PERFORM public.provision_user_account(NEW.id, v_seed_role, v_email);

  -- 4) Two-factor settings row
  BEGIN
    INSERT INTO public.two_factor_settings (user_id, is_enabled, is_mandatory, preferred_channel, phone_number)
    VALUES (NEW.id, false, v_is_admin_seed, 'sms', v_phone)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: two_factor_settings skipped for %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$function$;

-- 3. Update approve_application to authoritatively provision user account before returning
CREATE OR REPLACE FUNCTION public.approve_application(_app_id uuid, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.applications%ROWTYPE;
  v_role app_role;
  v_uid uuid := auth.uid();
  v_authorized boolean := false;
  v_user_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() THEN
    v_authorized := true;
  ELSE
    SELECT COALESCE(can_approve_applications, false) INTO v_authorized
      FROM public.admin_assistant_permissions
      WHERE user_id = v_uid;
    v_authorized := COALESCE(v_authorized, false);
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to approve applications' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = _app_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  v_user_id := v_app.user_id;

  -- Recover account link by email if missing
  IF v_user_id IS NULL AND v_app.email IS NOT NULL THEN
    SELECT p.user_id INTO v_user_id
      FROM public.profiles p
     WHERE lower(p.email) = lower(v_app.email)
     ORDER BY p.created_at
     LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Application has no linked auth user. Applicant must create an account first.'
      USING ERRCODE = '22023';
  END IF;

  v_role := CASE v_app.application_type::text
    WHEN 'driver' THEN 'driver'::app_role
    WHEN 'owner' THEN 'owner'::app_role
    ELSE NULL
  END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unsupported application_type: %', v_app.application_type;
  END IF;

  UPDATE public.applications
    SET status = 'approved',
        user_id = v_user_id,
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_notes = COALESCE(_notes, review_notes),
        updated_at = now()
    WHERE id = _app_id;

  -- Authoritatively provision account and wallet
  PERFORM public.provision_user_account(v_user_id, v_role, v_app.email);

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (v_uid, 'application_approved', 'applications', _app_id::text,
          jsonb_build_object('user_id', v_user_id, 'role', v_role, 'notes', _notes,
                             'by_assistant', NOT public.is_admin(),
                             'user_link_recovered', v_app.user_id IS NULL));

  RETURN v_user_id;
END;
$$;

-- 4. Vehicle rental eligibility assertion gate
CREATE OR REPLACE FUNCTION public.assert_vehicle_rental_eligible(_vehicle_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT
    id,
    status,
    is_public,
    review_status,
    insurance_expiry
  INTO v_rec
  FROM public.vehicles
  WHERE id = _vehicle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_rec.review_status, 'pending') <> 'published' THEN
    RAISE EXCEPTION 'Vehicle is pending administrative approval' USING ERRCODE = '22023';
  END IF;

  IF v_rec.status IN ('suspended', 'recalled', 'maintenance', 'inactive') THEN
    RAISE EXCEPTION 'Vehicle is not eligible for rental (status: %)', v_rec.status USING ERRCODE = '22023';
  END IF;

  IF v_rec.insurance_expiry IS NOT NULL AND v_rec.insurance_expiry < current_date THEN
    RAISE EXCEPTION 'Vehicle insurance has expired' USING ERRCODE = '22023';
  END IF;

  -- Check if vehicle has a rejected weekly inspection within the last 30 days
  IF EXISTS (
    SELECT 1 FROM public.weekly_inspection_reports
    WHERE vehicle_id = _vehicle_id
      AND status = 'rejected'
      AND created_at > now() - interval '30 days'
  ) THEN
    RAISE EXCEPTION 'Vehicle has failed inspection and is not rental eligible' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_vehicle_rental_eligible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_vehicle_rental_eligible(uuid) TO authenticated, service_role;

-- 5. Harden Catalogue Projection Trigger to Require review_status = 'published'
CREATE OR REPLACE FUNCTION public.sync_vehicle_catalogue_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.vehicle_catalogue_listings WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  -- Only vehicles that are available/active, public, and explicitly approved by admin are listed
  IF NEW.status IN ('available','active')
     AND NEW.is_public = true
     AND COALESCE(NEW.review_status, 'pending') = 'published'
     AND NEW.photo_urls IS NOT NULL
     AND array_length(NEW.photo_urls, 1) >= 1
     AND btrim(coalesce(NEW.photo_urls[1], '')) <> '' THEN
    INSERT INTO public.vehicle_catalogue_listings AS cl
      (id, make, model, year, color, status, pickup_city, pickup_location, photo_urls, created_at)
    VALUES
      (NEW.id, NEW.make, NEW.model, NEW.year, NEW.color, NEW.status, NEW.pickup_city, NEW.pickup_location, NEW.photo_urls, NEW.created_at)
    ON CONFLICT (id) DO UPDATE SET
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      year = EXCLUDED.year,
      color = EXCLUDED.color,
      status = EXCLUDED.status,
      pickup_city = EXCLUDED.pickup_city,
      pickup_location = EXCLUDED.pickup_location,
      photo_urls = EXCLUDED.photo_urls,
      created_at = EXCLUDED.created_at;
  ELSE
    DELETE FROM public.vehicle_catalogue_listings WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Add pricing_snapshot to vehicle_booking_requests if missing
ALTER TABLE public.vehicle_booking_requests
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb DEFAULT NULL;

-- 7. Harden submit_booking_request with review_status check & eligibility gate
CREATE OR REPLACE FUNCTION public.submit_booking_request(
  _vehicle_id uuid,
  _start_date date,
  _end_date date,
  _message text DEFAULT NULL,
  _region text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _v_rec record;
  _pricing jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'End date must be on or after the start date';
  END IF;
  IF _start_date < current_date THEN
    RAISE EXCEPTION 'Start date cannot be in the past';
  END IF;

  -- 1. Check vehicle availability and admin review status
  SELECT id, make, model, year, is_public, status, review_status
  INTO _v_rec
  FROM public.vehicles
  WHERE id = _vehicle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  IF NOT (_v_rec.is_public = true AND _v_rec.status IN ('available', 'active') AND COALESCE(_v_rec.review_status, 'pending') = 'published') THEN
    RAISE EXCEPTION 'Vehicle is not currently available for reservation';
  END IF;

  -- 2. Authoritative eligibility check
  PERFORM public.assert_vehicle_rental_eligible(_vehicle_id);

  -- 3. Check for existing open request
  IF EXISTS (
    SELECT 1 FROM public.vehicle_booking_requests r
    WHERE r.driver_id = auth.uid() AND r.vehicle_id = _vehicle_id
      AND r.status IN ('pending','offer_sent')
  ) THEN
    RAISE EXCEPTION 'You already have an open request for this vehicle';
  END IF;

  -- 4. Calculate locked pricing snapshot
  _pricing := jsonb_build_object(
    'vehicle_id', _vehicle_id,
    'captured_at', now(),
    'region', COALESCE(_region, 'USA'),
    'start_date', _start_date,
    'end_date', _end_date,
    'total_days', (_end_date - _start_date) + 1
  );

  INSERT INTO public.vehicle_booking_requests (
    vehicle_id, driver_id, start_date, end_date, driver_message, region, pricing_snapshot
  )
  VALUES (
    _vehicle_id, auth.uid(), _start_date, _end_date, NULLIF(btrim(coalesce(_message,'')), ''), _region, _pricing
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- 8. Harden settle_payment_financials: Defensive wallet check & single owner earnings record
CREATE OR REPLACE FUNCTION public.settle_payment_financials(
  _payment_id uuid,
  _provider text DEFAULT NULL::text,
  _provider_reference text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  PLATFORM_USER constant uuid := '00000000-0000-0000-0000-000000000000';
  _p public.payments%ROWTYPE;
  _owner_pct numeric := 2.0/3.0;
  _owner_share numeric(14,2) := 0;
  _platform_fee numeric(14,2) := 0;
  _tax_total numeric(14,2) := 0;
  _jur text;
  _rule public.tax_rules%ROWTYPE;
  _inv_id uuid;
  _sub_id uuid;
  _sub_error text;
  _region text;
  _entry_type text;
  _payer_account_type text;
BEGIN
  SELECT * INTO _p FROM public.payments WHERE id = _payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF _p.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment not completed');
  END IF;
  IF _p.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'payment_id', _payment_id);
  END IF;

  SELECT r.region INTO _region FROM public.rentals r WHERE r.id = _p.rental_id;

  SELECT coalesce((value->>'owner_share_pct')::numeric, _owner_pct) INTO _owner_pct
    FROM public.platform_kv_settings WHERE key = 'owner_share_pct';
  _owner_pct := coalesce(_owner_pct, 2.0/3.0);

  IF _p.purpose = 'rental' AND _p.owner_id IS NOT NULL THEN
    _owner_share := round(_p.amount * _owner_pct, 2);
    _platform_fee := round(_p.amount - _owner_share, 2);
  ELSE
    _owner_share := 0;
    _platform_fee := _p.amount;
  END IF;

  _jur := public.resolve_tax_jurisdiction(_p.currency, _region);
  IF _jur IS NOT NULL THEN
    FOR _rule IN
      SELECT * FROM public.tax_rules
       WHERE jurisdiction_code = _jur
         AND is_active = true
         AND applies_to = 'customer'
         AND effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    LOOP
      INSERT INTO public.tax_line_items(
        payment_id, rental_id, tax_rule_id, tax_type, jurisdiction_code,
        taxable_amount, tax_rate, tax_amount, currency, is_exempt, exemption_reason)
      VALUES (
        _p.id, _p.rental_id, _rule.id, _rule.tax_type, _rule.jurisdiction_code,
        _p.amount, _rule.rate_percent,
        CASE WHEN _rule.is_exempt THEN 0 ELSE round(_p.amount * _rule.rate_percent / 100.0, 2) END,
        _p.currency, _rule.is_exempt, _rule.exemption_reason)
      ON CONFLICT DO NOTHING;
    END LOOP;

    SELECT coalesce(sum(tax_amount),0) INTO _tax_total
      FROM public.tax_line_items WHERE payment_id = _p.id;
  END IF;

  _entry_type := CASE _p.purpose
    WHEN 'rental' THEN 'rental_payment'
    WHEN 'security_deposit' THEN 'security_deposit'
    WHEN 'late_fee' THEN 'late_fee'
    WHEN 'subscription_training' THEN 'subscription_training'
    WHEN 'subscription_insurance' THEN 'subscription_insurance'
    WHEN 'subscription_roadside' THEN 'subscription_roadside'
    ELSE 'adjustment' END;

  _payer_account_type := CASE
    WHEN public.has_role(_p.driver_id, 'driver'::public.app_role) THEN 'driver'
    WHEN public.has_role(_p.driver_id, 'owner'::public.app_role) THEN 'owner'
    ELSE 'driver' END;

  -- Defensive wallet check: Guarantee driver wallet exists
  IF _p.driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wallet_accounts
    WHERE user_id = _p.driver_id AND account_type = _payer_account_type AND currency = upper(_p.currency)
  ) THEN
    PERFORM public.ensure_wallet_account(_p.driver_id, _payer_account_type, upper(_p.currency));
  END IF;

  -- Defensive wallet check: Guarantee owner wallet exists
  IF _p.owner_id IS NOT NULL AND _owner_share > 0 AND NOT EXISTS (
    SELECT 1 FROM public.wallet_accounts
    WHERE user_id = _p.owner_id AND account_type = 'owner' AND currency = upper(_p.currency)
  ) THEN
    PERFORM public.ensure_wallet_account(_p.owner_id, 'owner', upper(_p.currency));
  END IF;

  PERFORM public.post_wallet_entry(
    _p.driver_id, _payer_account_type, upper(_p.currency), 'debit', _p.amount, _entry_type,
    'payment:' || _p.id || ':payer', 'payments', _p.id, _provider, _provider_reference,
    'Payment (' || _p.purpose || ')', jsonb_build_object('purpose', _p.purpose), 'posted');

  IF _owner_share > 0 THEN
    PERFORM public.post_wallet_entry(
      _p.owner_id, 'owner', upper(_p.currency), 'credit', _owner_share, 'owner_share',
      'payment:' || _p.id || ':owner', 'payments', _p.id, _provider, _provider_reference,
      'Owner share of rental payment',
      jsonb_build_object('owner_share_pct', _owner_pct, 'platform_fee', _platform_fee), 'posted');

    -- Record single owner_earnings row
    INSERT INTO public.owner_earnings (
      owner_id, vehicle_id, rental_id, amount, currency, status, payout_method, payout_reference, processed_at
    )
    VALUES (
      _p.owner_id, _p.vehicle_id, _p.rental_id, _owner_share, upper(_p.currency), 'completed',
      coalesce(_provider, 'settlement'), coalesce(_provider_reference, 'settled_' || _p.id::text), now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF _platform_fee > 0 THEN
    PERFORM public.post_wallet_entry(
      PLATFORM_USER, 'platform', upper(_p.currency), 'credit', _platform_fee, 'platform_fee',
      'payment:' || _p.id || ':platform', 'payments', _p.id, _provider, _provider_reference,
      'Platform fee (' || _p.purpose || ')',
      jsonb_build_object('owner_share_pct', _owner_pct, 'owner_share', _owner_share), 'posted');
  END IF;

  IF _p.purpose LIKE 'subscription_%' AND _p.subscription_plan_id IS NOT NULL THEN
    BEGIN
      _sub_id := public.activate_subscription_on_payment(
        _p.driver_id,
        _p.subscription_plan_id,
        _p.id,
        coalesce(_p.transaction_id, _provider_reference, _p.id::text),
        coalesce(_p.payment_method, _provider, 'unknown'));
    EXCEPTION WHEN OTHERS THEN
      _sub_id := NULL;
      _sub_error := SQLERRM;
      INSERT INTO public.admin_notifications(recipient_id, kind, title, body, related_user_id, metadata)
      SELECT ur.user_id,
             'subscription_activation_failed',
             'Subscription paid but not activated',
             'Payment ' || _p.id || ' was captured but the subscription could not be activated: ' || _sub_error,
             _p.driver_id,
             jsonb_build_object('payment_id', _p.id, 'user_id', _p.driver_id,
                                'plan_id', _p.subscription_plan_id, 'error', _sub_error)
        FROM public.user_roles ur
       WHERE ur.role = 'admin'::public.app_role;
    END;
  END IF;

  SELECT id INTO _inv_id FROM public.invoices WHERE payment_id = _p.id LIMIT 1;
  IF _inv_id IS NULL THEN
    INSERT INTO public.invoices(
      invoice_type, status, driver_id, owner_id, rental_id, vehicle_id,
      subscription_id, payment_id, amount, tax_amount, total_amount, currency,
      region, description, paid_at, idempotency_key)
    VALUES (
      CASE WHEN _p.purpose LIKE 'subscription_%' THEN 'subscription'
           WHEN _p.purpose = 'security_deposit' THEN 'deposit'
           WHEN _p.purpose = 'late_fee' THEN 'fee'
           WHEN _p.purpose = 'rental' THEN 'rental'
           ELSE 'other' END,
      'paid', _p.driver_id, _p.owner_id, _p.rental_id, _p.vehicle_id,
      _sub_id, _p.id, _p.amount, _tax_total, _p.amount, _p.currency,
      _region, 'Auto-generated for ' || _p.purpose || ' payment', now(),
      'auto-inv-' || _p.id::text)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO _inv_id;
  ELSE
    UPDATE public.invoices
       SET status = 'paid', paid_at = coalesce(paid_at, now()), tax_amount = _tax_total
     WHERE id = _inv_id AND status <> 'paid';
  END IF;

  UPDATE public.payments
     SET owner_share_amount = _owner_share,
         platform_fee_amount = _platform_fee,
         tax_amount = _tax_total,
         settled_at = now()
   WHERE id = _p.id;

  INSERT INTO public.admin_audit_log(admin_id, action, target_table, target_id, details)
  VALUES (coalesce(auth.uid(), PLATFORM_USER), 'payment_settled', 'payments', _p.id::text,
          jsonb_build_object(
            'purpose', _p.purpose, 'amount', _p.amount, 'currency', _p.currency,
            'owner_share', _owner_share, 'platform_fee', _platform_fee,
            'tax_amount', _tax_total, 'jurisdiction', _jur,
            'invoice_id', _inv_id, 'subscription_id', _sub_id,
            'subscription_error', _sub_error,
            'provider', _provider, 'provider_reference', _provider_reference));

  RETURN jsonb_build_object(
    'ok', true, 'duplicate', false, 'payment_id', _p.id,
    'owner_share', _owner_share, 'platform_fee', _platform_fee,
    'tax_amount', _tax_total, 'invoice_id', _inv_id,
    'subscription_id', _sub_id, 'subscription_error', _sub_error);
END;
$function$;

-- 9. Rental Agreement Archive: Link legal_agreements directly to rental_id
ALTER TABLE public.legal_agreements
  ADD COLUMN IF NOT EXISTS rental_id UUID REFERENCES public.rentals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_legal_agreements_rental_id
  ON public.legal_agreements(rental_id);

