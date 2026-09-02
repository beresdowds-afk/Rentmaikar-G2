
-- Tax jurisdiction types
CREATE TYPE public.tax_jurisdiction_level AS ENUM ('country', 'state', 'city');
CREATE TYPE public.tax_type AS ENUM ('income_tax', 'vat', 'sales_tax', 'withholding_tax', 'service_tax');
CREATE TYPE public.entity_type AS ENUM ('operating_company', 'payment_entity', 'individual');

-- Core tax rules table: stores tax rates per jurisdiction
CREATE TABLE public.tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_level tax_jurisdiction_level NOT NULL,
  jurisdiction_code TEXT NOT NULL, -- e.g. 'NG', 'US', 'US-CA', 'US-TX'
  jurisdiction_name TEXT NOT NULL,
  tax_type tax_type NOT NULL,
  rate_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  threshold_amount NUMERIC(14,2), -- nexus threshold amount
  threshold_currency TEXT DEFAULT 'USD',
  threshold_transactions INTEGER, -- nexus transaction threshold
  is_exempt BOOLEAN NOT NULL DEFAULT false,
  exemption_reason TEXT,
  applies_to TEXT NOT NULL DEFAULT 'customer', -- 'customer', 'company', 'both'
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE(jurisdiction_code, tax_type, effective_from)
);

-- Company tax entities: tracks the dual-entity structure (NG company + US LLC)
CREATE TABLE public.tax_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name TEXT NOT NULL,
  entity_type entity_type NOT NULL,
  country_code TEXT NOT NULL,
  tax_id TEXT, -- EIN, TIN, etc.
  jurisdiction_code TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  role TEXT NOT NULL DEFAULT 'operating', -- 'operating', 'payment', 'holding'
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nexus tracking: monitors per-state revenue/transactions for US sales tax
CREATE TABLE public.tax_nexus_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code TEXT NOT NULL, -- e.g. 'US-DC', 'US-MD', 'US-VA'
  jurisdiction_name TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  cumulative_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  cumulative_transactions INTEGER NOT NULL DEFAULT 0,
  threshold_revenue NUMERIC(14,2),
  threshold_transactions INTEGER,
  nexus_triggered BOOLEAN NOT NULL DEFAULT false,
  nexus_triggered_at TIMESTAMPTZ,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(jurisdiction_code, period_year, period_month)
);

-- Tax collected per transaction
CREATE TABLE public.tax_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID, -- references payments table
  rental_id UUID,
  tax_rule_id UUID REFERENCES public.tax_rules(id),
  tax_type tax_type NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  taxable_amount NUMERIC(14,2) NOT NULL,
  tax_rate NUMERIC(6,3) NOT NULL,
  tax_amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL,
  is_exempt BOOLEAN NOT NULL DEFAULT false,
  exemption_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tax reporting summaries
CREATE TABLE public.tax_reporting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.tax_entities(id),
  jurisdiction_code TEXT NOT NULL,
  tax_type tax_type NOT NULL,
  period_year INTEGER NOT NULL,
  period_quarter INTEGER NOT NULL,
  gross_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  exempt_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_collected NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_remitted NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_owed NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'filed', 'paid'
  filed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_id, jurisdiction_code, tax_type, period_year, period_quarter)
);

-- Enable RLS
ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_nexus_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_reporting_periods ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins manage tax rules" ON public.tax_rules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage tax entities" ON public.tax_entities FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage nexus tracking" ON public.tax_nexus_tracking FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage tax line items" ON public.tax_line_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage tax reporting" ON public.tax_reporting_periods FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Read-only for authenticated users on tax rules (they need to see applicable rates)
CREATE POLICY "Users read active tax rules" ON public.tax_rules FOR SELECT TO authenticated USING (is_active = true);

-- Updated_at triggers
CREATE TRIGGER update_tax_rules_updated_at BEFORE UPDATE ON public.tax_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tax_entities_updated_at BEFORE UPDATE ON public.tax_entities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tax_nexus_updated_at BEFORE UPDATE ON public.tax_nexus_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tax_reporting_updated_at BEFORE UPDATE ON public.tax_reporting_periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
