import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { type Region } from '@/lib/regions';
import { 
  createPaymentGateway, 
  type PaymentResult,
  type PaymentGateway 
} from '@/lib/payment-gateway';
import { 
  calculatePaymentBreakdown, 
  formatCurrency,
  type PaymentBreakdown 
} from '@/lib/payment-config';

interface UsePaymentOptions {
  onPaymentSuccess?: (result: PaymentResult) => void;
  onPaymentError?: (error: string) => void;
}

export function usePayment(options: UsePaymentOptions = {}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [paymentGateway, setPaymentGateway] = useState<PaymentGateway | null>(null);
  const [lastResult, setLastResult] = useState<PaymentResult | null>(null);
  const [breakdown, setBreakdown] = useState<PaymentBreakdown | null>(null);

  const selectRegion = useCallback((region: Region) => {
    setSelectedRegion(region);
    setPaymentGateway(createPaymentGateway(region.id));
  }, []);

  const calculateBreakdown = useCallback((baseAmount: number) => {
    if (!selectedRegion) {
      toast.error('Please select a region first');
      return null;
    }
    const result = calculatePaymentBreakdown(baseAmount, selectedRegion.currency);
    setBreakdown(result);
    return result;
  }, [selectedRegion]);

  const initiatePayment = useCallback(async (
    baseAmount: number,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult | null> => {
    if (!paymentGateway || !selectedRegion) {
      toast.error('Please select a region first');
      return null;
    }

    setIsProcessing(true);
    
    try {
      const result = await paymentGateway.initializePayment(
        baseAmount,
        driverId,
        vehicleId,
        rentalId,
        metadata
      );

      setLastResult(result);

      if (result.success) {
        toast.success(
          `Payment initialized via ${selectedRegion.paymentGateway === 'paypal' ? 'PayPal' : 'Paystack'}`,
          {
            description: `Transaction ID: ${result.transactionId}`,
          }
        );
        
        // In production, redirect to payment gateway
        if (result.redirectUrl) {
          console.log('[Payment] Redirect URL:', result.redirectUrl);
          // window.location.href = result.redirectUrl;
        }

        options.onPaymentSuccess?.(result);
      } else {
        toast.error('Payment initialization failed', {
          description: result.error,
        });
        options.onPaymentError?.(result.error || 'Unknown error');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      toast.error('Payment error', { description: errorMessage });
      options.onPaymentError?.(errorMessage);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [paymentGateway, selectedRegion, options]);

  const verifyPayment = useCallback(async (
    transactionId: string
  ): Promise<PaymentResult | null> => {
    if (!paymentGateway) {
      toast.error('Payment gateway not initialized');
      return null;
    }

    setIsProcessing(true);

    try {
      const result = await paymentGateway.verifyPayment(transactionId);
      setLastResult(result);

      if (result.success) {
        toast.success('Payment verified successfully');
        options.onPaymentSuccess?.(result);
      } else {
        toast.error('Payment verification failed', {
          description: result.error,
        });
        options.onPaymentError?.(result.error || 'Verification failed');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      toast.error('Verification error', { description: errorMessage });
      options.onPaymentError?.(errorMessage);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [paymentGateway, options]);

  const processOwnerPayout = useCallback(async (
    ownerId: string,
    amount: number,
    payoutDetails: { accountNumber?: string; email?: string }
  ): Promise<PaymentResult | null> => {
    if (!paymentGateway) {
      toast.error('Payment gateway not initialized');
      return null;
    }

    setIsProcessing(true);

    try {
      const result = await paymentGateway.processOwnerPayout(
        ownerId,
        amount,
        payoutDetails
      );

      if (result.success) {
        toast.success('Payout processed successfully', {
          description: `${formatCurrency(amount, selectedRegion?.currency || 'USD')} sent to owner`,
        });
      } else {
        toast.error('Payout failed', { description: result.error });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payout failed';
      toast.error('Payout error', { description: errorMessage });
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [paymentGateway, selectedRegion]);

  return {
    isProcessing,
    selectedRegion,
    breakdown,
    lastResult,
    gateway: paymentGateway?.gateway || null,
    selectRegion,
    calculateBreakdown,
    initiatePayment,
    verifyPayment,
    processOwnerPayout,
  };
}
