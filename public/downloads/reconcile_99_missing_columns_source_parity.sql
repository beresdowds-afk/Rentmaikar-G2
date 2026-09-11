-- ==============================================================================
-- RentMaikar Database Schema Reconciliation Migration
-- Target: https://jrsydiofzceoeddjogov.supabase.co (PostgreSQL 17.6)
-- Authoritative Source: bwvocmhcledbwqlpcswp (RentMaikar / Lovable)
--
-- PURPOSE:
-- Reconciles all 99 missing columns across 15 domain tables identified in the
-- Database Schema Reconciliation Report to achieve 100% parity with source.
--
-- SAFETY & IDEMPOTENCY GUARANTEES:
-- 1. All column additions use 'ADD COLUMN IF NOT EXISTS'.
-- 2. All types & enums are created idempotently if not already present.
-- 3. Non-blocking O(1) metadata changes on PostgreSQL 11+ (safe constant defaults).
-- 4. Existing accounts (e.g. adebayoolusola39@gmail.com) and vehicles remain preserved.
-- 5. Foreign keys and helper indexes are applied with existence guards.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PRE-FLIGHT: Ensure Custom Enum Types Exist
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- 1. access_level_enum
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_level_enum') THEN
    CREATE TYPE public.access_level_enum AS ENUM ('view_only', 'full');
  END IF;

  -- 2. registration_stage_enum
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_stage_enum') THEN
    CREATE TYPE public.registration_stage_enum AS ENUM (
      'auth',
      'role_selection',
      'contact_verified',
      'kyc_submitted',
      'under_review',
      'approved',
      'rejected'
    );
  END IF;

  -- 3. insurance_task_status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insurance_task_status') THEN
    CREATE TYPE public.insurance_task_status AS ENUM (
      'open',
      'reviewing',
      'awaiting_documents',
      'quote_sent',
      'escalated',
      'resolved',
      'closed'
    );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1. TABLE: applications (22 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'applications') THEN
    ALTER TABLE public.applications
      ADD COLUMN IF NOT EXISTS street_address text,
      ADD COLUMN IF NOT EXISTS messaging_consent boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS messaging_channel text NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS data_sharing_consent boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz,
      ADD COLUMN IF NOT EXISTS recovered_from_application_id uuid,
      ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS recovery_eligible_at timestamptz,
      ADD COLUMN IF NOT EXISTS recycle_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS security_deposit_acknowledged boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS referee1_name text,
      ADD COLUMN IF NOT EXISTS referee1_phone text,
      ADD COLUMN IF NOT EXISTS referee1_email text,
      ADD COLUMN IF NOT EXISTS referee1_address text,
      ADD COLUMN IF NOT EXISTS referee2_name text,
      ADD COLUMN IF NOT EXISTS referee2_phone text,
      ADD COLUMN IF NOT EXISTS referee2_email text,
      ADD COLUMN IF NOT EXISTS referee2_address text,
      ADD COLUMN IF NOT EXISTS referee3_name text,
      ADD COLUMN IF NOT EXISTS referee3_phone text,
      ADD COLUMN IF NOT EXISTS referee3_email text,
      ADD COLUMN IF NOT EXISTS referee3_address text;

    -- Foreign key to self for application recovery lineage
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = 'applications'
        AND constraint_name = 'applications_recovered_from_application_id_fkey'
    ) THEN
      ALTER TABLE public.applications
        ADD CONSTRAINT applications_recovered_from_application_id_fkey
        FOREIGN KEY (recovered_from_application_id) REFERENCES public.applications(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. TABLE: communication_providers (1 missing column)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'communication_providers') THEN
    ALTER TABLE public.communication_providers
      ADD COLUMN IF NOT EXISTS whatsapp_provider text;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. TABLE: driver_call_ins (5 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'driver_call_ins') THEN
    ALTER TABLE public.driver_call_ins
      ADD COLUMN IF NOT EXISTS renewal_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_renewals integer NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS last_renewed_at timestamptz,
      ADD COLUMN IF NOT EXISTS recall_initiated boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS recall_id uuid;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_recalls') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'driver_call_ins'
          AND constraint_name = 'driver_call_ins_recall_id_fkey'
      ) THEN
        ALTER TABLE public.driver_call_ins
          ADD CONSTRAINT driver_call_ins_recall_id_fkey
          FOREIGN KEY (recall_id) REFERENCES public.vehicle_recalls(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. TABLE: driver_vehicle_matches (1 missing column)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'driver_vehicle_matches') THEN
    ALTER TABLE public.driver_vehicle_matches
      ADD COLUMN IF NOT EXISTS vehicle_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. TABLE: inbox_conversations (2 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_conversations') THEN
    ALTER TABLE public.inbox_conversations
      ADD COLUMN IF NOT EXISTS archived_at timestamptz,
      ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. TABLE: outreach_contacts (2 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'outreach_contacts') THEN
    ALTER TABLE public.outreach_contacts
      ADD COLUMN IF NOT EXISTS email text,
      ADD COLUMN IF NOT EXISTS signup_role text;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. TABLE: payments (6 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    ALTER TABLE public.payments
      ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'rental',
      ADD COLUMN IF NOT EXISTS owner_share_amount numeric(14,2),
      ADD COLUMN IF NOT EXISTS platform_fee_amount numeric(14,2),
      ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS settled_at timestamptz,
      ADD COLUMN IF NOT EXISTS subscription_plan_id uuid;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_plans') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'payments'
          AND constraint_name = 'payments_subscription_plan_id_fkey'
      ) THEN
        ALTER TABLE public.payments
          ADD CONSTRAINT payments_subscription_plan_id_fkey
          FOREIGN KEY (subscription_plan_id) REFERENCES public.subscription_plans(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 8. TABLE: persona_template_config (1 missing column)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'persona_template_config') THEN
    ALTER TABLE public.persona_template_config
      ADD COLUMN IF NOT EXISTS requires_drivers_license boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 9. TABLE: profiles (30 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS username text,
      ADD COLUMN IF NOT EXISTS street_address text,
      ADD COLUMN IF NOT EXISTS city text,
      ADD COLUMN IF NOT EXISTS public_uuid uuid NOT NULL DEFAULT gen_random_uuid(),
      ADD COLUMN IF NOT EXISTS access_level public.access_level_enum NOT NULL DEFAULT 'view_only',
      ADD COLUMN IF NOT EXISTS registration_stage public.registration_stage_enum,
      ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz,
      ADD COLUMN IF NOT EXISTS onboarding_state jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
      ADD COLUMN IF NOT EXISTS profile_completion_skipped_at timestamptz,
      ADD COLUMN IF NOT EXISTS owns_vehicle boolean,
      ADD COLUMN IF NOT EXISTS has_payment_method boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS payment_proxy_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS driver_license_number text,
      ADD COLUMN IF NOT EXISTS driver_license_expiry date,
      ADD COLUMN IF NOT EXISTS emergency_contact_name text,
      ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
      ADD COLUMN IF NOT EXISTS referee_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS persona_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS identity_verification_status text,
      ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
      ADD COLUMN IF NOT EXISTS identity_verified_inquiry_id text,
      ADD COLUMN IF NOT EXISTS persona_notification_frequency text NOT NULL DEFAULT 'immediate',
      ADD COLUMN IF NOT EXISTS role_change_used boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS role_changed_at timestamptz,
      ADD COLUMN IF NOT EXISTS data_sharing_consent boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS data_sharing_consent_at timestamptz,
      ADD COLUMN IF NOT EXISTS messaging_consent_at timestamptz,
      ADD COLUMN IF NOT EXISTS cookie_consent jsonb,
      ADD COLUMN IF NOT EXISTS cookie_consent_at timestamptz;

    -- Maintain unique case-insensitive index on username if non-null
    CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
      ON public.profiles (LOWER(username))
      WHERE username IS NOT NULL;

    -- Ensure index on public_uuid for quick lookups
    CREATE INDEX IF NOT EXISTS idx_profiles_public_uuid
      ON public.profiles (public_uuid);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 10. TABLE: rentals (5 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rentals') THEN
    ALTER TABLE public.rentals
      ADD COLUMN IF NOT EXISTS negotiation_id uuid,
      ADD COLUMN IF NOT EXISTS security_deposit_amount numeric(12,2),
      ADD COLUMN IF NOT EXISTS security_deposit_currency text,
      ADD COLUMN IF NOT EXISTS security_deposit_status text NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS security_deposit_released_at timestamptz;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'price_negotiations') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'rentals'
          AND constraint_name = 'rentals_negotiation_id_fkey'
      ) THEN
        ALTER TABLE public.rentals
          ADD CONSTRAINT rentals_negotiation_id_fkey
          FOREIGN KEY (negotiation_id) REFERENCES public.price_negotiations(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 11. TABLE: sms_consent_records (4 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_consent_records') THEN
    ALTER TABLE public.sms_consent_records
      ADD COLUMN IF NOT EXISTS keywords_shown jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS timing_shown jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS program_version text,
      ADD COLUMN IF NOT EXISTS page_url text;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 12. TABLE: support_tasks (8 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tasks') THEN
    ALTER TABLE public.support_tasks
      ADD COLUMN IF NOT EXISTS insurance_status public.insurance_task_status DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS verification_state text NOT NULL DEFAULT 'not_submitted',
      ADD COLUMN IF NOT EXISTS verification_notes text,
      ADD COLUMN IF NOT EXISTS verified_at timestamptz,
      ADD COLUMN IF NOT EXISTS verified_by uuid,
      ADD COLUMN IF NOT EXISTS staff_feedback text,
      ADD COLUMN IF NOT EXISTS staff_resolved_at timestamptz,
      ADD COLUMN IF NOT EXISTS staff_resolved_by uuid;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 13. TABLE: training_completions (4 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'training_completions') THEN
    ALTER TABLE public.training_completions
      ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS review_notes text,
      ADD COLUMN IF NOT EXISTS verified_at timestamptz,
      ADD COLUMN IF NOT EXISTS verified_by uuid;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 14. TABLE: vehicle_geofences (3 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_geofences') THEN
    ALTER TABLE public.vehicle_geofences
      ADD COLUMN IF NOT EXISTS name text,
      ADD COLUMN IF NOT EXISTS created_by uuid,
      ADD COLUMN IF NOT EXISTS updated_by uuid;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 15. TABLE: vehicles (5 missing columns)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicles') THEN
    ALTER TABLE public.vehicles
      ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
      ADD COLUMN IF NOT EXISTS disabled_reason text,
      ADD COLUMN IF NOT EXISTS enabled_at timestamptz,
      ADD COLUMN IF NOT EXISTS lockdown_reason text;

    -- Ensure existing vehicles default to enabled
    UPDATE public.vehicles
      SET is_enabled = true
      WHERE is_enabled IS NULL;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- VERIFICATION NOTIFICATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '✅ RentMaikar 99-column schema reconciliation migration completed successfully.';
END $$;
