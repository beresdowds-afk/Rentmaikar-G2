import { getRegionById, type Region } from './regions';
import {
  type PaymentBreakdown,
  type PaymentTransaction,
  calculatePaymentBreakdown,
  formatCurrency
} from './payment-config';
import { supabase } from '@/integrations/supabase/client';
import { idempotencyHeaders } from './idempotency';

// PayPal types
export interface PayPalConfig {
  clientId: string;
  mode: 'sandbox' | 'live';
}

export interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links: { href: string; rel: string; method: string }[];
}

// Paystack types
export interface PaystackConfig {
  publicKey: string;
  mode: 'test' | 'live';
}

export interface PaystackTransaction {
  reference: string;
  access_code: string;
  authorization_url: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  gatewayResponse?: unknown;
  error?: string;
  redirectUrl?: string;
}

/**
 * Payment Gateway Manager
 * Handles PayPal (USA) and Paystack (Nigeria) integrations
 */
export class PaymentGateway {
  private region: Region;

  constructor(regionId: string) {
    const region = getRegionById(regionId);
    if (!region) {
      throw new Error(`Invalid region: ${regionId}`);
    }
    this.region = region;
  }

  get gateway(): 'paypal' | 'paystack' {
    return this.region.paymentGateway;
  }

  get currency(): 'USD' | 'NGN' | (string & {}) {
    return this.region.currency;
  }

  /**
   * Initialize a payment for driver rental
   */
  async initializePayment(
    baseAmount: number,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    const breakdown = calculatePaymentBreakdown(baseAmount, this.currency);
    
    if (this.gateway === 'paypal') {
      return this.initializePayPalPayment(breakdown, driverId, vehicleId, rentalId, metadata);
    } else {
      return this.initializePaystackPayment(breakdown, driverId, vehicleId, rentalId, metadata);
    }
  }

  /**
   * Initialize PayPal payment (USA)
   */
  private async initializePayPalPayment(
    breakdown: PaymentBreakdown,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    try {
      const { createPayPalOrder } = await import('./paypal-client');
      const result = await createPayPalOrder({
        amount: breakdown.driverTotal,
        currency: 'USD',
        driverId,
        vehicleId,
        rentalId,
        paymentFrequency: breakdown.frequency,
        description: `Vehicle Rental - ${formatCurrency(breakdown.baseAmount, 'USD')} + ${formatCurrency(breakdown.adminFee, 'USD')} admin fee`,
        metadata,
      });

      return {
        success: true,
        transactionId: result.orderId,
        redirectUrl: result.approveUrl ?? null,
        gatewayResponse: result,
      };
    } catch (error) {
      console.error('[PayPal] Payment initialization failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PayPal payment initialization failed',
      };
    }
  }

  /**
   * Initialize Paystack payment (Nigeria) via edge function.
   */
  private async initializePaystackPayment(
    breakdown: PaymentBreakdown,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    try {
      const { data, error } = await supabase.functions.invoke('create-paystack-transaction', {
        body: {
          amount: breakdown.driverTotal,
          currency: 'NGN',
          rentalId: rentalId && /^[0-9a-f-]{36}$/i.test(rentalId) ? rentalId : undefined,
          vehicleId: vehicleId && /^[0-9a-f-]{36}$/i.test(vehicleId) ? vehicleId : undefined,
          paymentFrequency: breakdown.frequency,
          description: `Rentmaikar payment — ${formatCurrency(breakdown.baseAmount, 'NGN')}`,
          metadata,
        },
        headers: idempotencyHeaders('charge.paystack', {
          amount: breakdown.driverTotal, driverId, vehicleId, rentalId,
        }),
      });
      if (error) throw error;
      return {
        success: true,
        transactionId: data?.reference,
        redirectUrl: data?.authorization_url ?? null,
        gatewayResponse: data,
      };
    } catch (error) {
      console.error('[Paystack] Payment initialization failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Paystack payment initialization failed',
      };
    }
  }

  /**
   * Verify payment completion
   */
  async verifyPayment(transactionId: string): Promise<PaymentResult> {
    if (this.gateway === 'paypal') {
      return this.verifyPayPalPayment(transactionId);
    } else {
      return this.verifyPaystackPayment(transactionId);
    }
  }

  /**
   * Verify / capture PayPal payment
   */
  private async verifyPayPalPayment(orderId: string): Promise<PaymentResult> {
    try {
      const { capturePayPalOrder } = await import('./paypal-client');
      const result = await capturePayPalOrder({ orderId });

      return {
        success: result.status === 'COMPLETED',
        transactionId: result.orderId,
        gatewayResponse: result,
      };
    } catch (error) {
      console.error('[PayPal] Payment verification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PayPal payment verification failed',
      };
    }
  }

  /**
   * Verify Paystack payment via edge function.
   */
  private async verifyPaystackPayment(reference: string): Promise<PaymentResult> {
    try {
      const { data, error } = await supabase.functions.invoke('verify-paystack-transaction', {
        body: { reference },
      });
      if (error) throw error;
      return {
        success: data?.status === 'completed',
        transactionId: reference,
        gatewayResponse: data,
      };
    } catch (error) {
      console.error('[Paystack] Payment verification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Paystack payment verification failed',
      };
    }
  }

  /**
   * Process owner payout (weekly on Fridays). Requires an existing
   * owner_payout_accounts row; `payoutAccountId` is the row ID.
   */
  async processOwnerPayout(
    ownerId: string,
    amount: number,
    payoutDetails: { accountNumber?: string; email?: string; payoutAccountId?: string; note?: string; authorizationId?: string }
  ): Promise<PaymentResult> {
    if (this.gateway === 'paypal') {
      return this.processPayPalPayout(ownerId, amount, payoutDetails);
    } else {
      return this.processPaystackTransfer(ownerId, amount, payoutDetails);
    }
  }

  /**
   * Process PayPal payout to owner via edge function.
   */
  private async processPayPalPayout(
    _ownerId: string,
    amount: number,
    payoutDetails: { payoutAccountId?: string; note?: string; authorizationId?: string }
  ): Promise<PaymentResult> {
    try {
      if (!payoutDetails.payoutAccountId) {
        return { success: false, error: 'Missing payoutAccountId' };
      }
      if (!payoutDetails.authorizationId) {
        return { success: false, error: 'Withdrawal authorization required before payout' };
      }
      const { data, error } = await supabase.functions.invoke('initiate-paypal-payout', {
        body: {
          amount,
          payoutAccountId: payoutDetails.payoutAccountId,
          note: payoutDetails.note,
          authorizationId: payoutDetails.authorizationId,
        },
        headers: idempotencyHeaders('payout.paypal', { amount, payoutAccountId: payoutDetails.payoutAccountId }),
      });
      if (error) throw error;
      return { success: true, transactionId: data?.reference ?? data?.payout_batch_id, gatewayResponse: data };
    } catch (error) {
      console.error('[PayPal] Payout failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'PayPal payout failed' };
    }
  }

  /**
   * Process Paystack transfer to owner via edge function.
   */
  private async processPaystackTransfer(
    _ownerId: string,
    amount: number,
    payoutDetails: { payoutAccountId?: string; note?: string; authorizationId?: string }
  ): Promise<PaymentResult> {
    try {
      if (!payoutDetails.payoutAccountId) {
        return { success: false, error: 'Missing payoutAccountId' };
      }
      if (!payoutDetails.authorizationId) {
        return { success: false, error: 'Withdrawal authorization required before payout' };
      }
      const { data, error } = await supabase.functions.invoke('initiate-paystack-transfer', {
        body: {
          amount,
          payoutAccountId: payoutDetails.payoutAccountId,
          note: payoutDetails.note,
          authorizationId: payoutDetails.authorizationId,
        },
        headers: idempotencyHeaders('payout.paystack', { amount, payoutAccountId: payoutDetails.payoutAccountId }),
      });
      if (error) throw error;
      return { success: true, transactionId: data?.reference ?? data?.transfer_code, gatewayResponse: data };
    } catch (error) {
      console.error('[Paystack] Transfer failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Paystack transfer failed' };
    }
  }

  /**
   * Process refund
   */
  async processRefund(
    originalTransactionId: string,
    amount: number,
    reason: string
  ): Promise<PaymentResult> {
    try {
      console.log(`[${this.gateway}] Processing refund:`, {
        originalTransactionId,
        amount,
        reason,
      });

      const mockRefundId = `REFUND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return {
        success: true,
        transactionId: mockRefundId,
        gatewayResponse: {
          status: 'completed',
          refund_id: mockRefundId,
          amount,
        },
      };
    } catch (error) {
      console.error(`[${this.gateway}] Refund failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }
}

/**
 * Factory function to create payment gateway for a region
 */
export function createPaymentGateway(regionId: string): PaymentGateway {
  return new PaymentGateway(regionId);
}
