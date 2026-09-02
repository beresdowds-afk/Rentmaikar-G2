/**
 * Tax Calculation Engine
 * 
 * Implements the global SaaS tax structure:
 * - Income tax follows where the company is resident (Nigeria)
 * - Sales/VAT tax follows where the customer is located (US states / Nigeria)
 * 
 * Dual-entity structure:
 * - Nigerian operating company (development + operations)
 * - US LLC payment entity (USD collection + state sales tax compliance)
 */

import { supabase } from "@/integrations/supabase/client";

export interface TaxRule {
  id: string;
  jurisdiction_level: 'country' | 'state' | 'city';
  jurisdiction_code: string;
  jurisdiction_name: string;
  tax_type: 'income_tax' | 'vat' | 'sales_tax' | 'withholding_tax' | 'service_tax';
  rate_percent: number;
  threshold_amount: number | null;
  threshold_transactions: number | null;
  is_exempt: boolean;
  exemption_reason: string | null;
  applies_to: string;
  is_active: boolean;
  notes: string | null;
}

export interface TaxCalculationResult {
  subtotal: number;
  taxLines: TaxLineItem[];
  totalTax: number;
  grandTotal: number;
  currency: string;
  isExportService: boolean;
}

export interface TaxLineItem {
  taxType: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
  isExempt: boolean;
  exemptionReason?: string;
}

export interface NexusStatus {
  jurisdictionCode: string;
  jurisdictionName: string;
  cumulativeRevenue: number;
  cumulativeTransactions: number;
  thresholdRevenue: number | null;
  thresholdTransactions: number | null;
  nexusTriggered: boolean;
  revenuePercent: number;
  transactionPercent: number;
}

/**
 * Fetch active tax rules for a jurisdiction
 */
export async function getTaxRulesForJurisdiction(
  customerCountry: 'USA' | 'Nigeria' | (string & {}),
  stateCode?: string
): Promise<TaxRule[]> {
  let query = supabase
    .from('tax_rules')
    .select('*')
    .eq('is_active', true)
    .eq('applies_to', 'customer');

  if (customerCountry === 'Nigeria') {
    query = query.eq('jurisdiction_code', 'NG');
  } else if (stateCode) {
    // Get state-specific rules
    query = query.eq('jurisdiction_code', `US-${stateCode}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch tax rules:', error);
    return [];
  }
  return (data || []) as unknown as TaxRule[];
}

/**
 * Calculate applicable taxes for a transaction
 */
export async function calculateTax(
  amount: number,
  currency: 'USD' | 'NGN' | (string & {}),
  customerCountry: 'USA' | 'Nigeria' | (string & {}),
  stateCode?: string
): Promise<TaxCalculationResult> {
  const result: TaxCalculationResult = {
    subtotal: amount,
    taxLines: [],
    totalTax: 0,
    grandTotal: amount,
    currency,
    isExportService: false,
  };

  // Determine if this is an export service (NG company → US customer)
  if (customerCountry === 'USA') {
    result.isExportService = true;
    
    // Check state sales tax (only if nexus triggered)
    if (stateCode) {
      const nexus = await checkNexusStatus(`US-${stateCode}`);
      if (nexus?.nexusTriggered) {
        const rules = await getTaxRulesForJurisdiction('USA', stateCode);
        for (const rule of rules) {
          if (rule.tax_type === 'sales_tax' && !rule.is_exempt) {
            const taxAmount = amount * (rule.rate_percent / 100);
            result.taxLines.push({
              taxType: 'Sales Tax',
              jurisdictionCode: rule.jurisdiction_code,
              jurisdictionName: rule.jurisdiction_name,
              rate: rule.rate_percent,
              taxableAmount: amount,
              taxAmount: Math.round(taxAmount * 100) / 100,
              isExempt: false,
            });
          }
        }
      }
    }

    // VAT is exempt for export services
    result.taxLines.push({
      taxType: 'VAT',
      jurisdictionCode: 'NG-EXPORT',
      jurisdictionName: 'Nigeria (Export)',
      rate: 0,
      taxableAmount: amount,
      taxAmount: 0,
      isExempt: true,
      exemptionReason: 'Export of services – VAT exempt',
    });
  } else {
    // Nigerian customer: apply 7.5% VAT
    const vatAmount = amount * 0.075;
    result.taxLines.push({
      taxType: 'VAT',
      jurisdictionCode: 'NG',
      jurisdictionName: 'Nigeria',
      rate: 7.5,
      taxableAmount: amount,
      taxAmount: Math.round(vatAmount * 100) / 100,
      isExempt: false,
    });
  }

  // Sum up tax
  result.totalTax = result.taxLines.reduce((sum, line) => sum + line.taxAmount, 0);
  result.grandTotal = result.subtotal + result.totalTax;

  return result;
}

/**
 * Synchronous tax calculation using cached/known rates (no DB call)
 * For use in UI where async isn't ideal
 */
export function calculateTaxSync(
  amount: number,
  currency: 'USD' | 'NGN' | (string & {}),
  customerCountry: 'USA' | 'Nigeria' | (string & {}),
  stateCode?: string,
  nexusTriggered: boolean = false,
  stateTaxRate: number = 0
): TaxCalculationResult {
  const result: TaxCalculationResult = {
    subtotal: amount,
    taxLines: [],
    totalTax: 0,
    grandTotal: amount,
    currency,
    isExportService: customerCountry === 'USA',
  };

  if (customerCountry === 'USA') {
    // State sales tax only if nexus triggered
    if (nexusTriggered && stateCode && stateTaxRate > 0) {
      const taxAmount = amount * (stateTaxRate / 100);
      result.taxLines.push({
        taxType: 'Sales Tax',
        jurisdictionCode: `US-${stateCode}`,
        jurisdictionName: stateCode,
        rate: stateTaxRate,
        taxableAmount: amount,
        taxAmount: Math.round(taxAmount * 100) / 100,
        isExempt: false,
      });
    }
    // VAT exempt for exports
    result.taxLines.push({
      taxType: 'VAT',
      jurisdictionCode: 'NG-EXPORT',
      jurisdictionName: 'Nigeria (Export)',
      rate: 0,
      taxableAmount: amount,
      taxAmount: 0,
      isExempt: true,
      exemptionReason: 'Export of services – VAT exempt',
    });
  } else {
    // Nigeria 7.5% VAT
    const vatAmount = amount * 0.075;
    result.taxLines.push({
      taxType: 'VAT',
      jurisdictionCode: 'NG',
      jurisdictionName: 'Nigeria',
      rate: 7.5,
      taxableAmount: amount,
      taxAmount: Math.round(vatAmount * 100) / 100,
      isExempt: false,
    });
  }

  result.totalTax = result.taxLines.reduce((sum, line) => sum + line.taxAmount, 0);
  result.grandTotal = result.subtotal + result.totalTax;
  return result;
}

/**
 * Check nexus status for a US state
 */
export async function checkNexusStatus(jurisdictionCode: string): Promise<NexusStatus | null> {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const { data, error } = await supabase
    .from('tax_nexus_tracking')
    .select('*')
    .eq('jurisdiction_code', jurisdictionCode)
    .eq('period_year', currentYear)
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const d = data as any;
  const thresholdRev = d.threshold_revenue || 100000;
  const thresholdTx = d.threshold_transactions || 200;

  return {
    jurisdictionCode: d.jurisdiction_code,
    jurisdictionName: d.jurisdiction_name,
    cumulativeRevenue: d.cumulative_revenue,
    cumulativeTransactions: d.cumulative_transactions,
    thresholdRevenue: thresholdRev,
    thresholdTransactions: thresholdTx,
    nexusTriggered: d.nexus_triggered,
    revenuePercent: Math.min(100, (d.cumulative_revenue / thresholdRev) * 100),
    transactionPercent: Math.min(100, (d.cumulative_transactions / thresholdTx) * 100),
  };
}

/**
 * Get all nexus statuses for monitoring
 */
export async function getAllNexusStatuses(): Promise<NexusStatus[]> {
  const currentYear = new Date().getFullYear();

  const { data, error } = await supabase
    .from('tax_nexus_tracking')
    .select('*')
    .eq('period_year', currentYear)
    .order('jurisdiction_code');

  if (error || !data) return [];

  return (data as any[]).map((d) => {
    const thresholdRev = d.threshold_revenue || 100000;
    const thresholdTx = d.threshold_transactions || 200;
    return {
      jurisdictionCode: d.jurisdiction_code,
      jurisdictionName: d.jurisdiction_name,
      cumulativeRevenue: d.cumulative_revenue,
      cumulativeTransactions: d.cumulative_transactions,
      thresholdRevenue: thresholdRev,
      thresholdTransactions: thresholdTx,
      nexusTriggered: d.nexus_triggered,
      revenuePercent: Math.min(100, (d.cumulative_revenue / thresholdRev) * 100),
      transactionPercent: Math.min(100, (d.cumulative_transactions / thresholdTx) * 100),
    };
  });
}

/**
 * Get company income tax bracket for Nigeria
 */
export function getNigeriaIncomeTaxBracket(annualRevenueNGN: number): {
  rate: number;
  bracket: string;
  description: string;
} {
  if (annualRevenueNGN < 25_000_000) {
    return { rate: 0, bracket: 'Small', description: 'Revenue < ₦25M — 0% CIT' };
  }
  if (annualRevenueNGN < 100_000_000) {
    return { rate: 20, bracket: 'Medium', description: 'Revenue ₦25M–₦100M — 20% CIT' };
  }
  return { rate: 30, bracket: 'Large', description: 'Revenue > ₦100M — 30% CIT' };
}

/**
 * Format tax amount for display
 */
export function formatTaxAmount(amount: number, currency: string): string {
  const symbol = currency === 'NGN' ? '₦' : '$';
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
