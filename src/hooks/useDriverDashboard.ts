import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

export function useDriverDashboard() {
  const { user } = useAuth();
  const impersonation = useImpersonation();
  const targetId = impersonation?.role === 'driver' ? impersonation.viewAsUserId : user?.id;

  const { data: activeRental, isLoading: rentalLoading } = useQuery({
    queryKey: ['driver-rental', targetId],
    queryFn: async () => {
      if (!targetId) return null;
      const { data, error } = await supabase
        .from('rentals')
        .select('*, vehicles(*)')
        .eq('driver_id', targetId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!targetId,
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['driver-payments', targetId],
    queryFn: async () => {
      if (!targetId) return [];
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('driver_id', targetId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!targetId,
  });

  const totalPaid = payments
    ?.filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

  const daysActive = activeRental
    ? Math.floor((Date.now() - new Date(activeRental.start_date).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const vehicle = activeRental?.vehicles;

  return {
    activeRental,
    vehicle,
    payments: payments || [],
    totalPaid,
    daysActive,
    isLoading: rentalLoading || paymentsLoading,
    hasActiveRental: !!activeRental,
  };
}
