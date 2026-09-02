
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

  _region := CASE UPPER(COALESCE(_neg.currency,'USD'))
    WHEN 'NGN' THEN 'Nigeria' WHEN 'USD' THEN 'USA' ELSE 'USA' END;

  SELECT amount, currency INTO _deposit, _deposit_currency
    FROM public.security_deposit_settings
   WHERE is_active = true AND region = _region
   ORDER BY updated_at DESC LIMIT 1;
  IF _deposit IS NULL THEN
    RAISE EXCEPTION 'No active security deposit setting found for region %', _region;
  END IF;

  _period_days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_end_date - _start_date)) / 86400.0)::INT);
  _period_amount := ROUND(_neg.final_daily_rate * _period_days, 2);

  SELECT COALESCE(_pickup_location, v.pickup_location), _return_location
    INTO _pickup, _return
    FROM public.vehicles v WHERE v.id = _neg.vehicle_id;

  SELECT id INTO _rental_id FROM public.rentals
   WHERE negotiation_id = _neg.id ORDER BY created_at DESC LIMIT 1;

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
      _pickup, _return, _deposit, _deposit_currency, 'pending', _neg.id
    ) RETURNING id INTO _rental_id;
  END IF;

  INSERT INTO public.invoices(
    invoice_number, invoice_type, status, driver_id, owner_id, rental_id, vehicle_id,
    amount, tax_amount, total_amount, currency, region, description, line_items,
    due_date, created_by, idempotency_key
  ) VALUES (
    'INV-DEP-' || substr(_rental_id::text,1,8) || '-' || to_char(now(),'YYMMDDHH24MISS'),
    'deposit', 'draft', _neg.driver_id, _neg.owner_id, _rental_id, _neg.vehicle_id,
    _deposit, 0, _deposit, _deposit_currency, _region,
    'Refundable security deposit for ' || COALESCE(_neg.vehicle_year::text,'') || ' ' ||
      COALESCE(_neg.vehicle_make,'') || ' ' || COALESCE(_neg.vehicle_model,''),
    jsonb_build_array(jsonb_build_object(
      'description','Security deposit','quantity',1,'unit_price',_deposit,'total',_deposit)),
    _start_date, auth.uid(), 'deposit-' || _rental_id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _deposit_invoice_id;

  IF _deposit_invoice_id IS NULL THEN
    SELECT id INTO _deposit_invoice_id FROM public.invoices
     WHERE idempotency_key = 'deposit-' || _rental_id::text LIMIT 1;
  END IF;

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
      'description','Daily rental rate (agreed)','quantity',_period_days,
      'unit_price',_neg.final_daily_rate,'total',_period_amount)),
    _end_date, auth.uid(), 'rental-' || _rental_id::text || '-first'
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
