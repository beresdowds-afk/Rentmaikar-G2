
-- 1) Rental deposit tracking + negotiation link
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS security_deposit_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS security_deposit_currency TEXT,
  ADD COLUMN IF NOT EXISTS security_deposit_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS security_deposit_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS negotiation_id UUID REFERENCES public.price_negotiations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rentals_negotiation_id ON public.rentals(negotiation_id);

-- 2) Admin RPC: provision an active rental from a locked negotiation and generate deposit + first-period invoices
CREATE OR REPLACE FUNCTION public.admin_provision_rental_from_negotiation(
  _negotiation_id UUID,
  _start_date TIMESTAMPTZ,
  _end_date TIMESTAMPTZ,
  _payment_frequency TEXT DEFAULT 'weekly',
  _pickup_location TEXT DEFAULT NULL,
  _return_location TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _neg public.price_negotiations%ROWTYPE;
  _region TEXT;
  _deposit NUMERIC(12,2);
  _deposit_currency TEXT;
  _period_days INT;
  _period_amount NUMERIC(12,2);
  _rental_id UUID;
  _deposit_invoice_id UUID;
  _rental_invoice_id UUID;
  _pickup TEXT;
  _return TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can provision rentals';
  END IF;

  IF _payment_frequency NOT IN ('daily','weekly') THEN
    RAISE EXCEPTION 'payment_frequency must be daily or weekly';
  END IF;
  IF _end_date <= _start_date THEN
    RAISE EXCEPTION 'end_date must be after start_date';
  END IF;

  SELECT * INTO _neg FROM public.price_negotiations WHERE id = _negotiation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negotiation not found'; END IF;
  IF _neg.is_locked IS NOT TRUE OR _neg.final_daily_rate IS NULL THEN
    RAISE EXCEPTION 'Negotiation is not locked or has no final rate';
  END IF;

  -- Derive region from negotiation currency (matches security_deposit_settings.region)
  _region := CASE UPPER(COALESCE(_neg.currency,'USD'))
    WHEN 'NGN' THEN 'Nigeria'
    WHEN 'USD' THEN 'USA'
    ELSE 'USA' END;

  SELECT amount, currency INTO _deposit, _deposit_currency
    FROM public.security_deposit_settings
   WHERE is_active = true AND region = _region
   ORDER BY updated_at DESC
   LIMIT 1;

  IF _deposit IS NULL THEN
    RAISE EXCEPTION 'No active security deposit setting found for region %', _region;
  END IF;

  _period_days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_end_date - _start_date)) / 86400.0)::INT);
  _period_amount := ROUND(_neg.final_daily_rate * _period_days, 2);

  SELECT COALESCE(_pickup_location, v.pickup_location), _return_location
    INTO _pickup, _return
    FROM public.vehicles v WHERE v.id = _neg.vehicle_id;

  -- Reuse existing rental for this negotiation if one already exists (idempotent-ish)
  SELECT id INTO _rental_id FROM public.rentals
   WHERE negotiation_id = _neg.id
   ORDER BY created_at DESC LIMIT 1;

  IF _rental_id IS NULL THEN
    INSERT INTO public.rentals(
      vehicle_id, driver_id, owner_id, start_date, end_date,
      payment_frequency, daily_rate, currency, status, region,
      pickup_location, return_location,
      security_deposit_amount, security_deposit_currency, security_deposit_status,
      negotiation_id
    ) VALUES (
      _neg.vehicle_id, _neg.driver_id, _neg.owner_id, _start_date, _end_date,
      _payment_frequency, _neg.final_daily_rate, _neg.currency, 'pending_payment', _region,
      _pickup, _return,
      _deposit, _deposit_currency, 'pending',
      _neg.id
    ) RETURNING id INTO _rental_id;
  END IF;

  -- Deposit invoice (idempotent by unique idempotency_key)
  INSERT INTO public.invoices(
    invoice_number, invoice_type, status, driver_id, owner_id, rental_id, vehicle_id,
    amount, tax_amount, total_amount, currency, region, description, line_items,
    due_date, created_by, idempotency_key
  ) VALUES (
    'INV-DEP-' || substr(_rental_id::text,1,8) || '-' || to_char(now(),'YYMMDDHH24MISS'),
    'security_deposit', 'draft', _neg.driver_id, _neg.owner_id, _rental_id, _neg.vehicle_id,
    _deposit, 0, _deposit, _deposit_currency, _region,
    'Refundable security deposit for ' || COALESCE(_neg.vehicle_year::text,'') || ' ' ||
      COALESCE(_neg.vehicle_make,'') || ' ' || COALESCE(_neg.vehicle_model,''),
    jsonb_build_array(jsonb_build_object(
      'description','Security deposit','quantity',1,'unit_price',_deposit,'total',_deposit)),
    _start_date, auth.uid(),
    'deposit-' || _rental_id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _deposit_invoice_id;

  IF _deposit_invoice_id IS NULL THEN
    SELECT id INTO _deposit_invoice_id FROM public.invoices
     WHERE idempotency_key = 'deposit-' || _rental_id::text LIMIT 1;
  END IF;

  -- First-period rental invoice (idempotent)
  INSERT INTO public.invoices(
    invoice_number, invoice_type, status, driver_id, owner_id, rental_id, vehicle_id,
    amount, tax_amount, total_amount, currency, region, description, line_items,
    due_date, created_by, idempotency_key
  ) VALUES (
    'INV-RNT-' || substr(_rental_id::text,1,8) || '-' || to_char(now(),'YYMMDDHH24MISS'),
    'rental', 'draft', _neg.driver_id, _neg.owner_id, _rental_id, _neg.vehicle_id,
    _period_amount, 0, _period_amount, _neg.currency, _region,
    'Rental charge: ' || _period_days || ' day(s) @ ' || _neg.currency || ' ' ||
      _neg.final_daily_rate::text || '/day (' || _payment_frequency || ')',
    jsonb_build_array(jsonb_build_object(
      'description', 'Daily rental rate (agreed)',
      'quantity', _period_days,
      'unit_price', _neg.final_daily_rate,
      'total', _period_amount)),
    _end_date, auth.uid(),
    'rental-' || _rental_id::text || '-first'
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _rental_invoice_id;

  IF _rental_invoice_id IS NULL THEN
    SELECT id INTO _rental_invoice_id FROM public.invoices
     WHERE idempotency_key = 'rental-' || _rental_id::text || '-first' LIMIT 1;
  END IF;

  BEGIN
    INSERT INTO public.invoice_activity_log(entity_type, entity_id, action, actor_id, details)
    VALUES ('invoice', _deposit_invoice_id, 'provisioned_from_negotiation', auth.uid(),
      jsonb_build_object('negotiation_id', _neg.id, 'rental_id', _rental_id, 'kind','deposit'));
    INSERT INTO public.invoice_activity_log(entity_type, entity_id, action, actor_id, details)
    VALUES ('invoice', _rental_invoice_id, 'provisioned_from_negotiation', auth.uid(),
      jsonb_build_object('negotiation_id', _neg.id, 'rental_id', _rental_id,
        'daily_rate', _neg.final_daily_rate, 'days', _period_days));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'rental_id', _rental_id,
    'deposit_invoice_id', _deposit_invoice_id,
    'rental_invoice_id', _rental_invoice_id,
    'deposit_amount', _deposit,
    'rental_amount', _period_amount,
    'daily_rate', _neg.final_daily_rate,
    'period_days', _period_days,
    'currency', _neg.currency,
    'region', _region
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_provision_rental_from_negotiation(uuid, timestamptz, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provision_rental_from_negotiation(uuid, timestamptz, timestamptz, text, text, text) TO authenticated;

-- 3) Admin RPC: generate the next rental-period invoice for an active rental
CREATE OR REPLACE FUNCTION public.admin_generate_next_rental_invoice(
  _rental_id UUID,
  _period_start TIMESTAMPTZ,
  _period_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.rentals%ROWTYPE;
  _days INT;
  _amount NUMERIC(12,2);
  _inv_id UUID;
  _idem TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can generate invoices'; END IF;
  SELECT * INTO _r FROM public.rentals WHERE id = _rental_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rental not found'; END IF;
  IF _period_end <= _period_start THEN RAISE EXCEPTION 'period_end must be after period_start'; END IF;

  _days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_period_end - _period_start))/86400.0)::INT);
  _amount := ROUND(_r.daily_rate * _days, 2);
  _idem := 'rental-' || _rental_id::text || '-' || to_char(_period_start,'YYYYMMDD') || '-' || to_char(_period_end,'YYYYMMDD');

  INSERT INTO public.invoices(
    invoice_number, invoice_type, status, driver_id, owner_id, rental_id, vehicle_id,
    amount, tax_amount, total_amount, currency, region, description, line_items,
    due_date, created_by, idempotency_key
  ) VALUES (
    'INV-RNT-' || substr(_rental_id::text,1,8) || '-' || to_char(now(),'YYMMDDHH24MISS'),
    'rental', 'draft', _r.driver_id, _r.owner_id, _r.id, _r.vehicle_id,
    _amount, 0, _amount, _r.currency, _r.region,
    'Rental charge: ' || _days || ' day(s) @ ' || _r.currency || ' ' || _r.daily_rate::text || '/day',
    jsonb_build_array(jsonb_build_object(
      'description','Daily rental rate (agreed)','quantity',_days,
      'unit_price',_r.daily_rate,'total',_amount)),
    _period_end, auth.uid(), _idem
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _inv_id;

  IF _inv_id IS NULL THEN
    SELECT id INTO _inv_id FROM public.invoices WHERE idempotency_key = _idem LIMIT 1;
  END IF;

  RETURN jsonb_build_object('invoice_id', _inv_id, 'amount', _amount, 'days', _days, 'idempotent', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_generate_next_rental_invoice(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_next_rental_invoice(uuid, timestamptz, timestamptz) TO authenticated;

-- 4) Admin RPC: release security deposit
CREATE OR REPLACE FUNCTION public.admin_release_security_deposit(
  _rental_id UUID, _reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _r public.rentals%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can release deposits'; END IF;
  SELECT * INTO _r FROM public.rentals WHERE id = _rental_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rental not found'; END IF;
  UPDATE public.rentals
     SET security_deposit_status = 'released',
         security_deposit_released_at = now()
   WHERE id = _rental_id AND security_deposit_status <> 'released';
  BEGIN
    INSERT INTO public.invoice_activity_log(entity_type, entity_id, action, actor_id, details)
    VALUES ('rental', _rental_id, 'deposit_released', auth.uid(),
      jsonb_build_object('reason', _reason, 'amount', _r.security_deposit_amount));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object('ok', true, 'rental_id', _rental_id, 'status','released');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_release_security_deposit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_security_deposit(uuid, text) TO authenticated;
