-- Canonical Rentmaikar payment purposes.
-- Existing historical values must be audited before this constraint is applied.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE purpose IS NULL
       OR purpose NOT IN (
         'rental',
         'security_deposit',
         'late_fee',
         'subscription_training',
         'subscription_insurance',
         'subscription_roadside',
         'iot_device',
         'other'
       )
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce canonical payment purposes: legacy/invalid payment purpose values exist.';
  END IF;
END $$;

ALTER TABLE public.payments
  ALTER COLUMN purpose SET DEFAULT 'rental';

ALTER TABLE public.payments
  ALTER COLUMN purpose SET NOT NULL;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_purpose_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_purpose_check
  CHECK (
    purpose IN (
      'rental',
      'security_deposit',
      'late_fee',
      'subscription_training',
      'subscription_insurance',
      'subscription_roadside',
      'iot_device',
      'other'
    )
  );
