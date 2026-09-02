import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PaymentDefault } from '@/lib/payment-config';

/** Active payment defaults straight from the database (no seeded rows). */
export function usePaymentDefaults() {
  const query = useQuery({
    queryKey: ['admin-payment-defaults'],
    staleTime: 30_000,
    queryFn: async (): Promise<PaymentDefault[]> => {
      const { data, error } = await supabase
        .from('payment_defaults')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        driverId: row.driver_id ?? '',
        vehicleId: row.vehicle_id ?? '',
        rentalId: row.rental_id ?? '',
        amountDue: Number(row.amount_due ?? 0),
        currency: (row.currency ?? 'USD') as PaymentDefault['currency'],
        paymentFrequency: (row.payment_frequency ?? 'weekly') as PaymentDefault['paymentFrequency'],
        hoursOverdue: row.hours_overdue ?? 0,
        notificationsSent: row.notifications_sent ?? 0,
        lastNotificationAt: row.last_notification_at ? new Date(row.last_notification_at) : undefined,
        deactivationEligible: Boolean(row.deactivation_eligible),
        status: (row.status ?? 'active') as PaymentDefault['status'],
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      }));
    },
  });

  return {
    paymentDefaults: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
