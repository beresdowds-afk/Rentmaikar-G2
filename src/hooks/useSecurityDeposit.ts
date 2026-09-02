import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SecurityDepositSetting {
  id: string;
  region: string;
  amount: number;
  currency: string;
  description: string | null;
  updated_at: string;
}

/** Region key used by public pages ("usa" | "nigeria") mapped to DB region values. */
const toDbRegion = (region?: string | null) =>
  (region ?? '').toLowerCase().startsWith('nig') ? 'Nigeria' : 'USA';

export function formatDeposit(setting?: SecurityDepositSetting | null): string {
  if (!setting) return '';
  const symbol = setting.currency === 'NGN' ? '₦' : '$';
  const amount = Number(setting.amount ?? 0);
  if (!Number.isFinite(amount)) return '';
  return `${symbol}${amount.toLocaleString()} ${setting.currency}`;
}

/**
 * Publicly readable security deposit settings, sourced from the ERP editor.
 * Falls back to an empty list on failure so pages never crash.
 */
export function useSecurityDeposits() {
  const query = useQuery({
    queryKey: ['security-deposit-settings'],
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<SecurityDepositSetting[]> => {
      const { data, error } = await supabase
        .from('security_deposit_settings')
        .select('id, region, amount, currency, description, updated_at')
        .eq('is_active', true);

      if (error) throw error;
      return (data ?? []) as SecurityDepositSetting[];
    },
  });

  return {
    deposits: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Deposit for a single region, e.g. "usa" or "nigeria". */
export function useSecurityDeposit(region?: string | null) {
  const { deposits, isLoading, error } = useSecurityDeposits();
  const target = toDbRegion(region);
  const setting = deposits.find((d) => (d.region ?? '').toLowerCase() === target.toLowerCase()) ?? null;

  return {
    deposit: setting,
    formatted: formatDeposit(setting),
    isLoading,
    error,
  };
}
