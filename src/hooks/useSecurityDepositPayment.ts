import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurityDeposit } from './useSecurityDeposit';

export interface SecurityDepositStatus {
  isPaid: boolean;
  paidAt: string | null;
  paymentMethod: string | null;
  transactionReference: string | null;
  amount: number;
  currency: string;
  receiptNumber: string | null;
  status: 'paid' | 'unpaid' | 'processing';
}

/**
 * Checks and manages whether a driver has paid their required Platform Security Deposit / Fee.
 * Enforced as a strict prerequisite before signing owner-driver agreements.
 */
export function useDriverSecurityDepositStatus(region?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { deposit } = useSecurityDeposit(region);

  const queryKey = ['driver-security-deposit-status', user?.id, region];

  const query = useQuery({
    queryKey,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<SecurityDepositStatus> => {
      if (!user?.id) {
        return {
          isPaid: false,
          paidAt: null,
          paymentMethod: null,
          transactionReference: null,
          amount: deposit?.amount || 0,
          currency: deposit?.currency || (region?.toLowerCase().startsWith('nig') ? 'NGN' : 'USD'),
          receiptNumber: null,
          status: 'unpaid',
        };
      }

      // Authoritative state only: server-recorded payments/receipts (never browser storage). for completed security deposit payments or receipts
      try {
        const { data: paymentRecord, error } = await supabase
          .from('payments')
          .select('id, amount, currency, status, payment_method, created_at, reference')
          .eq('user_id', user.id)
          .eq('type', 'security_deposit')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && paymentRecord) {
          const status: SecurityDepositStatus = {
            isPaid: true,
            paidAt: paymentRecord.created_at,
            paymentMethod: paymentRecord.payment_method || 'Online Payment',
            transactionReference: paymentRecord.reference || paymentRecord.id,
            amount: Number(paymentRecord.amount),
            currency: paymentRecord.currency,
            receiptNumber: `SEC-DEP-${paymentRecord.id.slice(0, 8).toUpperCase()}`,
            status: 'paid',
          };
          return status;
        }

        // Check receipts table if payments didn't have it
        const { data: receiptRecord } = await supabase
          .from('receipts')
          .select('id, amount, currency, created_at, receipt_number')
          .eq('user_id', user.id)
          .ilike('notes', '%security deposit%')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (receiptRecord) {
          const status: SecurityDepositStatus = {
            isPaid: true,
            paidAt: receiptRecord.created_at,
            paymentMethod: 'Receipt Recorded',
            transactionReference: receiptRecord.receipt_number || receiptRecord.id,
            amount: Number(receiptRecord.amount),
            currency: receiptRecord.currency,
            receiptNumber: receiptRecord.receipt_number || receiptRecord.id,
            status: 'paid',
          };
          return status;
        }
      } catch (err) {
        console.warn('Could not verify security deposit status:', err);
      }

      return {
        isPaid: false,
        paidAt: null,
        paymentMethod: null,
        transactionReference: null,
        amount: deposit?.amount || 0,
        currency: deposit?.currency || (region?.toLowerCase().startsWith('nig') ? 'NGN' : 'USD'),
        receiptNumber: null,
        status: 'unpaid',
      };
    },
  });

  // The browser can never record or mark a security deposit as paid. A deposit
  // becomes paid only when a verified provider webhook settles it server-side,
  // so this fails closed instead of simulating a successful payment.
  const recordPaymentMutation = useMutation({
    mutationFn: async (_input: {
      amount: number;
      currency: string;
      paymentMethod?: string;
      reference?: string;
    }): Promise<SecurityDepositStatus> => {
      if (!user?.id) throw new Error('User not logged in');
      throw new Error(
        'Security deposit payments are confirmed by the payment provider. Complete payment through the secure checkout; your status updates once the provider confirms it.',
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-security-deposit-status'] });
    },
  });

  return {
    depositStatus: query.data,
    isPaid: query.data?.isPaid ?? false,
    isLoading: query.isLoading,
    recordPayment: recordPaymentMutation.mutateAsync,
    isRecording: recordPaymentMutation.isPending,
  };
}
