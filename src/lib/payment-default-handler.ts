import { 
  PAYMENT_CONFIG, 
  type PaymentDefault,
  type PaymentFrequency,
  isDeactivationAllowed,
  getNextNotificationHour,
  getDefaultConfig,
  formatCurrency
} from './payment-config';

export interface DefaultNotification {
  hour: number;
  type: 'sms' | 'whatsapp' | 'email' | 'push';
  message: string;
  sent: boolean;
  sentAt?: Date;
}

export interface DeactivationRequest {
  paymentDefaultId: string;
  vehicleId: string;
  driverId: string;
  reason: string;
  requestedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
  executed: boolean;
  executedAt?: Date;
}

/**
 * Payment Default Handler
 * Manages payment defaults with frequency-based lockdown:
 * - Weekly: 72 hours with 3 notifications at 24-hour intervals
 * - Daily: 36 hours with 3 notifications at 12-hour intervals
 */
export class PaymentDefaultHandler {
  /**
   * Create a new payment default record
   */
  static createDefault(
    driverId: string,
    vehicleId: string,
    rentalId: string,
    amountDue: number,
    currency: 'USD' | 'NGN' | (string & {}),
    paymentFrequency: PaymentFrequency = 'weekly'
  ): PaymentDefault {
    return {
      id: `DEFAULT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      driverId,
      vehicleId,
      rentalId,
      amountDue,
      currency,
      paymentFrequency,
      hoursOverdue: 0,
      notificationsSent: 0,
      deactivationEligible: false,
      status: 'active',
      createdAt: new Date(),
    };
  }

  /**
   * Generate notification message for a specific hour
   */
  static generateNotificationMessage(
    paymentDefault: PaymentDefault,
    notificationNumber: number,
    driverName: string
  ): DefaultNotification {
    const amountFormatted = formatCurrency(paymentDefault.amountDue, paymentDefault.currency);
    const config = getDefaultConfig(paymentDefault.paymentFrequency);
    const hoursRemaining = config.LOCKDOWN_AFTER_HOURS - paymentDefault.hoursOverdue;
    const isDaily = paymentDefault.paymentFrequency === 'daily';
    const intervalLabel = isDaily ? '12 hours' : '24 hours';
    
    const messages: Record<number, string> = {
      1: `🔔 Payment Reminder (Notification 1/3)

Dear ${driverName},

Your payment of ${amountFormatted} is overdue. Please make payment immediately to avoid service interruption.

⚠️ You are on a ${isDaily ? 'DAILY' : 'WEEKLY'} payment plan. Vehicle lockdown in ${hoursRemaining} hours if payment is not received.

Next notification in ${intervalLabel}.

Payment Link: [PAYMENT_LINK]

Thank you.`,

      2: `⚠️ URGENT: Payment Overdue (Notification 2/3)

Dear ${driverName},

This is your second reminder. Your payment of ${amountFormatted} remains outstanding.

🚨 ${hoursRemaining} hours remaining until vehicle lockdown.

${isDaily ? '⚡ Daily payment plans require faster resolution.' : ''}

Please pay now: [PAYMENT_LINK]

Contact support if you need assistance.`,

      3: `🚨 FINAL NOTICE: Payment Default (Notification 3/3)

Dear ${driverName},

FINAL WARNING: Your payment of ${amountFormatted} is critically overdue.

❌ Vehicle lockdown has been authorized. Your vehicle will be remotely disabled when safely parked.

${isDaily ? '⚡ Daily payment plans are now FORBIDDEN for your account due to this default.' : ''}

To avoid lockdown, pay immediately: [PAYMENT_LINK]

This is your last warning.`,
    };

    return {
      hour: paymentDefault.hoursOverdue,
      type: notificationNumber === 3 ? 'whatsapp' : 'sms',
      message: messages[notificationNumber] || messages[1],
      sent: false,
    };
  }

  /**
   * Process hourly payment default check
   * Called every hour for each active default
   */
  static processHourlyCheck(paymentDefault: PaymentDefault): {
    updated: PaymentDefault;
    notification?: DefaultNotification;
    deactivationEligible: boolean;
  } {
    const updated = { ...paymentDefault };
    updated.hoursOverdue += 1;

    const nextNotificationHour = getNextNotificationHour(
      updated.notificationsSent,
      updated.paymentFrequency
    );
    let notification: DefaultNotification | undefined;

    if (nextNotificationHour !== null && updated.hoursOverdue >= nextNotificationHour) {
      notification = this.generateNotificationMessage(
        updated,
        updated.notificationsSent + 1,
        'Driver' // Would be actual driver name from DB
      );
      updated.notificationsSent += 1;
      updated.lastNotificationAt = new Date();
    }

    updated.deactivationEligible = isDeactivationAllowed(updated);

    return {
      updated,
      notification,
      deactivationEligible: updated.deactivationEligible,
    };
  }

  /**
   * Create deactivation request after 3rd notification
   */
  static createDeactivationRequest(
    paymentDefault: PaymentDefault,
    reason: string
  ): DeactivationRequest | null {
    if (!isDeactivationAllowed(paymentDefault)) {
      console.warn('[PaymentDefault] Deactivation not allowed yet:', {
        hoursOverdue: paymentDefault.hoursOverdue,
        notificationsSent: paymentDefault.notificationsSent,
        paymentFrequency: paymentDefault.paymentFrequency,
      });
      return null;
    }

    return {
      paymentDefaultId: paymentDefault.id,
      vehicleId: paymentDefault.vehicleId,
      driverId: paymentDefault.driverId,
      reason,
      requestedAt: new Date(),
      executed: false,
    };
  }

  /**
   * Validate that auto-debit should run (12:01 AM check)
   */
  static shouldRunAutoDebit(): boolean {
    const now = new Date();
    const [hours, minutes] = PAYMENT_CONFIG.DAILY_DEBIT_TIME.split(':').map(Number);
    
    // Allow 5-minute window for cron job timing
    const targetMinutes = hours * 60 + minutes;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    return Math.abs(currentMinutes - targetMinutes) <= 5;
  }

  /**
   * Get payment default status summary
   */
  static getStatusSummary(paymentDefault: PaymentDefault): {
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    action: string;
  } {
    const { hoursOverdue, notificationsSent, deactivationEligible, paymentFrequency } = paymentDefault;
    const amountFormatted = formatCurrency(paymentDefault.amountDue, paymentDefault.currency);
    const config = getDefaultConfig(paymentFrequency);
    const hoursUntilLockdown = Math.max(0, config.LOCKDOWN_AFTER_HOURS - hoursOverdue);

    if (deactivationEligible) {
      return {
        severity: 'critical',
        message: `${hoursOverdue}h overdue - ${amountFormatted}. Lockdown authorized.`,
        action: 'Initiate vehicle lockdown when safely parked',
      };
    }

    if (notificationsSent >= 2) {
      return {
        severity: 'high',
        message: `${hoursOverdue}h overdue - ${amountFormatted}. ${hoursUntilLockdown}h until lockdown.`,
        action: 'Send final notification and prepare lockdown',
      };
    }

    if (notificationsSent >= 1) {
      return {
        severity: 'medium',
        message: `${hoursOverdue}h overdue - ${amountFormatted}. ${3 - notificationsSent} notification(s) remaining.`,
        action: 'Send urgent notification',
      };
    }

    return {
      severity: 'low',
      message: `Payment pending - ${amountFormatted}`,
      action: 'Monitor and await payment',
    };
  }

  /**
   * Check if driver is eligible for daily payment plan
   */
  static async checkDailyPlanEligibility(driverId: string, supabase: any): Promise<{
    eligible: boolean;
    reason?: string;
  }> {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('daily_plan_forbidden, daily_plan_forbidden_reason')
        .eq('user_id', driverId)
        .single();

      if (error) {
        console.error('[PaymentDefault] Error checking daily plan eligibility:', error);
        return { eligible: true }; // Default to eligible if check fails
      }

      if (profile?.daily_plan_forbidden) {
        return {
          eligible: false,
          reason: profile.daily_plan_forbidden_reason || 'Previous payment default',
        };
      }

      return { eligible: true };
    } catch (error) {
      console.error('[PaymentDefault] Error checking daily plan eligibility:', error);
      return { eligible: true };
    }
  }
}
