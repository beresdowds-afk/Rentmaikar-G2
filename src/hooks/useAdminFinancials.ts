import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CurrencyTotals {
  usd: number;
  ngn: number;
}

export interface AdminFinancials {
  income: CurrencyTotals;
  ownerPayouts: CurrencyTotals;
  adminWithdrawals: {
    weekly: CurrencyTotals;
    monthly: CurrencyTotals;
  };
}

const EMPTY: AdminFinancials = {
  income: { usd: 0, ngn: 0 },
  ownerPayouts: { usd: 0, ngn: 0 },
  adminWithdrawals: {
    weekly: { usd: 0, ngn: 0 },
    monthly: { usd: 0, ngn: 0 },
  },
};

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

const sevenDaysAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const addTo = (totals: CurrencyTotals, currency: string | null, amount: number | null) => {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return;
  if ((currency ?? '').toUpperCase() === 'NGN') totals.ngn += value;
  else totals.usd += value;
};

/**
 * Real platform financials sourced from the payments and owner_payouts tables.
 * Returns zeroed totals when no settled records exist — never placeholder data.
 */
export function useAdminFinancials() {
  const query = useQuery({
    queryKey: ['admin-financials'],
    staleTime: 60_000,
    queryFn: async (): Promise<AdminFinancials> => {
      const monthStart = startOfMonth();
      const weekStart = sevenDaysAgo();

      const [paymentsRes, payoutsRes] = await Promise.all([
        supabase
          .from('payments')
          .select('amount, currency, platform_fee_amount, created_at, status')
          .in('status', ['completed', 'succeeded', 'success', 'paid'])
          .gte('created_at', monthStart),
        supabase
          .from('owner_payouts')
          .select('amount, currency, created_at, status')
          .in('status', ['completed', 'success', 'paid', 'processed'])
          .gte('created_at', monthStart),
      ]);

      if (paymentsRes.error) throw paymentsRes.error;
      if (payoutsRes.error) throw payoutsRes.error;

      const result: AdminFinancials = {
        income: { usd: 0, ngn: 0 },
        ownerPayouts: { usd: 0, ngn: 0 },
        adminWithdrawals: { weekly: { usd: 0, ngn: 0 }, monthly: { usd: 0, ngn: 0 } },
      };

      for (const p of paymentsRes.data ?? []) {
        addTo(result.income, p.currency, p.amount);
        addTo(result.adminWithdrawals.monthly, p.currency, p.platform_fee_amount);
        if (p.created_at && p.created_at >= weekStart) {
          addTo(result.adminWithdrawals.weekly, p.currency, p.platform_fee_amount);
        }
      }

      for (const p of payoutsRes.data ?? []) {
        addTo(result.ownerPayouts, p.currency, p.amount);
      }

      return result;
    },
  });

  return {
    financials: query.data ?? EMPTY,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Live fleet/user counters for the admin stat grid. */
export function useAdminFleetCounts() {
  const query = useQuery({
    queryKey: ['admin-fleet-counts'],
    staleTime: 60_000,
    queryFn: async () => {
      const [vehicles, drivers, defaults] = await Promise.all([
        supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', 'driver'),
        supabase.from('payment_defaults').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ]);

      return {
        activeVehicles: vehicles.count ?? 0,
        activeDrivers: drivers.count ?? 0,
        paymentDefaults: defaults.count ?? 0,
      };
    },
  });

  return {
    counts: query.data ?? { activeVehicles: 0, activeDrivers: 0, paymentDefaults: 0 },
    isLoading: query.isLoading,
  };
}
