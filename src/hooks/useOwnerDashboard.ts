import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

export function useOwnerDashboard() {
  const { user } = useAuth();
  const impersonation = useImpersonation();
  const targetId = impersonation?.role === 'owner' ? impersonation.viewAsUserId : user?.id;

  const { data: vehicles, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['owner-vehicles', targetId],
    queryFn: async () => {
      if (!targetId) return [];
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('owner_id', targetId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!targetId,
  });

  const { data: rentals, isLoading: rentalsLoading } = useQuery({
    queryKey: ['owner-rentals', targetId],
    queryFn: async () => {
      if (!targetId) return [];
      const { data, error } = await supabase
        .from('rentals')
        .select('*, vehicles(*)')
        .eq('owner_id', targetId)
        .eq('status', 'active');
      if (error) throw error;
      return data || [];
    },
    enabled: !!targetId,
  });

  const { data: earnings, isLoading: earningsLoading } = useQuery({
    queryKey: ['owner-earnings', targetId],
    queryFn: async () => {
      if (!targetId) return [];
      const { data, error } = await supabase
        .from('owner_earnings')
        .select('*')
        .eq('owner_id', targetId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!targetId,
  });

  // Balances are derived exclusively from the wallet ledger — never from
  // owner_earnings / owner_payouts (those remain reporting-only records).
  const { data: ledger } = useQuery({
    queryKey: ['owner-ledger-balance', targetId],
    queryFn: async () => {
      if (!targetId) return { available: 0, credited: 0 };
      const { data, error } = await supabase
        .from('wallet_ledger_entries')
        .select('direction, amount, status, entry_type, wallet_accounts!inner(account_type)')
        .eq('user_id', targetId)
        .eq('wallet_accounts.account_type', 'owner');
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        direction: 'credit' | 'debit';
        amount: number;
        status: string;
        entry_type: string;
      }[];
      const available = rows
        .filter((r) => r.status === 'posted')
        .reduce((sum, r) => sum + (r.direction === 'credit' ? Number(r.amount) : -Number(r.amount)), 0);
      const credited = rows
        .filter((r) => r.status !== 'reversed' && r.direction === 'credit')
        .reduce((sum, r) => sum + Number(r.amount), 0);
      return { available, credited };
    },
    enabled: !!targetId,
    staleTime: 30_000,
  });

  const totalEarnings = ledger?.credited ?? 0;
  const availableBalance = ledger?.available ?? 0;


  const activeRentals = rentals?.length ?? 0;

  return {
    vehicles: vehicles || [],
    rentals: rentals || [],
    earnings: earnings || [],
    totalEarnings,
    availableBalance,
    activeRentals,
    isLoading: vehiclesLoading || rentalsLoading || earningsLoading,
  };
}
