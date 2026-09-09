export interface TaxLine {
  name: string;
  rate: number;
  taxAmount: number;
  isExempt: boolean;
}

export interface TaxResult {
  totalTax: number;
  taxLines: TaxLine[];
}

export interface TaxRule {
  id: string;
  jurisdiction_code: string;
  name: string;
  rate: number;
  tax_type: string;
  is_active: boolean;
  notes?: string;
}

export interface NexusStatus {
  state: string;
  stateName?: string;
  status: 'active' | 'pending' | 'approaching' | 'exempt';
  cumulativeRevenue: number;
  thresholdRevenue: number;
  revenuePercent: number;
  transactionCount: number;
  thresholdTransactions: number;
  transactionPercent: number;
}

export function calculateTaxSync(
  amount: number,
  currency: string,
  country: string,
  stateCode?: string
): TaxResult {
  const isUS = country?.toLowerCase() === 'usa' || country?.toLowerCase() === 'us' || currency === 'USD';
  const rate = isUS ? 0.0825 : 0.075; // 8.25% or 7.5% VAT in Nigeria
  const taxName = isUS ? (stateCode ? `${stateCode} Sales Tax` : 'State Sales Tax') : 'VAT';
  const taxAmount = Math.round(amount * rate * 100) / 100;

  return {
    totalTax: taxAmount,
    taxLines: [
      {
        name: taxName,
        rate,
        taxAmount,
        isExempt: false,
      },
    ],
  };
}

export async function getAllNexusStatuses(): Promise<NexusStatus[]> {
  return [
    {
      state: 'TX',
      stateName: 'Texas',
      status: 'active',
      cumulativeRevenue: 450000,
      thresholdRevenue: 500000,
      revenuePercent: 90,
      transactionCount: 180,
      thresholdTransactions: 200,
      transactionPercent: 90,
    },
    {
      state: 'CA',
      stateName: 'California',
      status: 'approaching',
      cumulativeRevenue: 380000,
      thresholdRevenue: 500000,
      revenuePercent: 76,
      transactionCount: 140,
      thresholdTransactions: 200,
      transactionPercent: 70,
    },
  ];
}

export function getNigeriaIncomeTaxBracket(revenue: number) {
  return {
    rate: 0.20,
    bracketName: 'Small/Medium Company (20%)',
    description: 'Companies with turnover between 25m and 100m NGN',
  };
}

export function formatTaxAmount(amount: number, currency: string = 'USD'): string {
  const symbol = currency === 'NGN' ? '₦' : '$';
  return `${symbol}${amount.toLocaleString()}`;
}
