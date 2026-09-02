CREATE OR REPLACE FUNCTION public.settle_payment_financials(_payment_id uuid, _provider text DEFAULT NULL::text, _provider_reference text DEFAULT NULL::text)
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
  END IF;

  IF _platform_fee > 0 THEN
    PERFORM public.post_wallet_entry(
      PLATFORM_USER, 'platform', upper(_p.currency), 'credit', _platform_fee, 'platform_fee',
      'payment:' || _p.id || ':platform', 'payments', _p.id, _provider, _provider_reference,
      'Platform commission (' || _p.purpose || ')',
      jsonb_build_object('purpose', _p.purpose, 'tax_amount', _tax_total), 'posted');
  END IF;

  IF _owner_share > 0 AND _p.vehicle_id IS NOT NULL THEN
    INSERT INTO public.owner_earnings(
      owner_id, vehicle_id, rental_id, amount, currency,
      period_start, period_end, status, payout_reference)
    VALUES (
      _p.owner_id, _p.vehicle_id, _p.rental_id, _owner_share, _p.currency,
      CURRENT_DATE, CURRENT_DATE, 'pending', 'payment:' || _p.id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF _p.purpose LIKE 'subscription_%' AND _p.subscription_plan_id IS NOT NULL THEN
    BEGIN
      _sub_id := public.activate_user_subscription(
        _p.driver_id, _p.subscription_plan_id,
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