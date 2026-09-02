
-- ═══════════════════════════════════════════════════════════════
-- REGIONAL OPERATIONS MANAGEMENT SYSTEM
-- Fully database-driven region/city/feature management
-- ═══════════════════════════════════════════════════════════════

-- 1. PLATFORM COUNTRIES (top-level)
CREATE TABLE public.platform_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,            -- 'US', 'NG', 'GH', etc.
  name TEXT NOT NULL,                    -- 'United States', 'Nigeria'
  flag TEXT NOT NULL DEFAULT '🌍',       -- emoji flag
  currency_code TEXT NOT NULL,           -- 'USD', 'NGN'
  currency_symbol TEXT NOT NULL,         -- '$', '₦'
  phone_prefix TEXT NOT NULL,            -- '+1', '+234'
  payment_gateway TEXT NOT NULL DEFAULT 'paypal', -- 'paypal', 'paystack'
  timezone TEXT NOT NULL DEFAULT 'UTC',
  is_active BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PLATFORM REGIONS (state/province level)
CREATE TABLE public.platform_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.platform_countries(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                    -- 'dc', 'md', 'lagos'
  name TEXT NOT NULL,                    -- 'Washington DC', 'Maryland'
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  map_zoom INT DEFAULT 10,
  requires_police_report BOOLEAN DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(country_id, code)
);

-- 3. PLATFORM CITIES
CREATE TABLE public.platform_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.platform_regions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  search_radius_miles INT DEFAULT 35,
  is_active BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(region_id, name)
);

-- 4. FEATURE FLAGS (what can be toggled)
CREATE TYPE public.feature_scope AS ENUM ('country', 'region', 'city');

CREATE TABLE public.platform_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,              -- 'rentals', 'rent_to_own', 'daily_plans', etc.
  name TEXT NOT NULL,                    -- 'Vehicle Rentals'
  description TEXT,
  category TEXT NOT NULL DEFAULT 'service', -- 'service', 'feature', 'communication'
  is_global_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. FEATURE OVERRIDES per location level
CREATE TABLE public.platform_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES public.platform_features(id) ON DELETE CASCADE,
  scope public.feature_scope NOT NULL,
  country_id UUID REFERENCES public.platform_countries(id) ON DELETE CASCADE,
  region_id UUID REFERENCES public.platform_regions(id) ON DELETE CASCADE,
  city_id UUID REFERENCES public.platform_cities(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  overridden_by UUID,
  overridden_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ensure only one override per feature per location
  UNIQUE(feature_id, scope, country_id, region_id, city_id)
);

-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.platform_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_feature_overrides ENABLE ROW LEVEL SECURITY;

-- Public read for active locations (needed for region detection, catalogue)
CREATE POLICY "Anyone can view active countries"
  ON public.platform_countries FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage countries"
  ON public.platform_countries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Anyone can view active regions"
  ON public.platform_regions FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage regions"
  ON public.platform_regions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Anyone can view active cities"
  ON public.platform_cities FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage cities"
  ON public.platform_cities FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Anyone can view features"
  ON public.platform_features FOR SELECT USING (true);
CREATE POLICY "Admins can manage features"
  ON public.platform_features FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Anyone can view feature overrides"
  ON public.platform_feature_overrides FOR SELECT USING (true);
CREATE POLICY "Admins can manage feature overrides"
  ON public.platform_feature_overrides FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════

CREATE TRIGGER update_platform_countries_updated_at BEFORE UPDATE ON public.platform_countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_platform_regions_updated_at BEFORE UPDATE ON public.platform_regions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_platform_cities_updated_at BEFORE UPDATE ON public.platform_cities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_platform_feature_overrides_updated_at BEFORE UPDATE ON public.platform_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- SEED: Default features
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.platform_features (key, name, description, category, is_global_default) VALUES
  -- Service availability
  ('rentals', 'Vehicle Rentals', 'Core vehicle rental service', 'service', true),
  ('signups', 'New Signups', 'Allow new driver/owner registrations', 'service', true),
  ('payments', 'Payment Processing', 'Accept and process payments', 'service', true),
  ('vehicle_listing', 'Vehicle Listings', 'Allow owners to list vehicles', 'service', true),
  -- Features
  ('rent_to_own', 'Rent-to-Own', 'Rent-to-own purchase program', 'feature', true),
  ('daily_plans', 'Daily Plans', 'Daily rental pricing plans', 'feature', true),
  ('iot_tracking', 'IoT Tracking', 'Vehicle IoT device tracking', 'feature', true),
  ('price_negotiation', 'Price Negotiation', 'Driver price negotiation', 'feature', true),
  ('weekly_inspection', 'Weekly Inspections', 'Vehicle inspection reports', 'feature', true),
  ('incident_reporting', 'Incident Reporting', 'Accident/incident reporting', 'feature', true),
  ('driver_training', 'Driver Training', 'Training module access', 'feature', false),
  ('roadside_assistance', 'Roadside Assistance', 'Roadside partner network', 'feature', false),
  -- Communication channels
  ('sms', 'SMS Notifications', 'Send SMS messages', 'communication', true),
  ('whatsapp', 'WhatsApp Messaging', 'WhatsApp communication channel', 'communication', true),
  ('email', 'Email Notifications', 'Email communication channel', 'communication', true),
  ('voip', 'VoIP Calling', 'Voice calling capabilities', 'communication', true),
  ('push_notifications', 'Push Notifications', 'Browser push notifications', 'communication', false);
