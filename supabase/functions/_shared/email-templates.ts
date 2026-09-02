/**
 * Rentmaikar Email Templates Library
 * Production-ready HTML email templates for all transactional emails
 * Includes multi-language support, region-specific templates, and full coverage
 */

import { EMAIL_CONFIG, formatSenderEmail } from "./email-config.ts";

// ─── Base Wrapper ───
const emailWrapper = (content: string, title: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Rentmaikar</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #2563eb;
    }
    h1 { color: #1e293b; font-size: 24px; margin-bottom: 20px; }
    h2 { color: #1e293b; font-size: 18px; margin-bottom: 16px; }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      color: white !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 8px;
      text-align: center;
      font-weight: 600;
      font-size: 16px;
      margin: 24px 0;
    }
    .secondary-button {
      display: inline-block;
      background: #10b981;
      color: white !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      text-align: center;
      font-weight: 600;
      font-size: 14px;
    }
    .danger-button {
      display: inline-block;
      background: #ef4444;
      color: white !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      text-align: center;
      font-weight: 600;
      font-size: 14px;
    }
    .info-box { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .error-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb; text-align: center; padding: 20px; background: #eff6ff; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
    .detail-label { color: #64748b; font-weight: 500; }
    .detail-value { color: #1e293b; font-weight: 600; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px; }
    .amount { font-size: 28px; font-weight: bold; color: #10b981; }
    .stats-grid { display: flex; gap: 16px; margin: 20px 0; }
    .stat-card { flex: 1; text-align: center; background: #f8fafc; border-radius: 8px; padding: 16px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #2563eb; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .steps-grid { display: flex; gap: 16px; margin: 20px 0; text-align: center; }
    .step-card { flex: 1; background: #f8fafc; border-radius: 8px; padding: 16px; }
    .step-icon { font-size: 32px; margin-bottom: 8px; }
    .step-title { font-weight: 600; color: #1e293b; }
    .step-desc { font-size: 13px; color: #64748b; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    table th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-size: 13px; color: #64748b; }
    table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://rentmaikar.com/pwa-icon-192.png" width="64" height="64" alt="Rentmaikar" style="display:block;margin:0 auto 12px;border-radius:14px;" />
      <div class="logo">Rentmaikar</div>
    </div>
    ${content}
    <div class="footer">
      <p>© ${new Date().getFullYear()} Rentmaikar. All rights reserved.</p>
      <p>Email: ${EMAIL_CONFIG.support}</p>
    </div>
  </div>
</body>
</html>
`;

// ─── Helpers ───
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatCurrency = (amount: number, currency: 'USD' | 'NGN'): string => {
  const symbol = currency === 'NGN' ? '₦' : '$';
  return `${symbol}${amount.toLocaleString()}`;
};

// ─── Multi-Language Content ───
interface LocalizedStrings {
  en: string;
  es?: string;
  pcm?: string;
  yo?: string;
  ha?: string;
  ig?: string;
}

function getLocalized(strings: LocalizedStrings, lang: string): string {
  return (strings as Record<string, string>)[lang] || strings.en;
}

const WELCOME_SUBJECTS: Record<string, LocalizedStrings> = {
  driver: {
    en: "Welcome to Rentmaikar - Start Your Journey!",
    es: "¡Bienvenido a Rentmaikar - Comienza tu viaje!",
    pcm: "Welcome to Rentmaikar - Your Journey Don Start!",
    yo: "Kaabo si Rentmaikar - Bẹrẹ Irin-ajo Rẹ!",
  },
  owner: {
    en: "Start Earning with Rentmaikar - List Your Vehicle",
    es: "Comienza a ganar con Rentmaikar - Publica tu vehículo",
    pcm: "Start Earning with Rentmaikar - List Your Vehicle",
    yo: "Bẹrẹ Gbigba Owo pẹlu Rentmaikar - Ṣe Akojọ Ọkọ Rẹ",
  },
};

// ==================== EMAIL TEMPLATES ====================

/**
 * Welcome Email - Driver (multi-language, with steps and requirements)
 */
export const welcomeDriverEmail = (data: {
  firstName: string;
  dashboardUrl: string;
  country?: string;
  language?: string;
  requirements?: string[];
}) => {
  const lang = data.language || "en";
  const isNigeria = data.country === "NG" || data.country === "Nigeria";
  const subject = getLocalized(WELCOME_SUBJECTS.driver, lang);

  const requirementsHtml = data.requirements?.length
    ? `<div class="info-box">
        <h2>Required Documents</h2>
        <ul>${data.requirements.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      </div>`
    : isNigeria
      ? `<div class="info-box">
          <h2>Required Documents</h2>
          <ul>
            <li>Valid Driver's License</li>
            <li>NIN (National Identification Number)</li>
            <li>BVN (Bank Verification Number)</li>
            <li>Police Report / Clearance Certificate</li>
            <li>Passport photograph</li>
          </ul>
        </div>`
      : `<div class="info-box">
          <h2>Required Documents</h2>
          <ul>
            <li>Valid Driver's License</li>
            <li>Rideshare platform profile</li>
            <li>Proof of insurance</li>
          </ul>
        </div>`;

  const content = `
    <h1>Welcome to Rentmaikar, ${escapeHtml(data.firstName)}! 👋</h1>
    <p>You're now part of a smarter way to rent vehicles for rideshare driving.</p>

    <div class="steps-grid">
      <div class="step-card">
        <div class="step-icon">🚗</div>
        <div class="step-title">Browse Vehicles</div>
        <div class="step-desc">Find a vehicle that fits your needs and budget</div>
      </div>
      <div class="step-card">
        <div class="step-icon">📄</div>
        <div class="step-title">Upload Documents</div>
        <div class="step-desc">Verify your identity and driving credentials</div>
      </div>
      <div class="step-card">
        <div class="step-icon">💰</div>
        <div class="step-title">Start Earning</div>
        <div class="step-desc">Pick up your vehicle and hit the road</div>
      </div>
    </div>

    ${requirementsHtml}

    <a href="${data.dashboardUrl}" class="cta-button">Go to Dashboard →</a>

    <p style="color: #64748b; font-size: 14px;">
      Need help? Contact us at <a href="mailto:${EMAIL_CONFIG.support}">${EMAIL_CONFIG.support}</a>
    </p>
  `;

  return {
    subject,
    html: emailWrapper(content, "Welcome"),
    text: `Welcome to Rentmaikar, ${data.firstName}!\n\nNext Steps:\n1. Browse Vehicles\n2. Upload Documents\n3. Start Earning\n\nDashboard: ${data.dashboardUrl}\n\nNeed help? Contact ${EMAIL_CONFIG.support}`,
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Welcome Email - Owner (multi-language, with earning potential)
 */
export const welcomeOwnerEmail = (data: {
  firstName: string;
  dashboardUrl: string;
  country?: string;
  language?: string;
  dailyAvg?: number;
  monthlyAvg?: number;
  occupancyRate?: number;
  currency?: 'USD' | 'NGN';
}) => {
  const lang = data.language || "en";
  const isNigeria = data.country === "NG" || data.country === "Nigeria";
  const curr = data.currency || (isNigeria ? "NGN" : "USD");
  const daily = data.dailyAvg || (isNigeria ? 15000 : 32);
  const monthly = data.monthlyAvg || (isNigeria ? 450000 : 960);
  const occupancy = data.occupancyRate || 95;
  const subject = getLocalized(WELCOME_SUBJECTS.owner, lang);

  const content = `
    <h1>Welcome to Rentmaikar, ${escapeHtml(data.firstName)}! 🎉</h1>
    <p>Start earning passive income from your vehicle today.</p>

    <div class="info-box">
      <h2 style="text-align:center;">Your Earning Potential</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${formatCurrency(daily, curr)}</div>
          <div class="stat-label">Daily Average</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatCurrency(monthly, curr)}</div>
          <div class="stat-label">Monthly Average</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${occupancy}%</div>
          <div class="stat-label">Occupancy Rate</div>
        </div>
      </div>
    </div>

    <a href="${data.dashboardUrl}" class="cta-button">List Your Vehicle →</a>

    <div class="info-box">
      <h2>What You Need:</h2>
      <ul>
        <li>Vehicle registration documents</li>
        <li>Insurance certificate (rideshare coverage)</li>
        <li>Proof of ownership</li>
        <li>Bank account for payouts</li>
        ${isNigeria ? "<li>NIN/BVN verification</li>" : ""}
      </ul>
    </div>
  `;

  return {
    subject,
    html: emailWrapper(content, "Welcome"),
    text: `Welcome to Rentmaikar, ${data.firstName}!\n\nEarning Potential: ${formatCurrency(daily, curr)}/day, ${formatCurrency(monthly, curr)}/month\n\nDashboard: ${data.dashboardUrl}`,
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Legacy welcome email (backward compatible)
 */
export const welcomeEmail = (data: {
  firstName: string;
  userType: 'driver' | 'owner';
  dashboardUrl: string;
}) => {
  if (data.userType === "owner") {
    return welcomeOwnerEmail({ firstName: data.firstName, dashboardUrl: data.dashboardUrl });
  }
  return welcomeDriverEmail({ firstName: data.firstName, dashboardUrl: data.dashboardUrl });
};

/**
 * OTP Verification Email
 */
export const otpEmail = (data: {
  firstName: string;
  otp: string;
  expiryMinutes: number;
}) => {
  const content = `
    <h1>Your Verification Code</h1>
    <p>Hi ${escapeHtml(data.firstName)}, use this code to continue:</p>
    <div class="otp-code">${escapeHtml(data.otp)}</div>
    <div class="warning-box">⏰ This code expires in ${data.expiryMinutes} minutes.</div>
    <p style="color: #64748b; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
  `;
  return {
    subject: "Your Rentmaikar verification code",
    html: emailWrapper(content, "Verification Code"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Booking Confirmation Email - Driver
 */
export const bookingConfirmationEmail = (data: {
  firstName: string;
  vehicleName: string;
  pickupDate: string;
  returnDate: string;
  pickupLocation: string;
  amount: number;
  currency: 'USD' | 'NGN';
  bookingId: string;
}) => {
  const content = `
    <div class="success-box">✅ Booking Confirmed</div>
    <h1>Your Booking is Confirmed! 🚘</h1>
    <p>Hi ${escapeHtml(data.firstName)}, your vehicle rental has been confirmed.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value">${escapeHtml(data.bookingId)}</span></div>
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row"><span class="detail-label">Pickup</span><span class="detail-value">${escapeHtml(data.pickupDate)}</span></div>
      <div class="detail-row"><span class="detail-label">Return</span><span class="detail-value">${escapeHtml(data.returnDate)}</span></div>
      <div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${escapeHtml(data.pickupLocation)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Amount</span><span class="detail-value amount">${formatCurrency(data.amount, data.currency)}</span></div>
    </div>
    <p>Please arrive with your valid ID at the pickup location.</p>
  `;
  return {
    subject: `Booking Confirmed – ${data.vehicleName}`,
    html: emailWrapper(content, "Booking Confirmation"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Owner Vehicle Booked Notification
 */
export const ownerBookingNotificationEmail = (data: {
  firstName: string;
  vehicleName: string;
  pickupDate: string;
  returnDate: string;
  estimatedEarnings: number;
  currency: 'USD' | 'NGN';
}) => {
  const content = `
    <div class="success-box">🎉 Great News!</div>
    <h1>Your Vehicle Has Been Booked!</h1>
    <p>Hi ${escapeHtml(data.firstName)}, your vehicle has just been rented.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row"><span class="detail-label">Rental Period</span><span class="detail-value">${escapeHtml(data.pickupDate)} → ${escapeHtml(data.returnDate)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Estimated Earnings</span><span class="detail-value amount">${formatCurrency(data.estimatedEarnings, data.currency)}</span></div>
    </div>
    <p>You'll be notified once the pickup happens.</p>
  `;
  return {
    subject: `🎉 Your vehicle ${data.vehicleName} has been booked!`,
    html: emailWrapper(content, "Vehicle Booked"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Payment Receipt Email
 */
export const paymentReceiptEmail = (data: {
  firstName: string;
  amount: number;
  currency: 'USD' | 'NGN';
  paymentDate: string;
  paymentMethod: string;
  transactionId: string;
  vehicleName: string;
  periodStart: string;
  periodEnd: string;
}) => {
  const content = `
    <div class="success-box">✅ Payment Received</div>
    <h1>Payment Receipt</h1>
    <p>Hi ${escapeHtml(data.firstName)}, we've received your payment.</p>
    <div class="info-box">
      <div style="text-align:center;margin-bottom:20px;"><span class="amount">${formatCurrency(data.amount, data.currency)}</span></div>
      <div class="detail-row"><span class="detail-label">Transaction ID</span><span class="detail-value">${escapeHtml(data.transactionId)}</span></div>
      <div class="detail-row"><span class="detail-label">Payment Date</span><span class="detail-value">${escapeHtml(data.paymentDate)}</span></div>
      <div class="detail-row"><span class="detail-label">Payment Method</span><span class="detail-value">${escapeHtml(data.paymentMethod)}</span></div>
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Rental Period</span><span class="detail-value">${escapeHtml(data.periodStart)} - ${escapeHtml(data.periodEnd)}</span></div>
    </div>
    <p style="color:#64748b;font-size:14px;">Keep this email as your official receipt for accounting purposes.</p>
  `;
  return {
    subject: `Payment Receipt – ${formatCurrency(data.amount, data.currency)}`,
    html: emailWrapper(content, "Payment Receipt"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Payment Failed Email
 */
export const paymentFailedEmail = (data: {
  firstName: string;
  amount: number;
  currency: 'USD' | 'NGN';
  vehicleName: string;
  failureReason: string;
  paymentUrl: string;
}) => {
  const content = `
    <div class="error-box">❌ Payment Failed</div>
    <h1>Action Required: Payment Failed</h1>
    <p>Hi ${escapeHtml(data.firstName)}, we were unable to process your payment of <strong>${formatCurrency(data.amount, data.currency)}</strong> for ${escapeHtml(data.vehicleName)}.</p>
    <div class="info-box">
      <p><strong>Reason:</strong> ${escapeHtml(data.failureReason)}</p>
      <p>Please update your payment method immediately to avoid service interruption.</p>
    </div>
    <a href="${data.paymentUrl}" class="cta-button">Update Payment Method →</a>
    <p style="color:#64748b;font-size:14px;">If you continue to experience issues, please contact our support team.</p>
  `;
  return {
    subject: `Action Required: Your Rentmaikar Payment Failed`,
    html: emailWrapper(content, "Payment Failed"),
    from: formatSenderEmail("payments"),
  };
};

/**
 * Owner Weekly Payout Email
 */
export const ownerPayoutEmail = (data: {
  firstName: string;
  payoutAmount: number;
  totalEarnings: number;
  platformFee: number;
  currency: 'USD' | 'NGN';
  paymentMethod: string;
  expectedArrival: string;
  dashboardUrl: string;
}) => {
  const content = `
    <div class="success-box">💰 Payout Processed</div>
    <h1>Weekly Payout Confirmation</h1>
    <p>Hi ${escapeHtml(data.firstName)}, great news! Your weekly earnings have been processed.</p>
    <div class="info-box">
      <div style="text-align:center;margin-bottom:20px;">
        <p style="color:#64748b;font-size:14px;margin:0;">Total Payout</p>
        <span class="amount">${formatCurrency(data.payoutAmount, data.currency)}</span>
      </div>
      <h2>Breakdown:</h2>
      <div class="detail-row"><span class="detail-label">Total Rental Earnings</span><span class="detail-value">${formatCurrency(data.totalEarnings, data.currency)}</span></div>
      <div class="detail-row"><span class="detail-label">Platform Fee (20%)</span><span class="detail-value" style="color:#ef4444;">-${formatCurrency(data.platformFee, data.currency)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Net Payout</span><span class="detail-value amount" style="font-size:18px;">${formatCurrency(data.payoutAmount, data.currency)}</span></div>
    </div>
    <div class="info-box">
      <p><strong>Payment Method:</strong> ${escapeHtml(data.paymentMethod)}</p>
      <p><strong>Expected Arrival:</strong> ${escapeHtml(data.expectedArrival)}</p>
    </div>
    <a href="${data.dashboardUrl}" style="color:#2563eb;">View detailed earnings report →</a>
  `;
  return {
    subject: "Your Weekly Payout from Rentmaikar",
    html: emailWrapper(content, "Weekly Payout"),
    from: formatSenderEmail("payments"),
  };
};

/**
 * Payment Reminder Email (Pre-due)
 */
export const paymentReminderEmail = (data: {
  firstName: string;
  amount: number;
  currency: 'USD' | 'NGN';
  dueDate: string;
  hoursRemaining: number;
  vehicleName: string;
  paymentUrl: string;
}) => {
  const urgency = data.hoursRemaining <= 24 ? 'error-box' : data.hoursRemaining <= 48 ? 'warning-box' : 'info-box';
  const urgencyText = data.hoursRemaining <= 24 ? '⚠️ Payment Due Tomorrow' : data.hoursRemaining <= 48 ? '⏰ Payment Due Soon' : '📅 Upcoming Payment';
  const content = `
    <div class="${urgency}">${urgencyText}</div>
    <h1>Payment Reminder</h1>
    <p>Hi ${escapeHtml(data.firstName)}, this is a reminder about your upcoming rental payment.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Amount Due</span><span class="detail-value amount">${formatCurrency(data.amount, data.currency)}</span></div>
      <div class="detail-row"><span class="detail-label">Due Date</span><span class="detail-value">${escapeHtml(data.dueDate)}</span></div>
      <div class="detail-row"><span class="detail-label">Time Remaining</span><span class="detail-value">${data.hoursRemaining} hours</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
    </div>
    <a href="${data.paymentUrl}" class="cta-button">Pay Now →</a>
    <p style="color:#64748b;font-size:14px;">Early payment helps you avoid any service interruption.</p>
  `;
  return {
    subject: data.hoursRemaining <= 24 ? `⚠️ Payment Due Tomorrow – ${formatCurrency(data.amount, data.currency)}` : `📅 Payment Reminder – Due ${data.dueDate}`,
    html: emailWrapper(content, "Payment Reminder"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Payment Overdue Warning Email
 */
export const paymentOverdueEmail = (data: {
  firstName: string;
  amount: number;
  currency: 'USD' | 'NGN';
  hoursOverdue: number;
  vehicleName: string;
  paymentUrl: string;
  isWeeklyPlan: boolean;
  lockdownHours: number;
}) => {
  const isUrgent = data.hoursOverdue >= data.lockdownHours - 8;
  const content = `
    <div class="error-box">🚨 Payment Overdue</div>
    <h1>Urgent: Payment Required</h1>
    <p>Hi ${escapeHtml(data.firstName)}, your rental payment is ${data.hoursOverdue} hours overdue.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Amount Due</span><span class="detail-value amount">${formatCurrency(data.amount, data.currency)}</span></div>
      <div class="detail-row"><span class="detail-label">Overdue By</span><span class="detail-value" style="color:#ef4444;">${data.hoursOverdue} hours</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
    </div>
    ${isUrgent ? `
    <div class="error-box">
      <strong>⛔ Final Warning:</strong> If payment is not received within the next ${data.lockdownHours - data.hoursOverdue} hours, your vehicle access may be restricted.
      ${data.isWeeklyPlan ? ' Your plan will also be downgraded to daily payment.' : ''}
    </div>` : `
    <div class="warning-box">
      Please make payment immediately to avoid service interruption.
      ${data.isWeeklyPlan ? ' Continued non-payment may result in plan downgrade to daily payment.' : ''}
    </div>`}
    <a href="${data.paymentUrl}" class="cta-button">Pay Now →</a>
  `;
  return {
    subject: `🚨 URGENT: Payment Overdue – ${formatCurrency(data.amount, data.currency)}`,
    html: emailWrapper(content, "Payment Overdue"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Vehicle Lockdown Notification Email
 */
export const vehicleLockdownEmail = (data: {
  firstName: string;
  vehicleName: string;
  amountDue: number;
  currency: 'USD' | 'NGN';
  lockdownTime: string;
  reason: string;
  paymentUrl: string;
}) => {
  const content = `
    <div class="error-box">🔒 Vehicle Restricted</div>
    <h1>Vehicle Access Restricted</h1>
    <p>Hi ${escapeHtml(data.firstName)}, your rented vehicle has been temporarily restricted due to non-payment.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row"><span class="detail-label">Amount Due</span><span class="detail-value amount">${formatCurrency(data.amountDue, data.currency)}</span></div>
      <div class="detail-row"><span class="detail-label">Restriction Time</span><span class="detail-value">${escapeHtml(data.lockdownTime)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Reason</span><span class="detail-value">${escapeHtml(data.reason)}</span></div>
    </div>
    <h2>To Restore Access:</h2>
    <ol>
      <li>Complete the outstanding payment</li>
      <li>Vehicle access will be restored within 30 seconds of payment confirmation</li>
    </ol>
    <a href="${data.paymentUrl}" class="cta-button">Pay Now to Restore Access →</a>
    <p style="color:#64748b;font-size:14px;">If you believe this is an error, please contact our support team immediately.</p>
  `;
  return {
    subject: "🔒 Vehicle Restricted – Action Required",
    html: emailWrapper(content, "Vehicle Restricted"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Vehicle Unlocked Notification Email
 */
export const vehicleUnlockedEmail = (data: {
  firstName: string;
  vehicleName: string;
  unlockTime: string;
}) => {
  const content = `
    <div class="success-box">✅ Vehicle Restored</div>
    <h1>Vehicle Access Restored</h1>
    <p>Hi ${escapeHtml(data.firstName)}, great news! Your vehicle access has been restored.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Restored At</span><span class="detail-value">${escapeHtml(data.unlockTime)}</span></div>
    </div>
    <p>Thank you for resolving this promptly. Please ensure timely payments going forward to avoid any future interruptions.</p>
  `;
  return {
    subject: "✅ Vehicle Access Restored",
    html: emailWrapper(content, "Vehicle Restored"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Plan Downgrade Notification Email
 */
export const planDowngradeEmail = (data: {
  firstName: string;
  vehicleName: string;
  previousPlan: string;
  newPlan: string;
  reason: string;
}) => {
  const content = `
    <div class="warning-box">🔁 Plan Updated</div>
    <h1>Your Rental Plan Has Changed</h1>
    <p>Hi ${escapeHtml(data.firstName)}, your rental plan has been updated.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row"><span class="detail-label">Previous Plan</span><span class="detail-value">${escapeHtml(data.previousPlan)}</span></div>
      <div class="detail-row"><span class="detail-label">New Plan</span><span class="detail-value">${escapeHtml(data.newPlan)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Reason</span><span class="detail-value">${escapeHtml(data.reason)}</span></div>
    </div>
    <div class="warning-box"><strong>Important:</strong> Daily payments now apply. Higher daily charges will be in effect. Please ensure timely payment to avoid vehicle restriction.</div>
    <p>If you have questions about your new plan, please contact our support team.</p>
  `;
  return {
    subject: "🔁 Rental Plan Updated – Action Required",
    html: emailWrapper(content, "Plan Updated"),
    from: formatSenderEmail("noreply"),
  };
};

// ==================== DOCUMENT TEMPLATES ====================

/**
 * Document Verification Success
 */
export const documentVerifiedEmail = (data: {
  firstName: string;
  documentType: string;
  verificationDate: string;
  expiryDate?: string;
  nextSteps?: string[];
}) => {
  const content = `
    <div class="success-box">✅ Document Verified</div>
    <h1>Document Verified Successfully</h1>
    <p>Hello ${escapeHtml(data.firstName)}, your <strong>${escapeHtml(data.documentType)}</strong> has been successfully verified.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Document</span><span class="detail-value">${escapeHtml(data.documentType)}</span></div>
      <div class="detail-row"><span class="detail-label">Verification Date</span><span class="detail-value">${escapeHtml(data.verificationDate)}</span></div>
      ${data.expiryDate ? `<div class="detail-row" style="border-bottom:none;"><span class="detail-label">Expiry Date</span><span class="detail-value">${escapeHtml(data.expiryDate)}</span></div>` : ""}
    </div>
    ${data.nextSteps?.length ? `<div class="info-box"><h2>Next Steps:</h2><ul>${data.nextSteps.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>` : ""}
  `;
  return {
    subject: "Document Verified - Rentmaikar",
    html: emailWrapper(content, "Document Verified"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Document Verification Failed
 */
export const documentVerificationFailedEmail = (data: {
  firstName: string;
  documentType: string;
  failureReason: string;
  uploadUrl: string;
}) => {
  const content = `
    <div class="error-box">❌ Document Verification Failed</div>
    <h1>Action Required: Document Verification Failed</h1>
    <p>Hello ${escapeHtml(data.firstName)}, we were unable to verify your <strong>${escapeHtml(data.documentType)}</strong>.</p>
    <div class="info-box">
      <p><strong>Reason:</strong></p>
      <p>${escapeHtml(data.failureReason)}</p>
    </div>
    <a href="${data.uploadUrl}" class="cta-button">Re-upload Document →</a>
    <p style="color:#64748b;font-size:14px;">Please ensure the document is clear, valid, and matches your account details.</p>
  `;
  return {
    subject: "Action Required: Document Verification Failed",
    html: emailWrapper(content, "Document Failed"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Document Expiry Warning
 */
export const documentExpiryWarningEmail = (data: {
  firstName: string;
  documentType: string;
  expiryDate: string;
  daysRemaining: number;
  uploadUrl: string;
  isNigeria?: boolean;
}) => {
  const content = `
    <div class="warning-box">⚠️ Document Expiring Soon</div>
    <h1>Your ${escapeHtml(data.documentType)} is Expiring Soon</h1>
    <p>Hello ${escapeHtml(data.firstName)}, your <strong>${escapeHtml(data.documentType)}</strong> will expire on <strong>${escapeHtml(data.expiryDate)}</strong>.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Days Remaining</span><span class="detail-value" style="color:${data.daysRemaining <= 7 ? '#ef4444' : '#f59e0b'};">${data.daysRemaining} days</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Action Required</span><span class="detail-value">Upload new document before expiry</span></div>
    </div>
    <a href="${data.uploadUrl}" class="cta-button">Upload New Document →</a>
    ${data.isNigeria ? `<div class="info-box"><p>🇳🇬 <strong>Nigeria Drivers:</strong> Police reports must be obtained from the Nigerian Police Force. Reports typically take 3-5 working days.</p></div>` : ""}
  `;
  return {
    subject: `⚠️ Your ${data.documentType} is Expiring Soon`,
    html: emailWrapper(content, "Document Expiry"),
    from: formatSenderEmail("noreply"),
  };
};

// ==================== VEHICLE TEMPLATES ====================

/**
 * Vehicle Listed Successfully (Owner)
 */
export const vehicleListedEmail = (data: {
  firstName: string;
  vehicleName: string;
  vehicleYear: string;
  dailyRate: string;
  vehicleLocation: string;
  dashboardUrl: string;
}) => {
  const content = `
    <div class="success-box">🚗 Vehicle Listed Successfully</div>
    <h1>Congratulations ${escapeHtml(data.firstName)}! Your vehicle has been listed.</h1>
    <div class="info-box">
      <h2>Vehicle Details:</h2>
      <div class="detail-row"><span class="detail-label">Make/Model</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row"><span class="detail-label">Year</span><span class="detail-value">${escapeHtml(data.vehicleYear)}</span></div>
      <div class="detail-row"><span class="detail-label">Daily Rate</span><span class="detail-value">${escapeHtml(data.dailyRate)}</span></div>
      <div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${escapeHtml(data.vehicleLocation)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Status</span><span class="detail-value" style="color:#f59e0b;">Pending Admin Approval</span></div>
    </div>
    <h2>What happens next:</h2>
    <ol>
      <li>Our team will review your vehicle details</li>
      <li>We'll verify your documents</li>
      <li>Once approved, your vehicle will be available for drivers</li>
      <li>You'll receive notification when your first booking comes in</li>
    </ol>
    <a href="${data.dashboardUrl}" style="color:#2563eb;">Manage your listing →</a>
  `;
  return {
    subject: "Your Vehicle is Now Listed on Rentmaikar",
    html: emailWrapper(content, "Vehicle Listed"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Vehicle Assigned to Driver (Owner notification)
 */
export const vehicleAssignedEmail = (data: {
  firstName: string;
  vehicleName: string;
  driverName: string;
  startDate: string;
  endDate: string;
  dailyRate: string;
  ownerEarnings: string;
  trackingUrl: string;
}) => {
  const content = `
    <div class="success-box">🤝 Vehicle Assigned</div>
    <h1>Your Vehicle Has Been Assigned to a Driver</h1>
    <p>Hello ${escapeHtml(data.firstName)}, your <strong>${escapeHtml(data.vehicleName)}</strong> has been assigned to a verified driver.</p>
    <div class="info-box">
      <h2>Assignment Details:</h2>
      <div class="detail-row"><span class="detail-label">Driver</span><span class="detail-value">${escapeHtml(data.driverName)} (Verified)</span></div>
      <div class="detail-row"><span class="detail-label">Rental Period</span><span class="detail-value">${escapeHtml(data.startDate)} to ${escapeHtml(data.endDate)}</span></div>
      <div class="detail-row"><span class="detail-label">Daily Rate</span><span class="detail-value">${escapeHtml(data.dailyRate)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Your Daily Earnings</span><span class="detail-value" style="color:#10b981;">${escapeHtml(data.ownerEarnings)}</span></div>
    </div>
    <a href="${data.trackingUrl}" class="cta-button">Track Your Vehicle →</a>
  `;
  return {
    subject: "Your Vehicle Has Been Assigned to a Driver",
    html: emailWrapper(content, "Vehicle Assigned"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Vehicle Maintenance Reminder (Owner)
 */
export const vehicleMaintenanceReminderEmail = (data: {
  firstName: string;
  vehicleName: string;
  maintenanceType: string;
  dueDate: string;
  odometer?: string;
  dashboardUrl: string;
}) => {
  const content = `
    <div class="warning-box">🔧 Maintenance Due</div>
    <h1>Maintenance Reminder for ${escapeHtml(data.vehicleName)}</h1>
    <p>Hello ${escapeHtml(data.firstName)}, your <strong>${escapeHtml(data.vehicleName)}</strong> is due for maintenance.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Maintenance Type</span><span class="detail-value">${escapeHtml(data.maintenanceType)}</span></div>
      <div class="detail-row"><span class="detail-label">Due Date</span><span class="detail-value">${escapeHtml(data.dueDate)}</span></div>
      ${data.odometer ? `<div class="detail-row" style="border-bottom:none;"><span class="detail-label">Current Odometer</span><span class="detail-value">${escapeHtml(data.odometer)}</span></div>` : ""}
    </div>
    <p>Please schedule maintenance to ensure your vehicle remains eligible for rentals.</p>
    <a href="${data.dashboardUrl}" class="cta-button">Schedule Maintenance →</a>
  `;
  return {
    subject: `Maintenance Reminder for ${data.vehicleName}`,
    html: emailWrapper(content, "Maintenance Reminder"),
    from: formatSenderEmail("noreply"),
  };
};

// ==================== NIGERIA-SPECIFIC TEMPLATES ====================

/**
 * Police Report Required (Nigeria)
 */
export const policeReportRequiredEmail = (data: {
  firstName: string;
  deadline: string;
  uploadUrl: string;
}) => {
  const content = `
    <div class="error-box">🚨 Police Report Required</div>
    <h1>IMPORTANT: Police Report Required - Nigeria Drivers</h1>
    <p>Dear ${escapeHtml(data.firstName)},</p>
    <p>As a Nigeria-based driver, you are required to submit a valid Police Report/Clearance Certificate.</p>
    <div class="info-box">
      <h2>Requirements:</h2>
      <ul>
        <li>Valid Police Report from Nigerian Police Force</li>
        <li>NIN (National Identification Number)</li>
        <li>BVN (Bank Verification Number)</li>
      </ul>
    </div>
    <p><strong>Deadline:</strong> ${escapeHtml(data.deadline)}</p>
    <a href="${data.uploadUrl}" class="cta-button">Upload Documents →</a>
    <div class="info-box">
      <p>📋 <strong>How to get Police Report:</strong> Visit any Nigeria Police Force Criminal Investigation Department with your ID and passport photos. Reports typically take 3-5 working days.</p>
    </div>
  `;
  return {
    subject: "IMPORTANT: Police Report Required - Nigeria Drivers",
    html: emailWrapper(content, "Police Report Required"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * NIN Verification Required (Nigeria)
 */
export const ninVerificationEmail = (data: {
  firstName: string;
  formattedNin?: string;
  uploadUrl: string;
}) => {
  const content = `
    <div class="warning-box">🇳🇬 NIN Verification</div>
    <h1>NIN Verification Required</h1>
    <p>Dear ${escapeHtml(data.firstName)},</p>
    <p>Please verify your National Identification Number (NIN) to continue using Rentmaikar.</p>
    ${data.formattedNin ? `<div class="info-box">
      <div class="detail-row"><span class="detail-label">NIN</span><span class="detail-value">${escapeHtml(data.formattedNin)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Status</span><span class="detail-value" style="color:#f59e0b;">Pending Verification</span></div>
    </div>` : ""}
    <h2>To verify your NIN:</h2>
    <ol>
      <li>Visit any NIMC enrollment center</li>
      <li>Request NIN verification slip</li>
      <li>Upload the verification slip below</li>
    </ol>
    <a href="${data.uploadUrl}" class="cta-button">Upload Verification Slip →</a>
  `;
  return {
    subject: "NIN Verification Required",
    html: emailWrapper(content, "NIN Verification"),
    from: formatSenderEmail("noreply"),
  };
};

// ==================== IDENTITY VERIFICATION (PERSONA) ====================

/**
 * Persona identity verification status change
 */
export const personaStatusUpdateEmail = (data: {
  firstName: string;
  status: 'submitted' | 'pending' | 'needs_review' | 'approved' | 'declined' | 'expired' | string;
  statusUrl: string;
  mismatchNote?: string;
}) => {
  const map: Record<string, { title: string; box: string; body: string; cta: string }> = {
    submitted: {
      title: 'Verification submitted',
      box: 'info-box',
      body: 'We received your identity verification and it is now queued for review. We will update you as soon as it moves forward.',
      cta: 'View status',
    },
    pending: {
      title: 'Verification in progress',
      box: 'info-box',
      body: 'Your identity verification is being processed. No action is required from you right now.',
      cta: 'View status',
    },
    needs_review: {
      title: 'Verification needs your attention',
      box: 'warning-box',
      body: 'Our reviewers need a closer look at your submission. Please open your verification page for details or additional steps.',
      cta: 'Open verification',
    },
    approved: {
      title: '🎉 Identity verified',
      box: 'success-box',
      body: 'Great news — your identity has been verified. Marketplace features are now unlocked on your dashboard.',
      cta: 'Go to dashboard',
    },
    declined: {
      title: 'Verification could not be completed',
      box: 'warning-box',
      body: 'Your identity verification did not pass this time. You can restart the flow from your verification page.',
      cta: 'Retry verification',
    },
    expired: {
      title: 'Verification session expired',
      box: 'warning-box',
      body: 'Your verification session expired before it was completed. Please start a new session to continue.',
      cta: 'Restart verification',
    },
  };
  const m = map[data.status] ?? map.pending;
  const content = `
    <div class="${m.box}">${m.title}</div>
    <h1>${m.title}</h1>
    <p>Hi ${escapeHtml(data.firstName || 'there')},</p>
    <p>${m.body}</p>
    ${data.mismatchNote ? `<div class="warning-box"><strong>Reviewer note:</strong> ${escapeHtml(data.mismatchNote)}</div>` : ''}
    <a href="${data.statusUrl}" class="cta-button">${m.cta} →</a>
    <p style="color:#64748b;font-size:13px;margin-top:24px;">You can always check the latest status from your Rentmaikar dashboard.</p>
  `;
  return {
    subject: `Rentmaikar identity verification: ${m.title}`,
    html: emailWrapper(content, m.title),
    from: formatSenderEmail('verify'),
  };
};

/**
 * Daily digest of Persona identity verification status changes.
 * Sent by the send-persona-digest scheduled worker to users who opted into
 * profiles.persona_notification_frequency = 'daily_digest'.
 */
export const personaStatusDigestEmail = (data: {
  firstName: string;
  count: number;
  latestStatus: string;
  summary: string;
  statusUrl: string;
}) => {
  const list = escapeHtml(data.summary)
    .split('\n')
    .filter(Boolean)
    .map((line) => `<li style="margin:4px 0;">${line.replace(/^•\s*/, '')}</li>`)
    .join('');
  const content = `
    <div class="info-box">Daily verification digest</div>
    <h1>Your identity verification updates</h1>
    <p>Hi ${escapeHtml(data.firstName || 'there')},</p>
    <p>Here is a summary of your Rentmaikar identity verification status changes from the last 24 hours (${data.count} update${data.count === 1 ? '' : 's'}). Latest status: <strong>${escapeHtml(data.latestStatus)}</strong>.</p>
    <ul style="padding-left:18px;color:#334155;font-size:14px;">${list}</ul>
    <a href="${data.statusUrl}" class="cta-button">Open verification status →</a>
    <p style="color:#64748b;font-size:13px;margin-top:24px;">You can switch back to real-time emails or turn digest emails off any time from Profile Settings.</p>
  `;
  return {
    subject: `Rentmaikar verification digest — ${data.count} update${data.count === 1 ? '' : 's'}`,
    html: emailWrapper(content, 'Verification digest'),
    from: formatSenderEmail('verify'),
  };
};





// ==================== SUPPORT TEMPLATES ====================

/**
 * Support Ticket Created
 */
export const supportTicketCreatedEmail = (data: {
  firstName: string;
  ticketId: string;
  subject: string;
  priority: string;
  estimatedTime: string;
  trackingUrl: string;
}) => {
  const content = `
    <div class="info-box" style="text-align:center;">📩 Support Ticket Received</div>
    <h1>Support Ticket Created</h1>
    <p>Hello ${escapeHtml(data.firstName)}, we've received your support request and created ticket <strong>#${escapeHtml(data.ticketId)}</strong>.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Subject</span><span class="detail-value">${escapeHtml(data.subject)}</span></div>
      <div class="detail-row"><span class="detail-label">Priority</span><span class="detail-value">${escapeHtml(data.priority)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Estimated Response</span><span class="detail-value">${escapeHtml(data.estimatedTime)}</span></div>
    </div>
    <p>We'll get back to you as soon as possible. You can track your ticket status here:</p>
    <a href="${data.trackingUrl}" class="cta-button">Track Ticket →</a>
  `;
  return {
    subject: `Support Ticket Created - [#${data.ticketId}]`,
    html: emailWrapper(content, "Support Ticket"),
    from: formatSenderEmail("support"),
  };
};

/**
 * Support Ticket Response
 */
export const supportTicketResponseEmail = (data: {
  firstName: string;
  ticketId: string;
  agentName: string;
  responseText: string;
  viewUrl: string;
}) => {
  const content = `
    <div class="info-box" style="text-align:center;">💬 New Support Response</div>
    <h1>New Response on Ticket [#${escapeHtml(data.ticketId)}]</h1>
    <p>Hello ${escapeHtml(data.firstName)}, there's a new response on your support ticket.</p>
    <div class="info-box">
      <p><strong>${escapeHtml(data.agentName)} wrote:</strong></p>
      <div style="white-space:pre-wrap;line-height:1.6;">${escapeHtml(data.responseText)}</div>
    </div>
    <a href="${data.viewUrl}" class="cta-button">View Response →</a>
  `;
  return {
    subject: `New Response on Ticket [#${data.ticketId}]`,
    html: emailWrapper(content, "Ticket Response"),
    from: formatSenderEmail("support"),
  };
};

// ==================== EMERGENCY TEMPLATES ====================

/**
 * Vehicle Shutdown Alert
 */
export const vehicleShutdownEmail = (data: {
  firstName: string;
  vehicleName: string;
  reason: string;
  shutdownTime: string;
  vehicleLocation?: string;
  supportPhone: string;
  chatUrl: string;
}) => {
  const content = `
    <div class="error-box">🚨 VEHICLE DISABLED</div>
    <h1>⚠️ URGENT: Your Vehicle Has Been Disabled</h1>
    <p>Hello ${escapeHtml(data.firstName)}, your vehicle (<strong>${escapeHtml(data.vehicleName)}</strong>) has been disabled.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Time of Shutdown</span><span class="detail-value">${escapeHtml(data.shutdownTime)}</span></div>
      <div class="detail-row"><span class="detail-label">Reason</span><span class="detail-value">${escapeHtml(data.reason)}</span></div>
      ${data.vehicleLocation ? `<div class="detail-row" style="border-bottom:none;"><span class="detail-label">Vehicle Location</span><span class="detail-value">${escapeHtml(data.vehicleLocation)}</span></div>` : ""}
    </div>
    <h2>To reactivate your vehicle:</h2>
    <ol>
      <li>Contact Rentmaikar support immediately</li>
      <li>Resolve the outstanding issue</li>
      <li>Await admin verification</li>
    </ol>
    <div style="text-align:center;">
      <a href="tel:${escapeHtml(data.supportPhone)}" class="danger-button" style="margin-right:8px;">📞 Call Support</a>
      <a href="${data.chatUrl}" class="cta-button" style="margin-left:8px;">💬 Chat Support</a>
    </div>
  `;
  return {
    subject: "⚠️ URGENT: Your Vehicle Has Been Disabled",
    html: emailWrapper(content, "Vehicle Disabled"),
    from: formatSenderEmail("admin"),
  };
};

/**
 * Accident Alert
 */
export const accidentAlertEmail = (data: {
  firstName: string;
  vehicleName: string;
  licensePlate?: string;
  incidentTime: string;
  incidentLocation?: string;
  emergencyNumber: string;
  policeNumber: string;
  supportNumber: string;
  safetyConfirmUrl: string;
  helpUrl: string;
}) => {
  const content = `
    <div class="error-box">🚑 ACCIDENT DETECTED</div>
    <h1>Accident Alert - Immediate Action Required</h1>
    <p>Hello ${escapeHtml(data.firstName)}, our system has detected a possible accident involving <strong>${escapeHtml(data.vehicleName)}</strong>.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Time of Incident</span><span class="detail-value">${escapeHtml(data.incidentTime)}</span></div>
      ${data.incidentLocation ? `<div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${escapeHtml(data.incidentLocation)}</span></div>` : ""}
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}${data.licensePlate ? ` (${escapeHtml(data.licensePlate)})` : ""}</span></div>
    </div>
    <div class="error-box">
      <strong>Emergency Contacts:</strong><br/>
      🚑 Ambulance: <strong>${escapeHtml(data.emergencyNumber)}</strong><br/>
      👮 Police: <strong>${escapeHtml(data.policeNumber)}</strong><br/>
      🆘 Rentmaikar Emergency: <strong>${escapeHtml(data.supportNumber)}</strong>
    </div>
    <p>Please confirm your safety by clicking one of the buttons below:</p>
    <div style="text-align:center;">
      <a href="${data.safetyConfirmUrl}" class="secondary-button" style="margin-right:8px;">✅ I'm Safe</a>
      <a href="${data.helpUrl}" class="danger-button" style="margin-left:8px;">🆘 Need Help</a>
    </div>
  `;
  return {
    subject: "🚑 Accident Alert - Immediate Action Required",
    html: emailWrapper(content, "Accident Alert"),
    from: formatSenderEmail("admin"),
  };
};

// ==================== MARKETING TEMPLATE ====================

/**
 * Seasonal Promotion
 */
export const seasonalPromotionEmail = (data: {
  promoTitle: string;
  promoMessage: string;
  discount: string;
  promoCode: string;
  ctaText: string;
  ctaUrl: string;
  expiryDate: string;
}) => {
  const content = `
    <h1>${escapeHtml(data.promoTitle)}</h1>
    <p>${escapeHtml(data.promoMessage)}</p>
    <div style="text-align:center;margin:30px 0;">
      <div style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;border-radius:16px;padding:32px 48px;">
        <div style="font-size:48px;font-weight:bold;">${escapeHtml(data.discount)}</div>
        <div style="font-size:18px;margin-top:4px;">OFF</div>
        <div style="margin-top:12px;font-size:14px;opacity:0.9;">Use code: <strong>${escapeHtml(data.promoCode)}</strong></div>
      </div>
    </div>
    <div style="text-align:center;">
      <a href="${data.ctaUrl}" class="cta-button">${escapeHtml(data.ctaText)}</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;">
      *Terms and conditions apply. Valid for new bookings only. Expires ${escapeHtml(data.expiryDate)}.
    </p>
  `;
  return {
    subject: `🎉 ${data.promoTitle}`,
    html: emailWrapper(content, "Promotion"),
    from: formatSenderEmail("noreply"),
  };
};

// ==================== ADMIN TEMPLATE ====================

/**
 * Admin Daily Operations Report
 */
export const adminDailyReportEmail = (data: {
  date: string;
  newUsers: number;
  activeRentals: number;
  revenue: string;
  pendingApprovals: number;
  usaDrivers: number; ngDrivers: number; totalDrivers: number;
  usaOwners: number; ngOwners: number; totalOwners: number;
  usaVehicles: number; ngVehicles: number; totalVehicles: number;
  usaDefaults: number; ngDefaults: number; totalDefaults: number;
  alerts: string[];
  reportUrl: string;
}) => {
  const content = `
    <h1>Daily Operations Report</h1>
    <p style="color:#64748b;">${escapeHtml(data.date)}</p>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${data.newUsers}</div><div class="stat-label">New Users</div></div>
      <div class="stat-card"><div class="stat-value">${data.activeRentals}</div><div class="stat-label">Active Rentals</div></div>
      <div class="stat-card"><div class="stat-value">${escapeHtml(data.revenue)}</div><div class="stat-label">Revenue</div></div>
      <div class="stat-card"><div class="stat-value">${data.pendingApprovals}</div><div class="stat-label">Pending Approvals</div></div>
    </div>

    <div class="info-box">
      <h2>📊 Detailed Metrics</h2>
      <table>
        <tr><th>Metric</th><th>USA</th><th>Nigeria</th><th>Total</th></tr>
        <tr><td>New Drivers</td><td>${data.usaDrivers}</td><td>${data.ngDrivers}</td><td>${data.totalDrivers}</td></tr>
        <tr><td>New Owners</td><td>${data.usaOwners}</td><td>${data.ngOwners}</td><td>${data.totalOwners}</td></tr>
        <tr><td>Vehicles Listed</td><td>${data.usaVehicles}</td><td>${data.ngVehicles}</td><td>${data.totalVehicles}</td></tr>
        <tr><td>Payment Defaults</td><td>${data.usaDefaults}</td><td>${data.ngDefaults}</td><td>${data.totalDefaults}</td></tr>
      </table>
    </div>

    ${data.alerts.length ? `
    <div class="warning-box">
      <h2>⚠️ Alerts</h2>
      <ul>${data.alerts.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
    </div>` : ""}

    <a href="${data.reportUrl}" style="color:#2563eb;">View Full Report →</a>
  `;
  return {
    subject: `Rentmaikar Daily Operations Report - ${data.date}`,
    html: emailWrapper(content, "Daily Report"),
    from: formatSenderEmail("admin"),
  };
};

// ==================== PRICE NEGOTIATION TEMPLATES ====================

/**
 * Negotiation Submitted Notification (Driver / Owner)
 */
export const negotiationSubmittedEmail = (data: {
  firstName: string;
  vehicleName: string;
  requestedRate: number;
  currency: 'USD' | 'NGN';
  frequency: 'daily' | 'weekly';
  userType: 'driver' | 'owner';
  dashboardUrl: string;
}) => {
  const content = `
    <div class="info-box">📋 Negotiation Submitted</div>
    <h1>Your Price Negotiation Has Been Submitted</h1>
    <p>Hi ${escapeHtml(data.firstName)}, we've received your ${data.frequency} rate negotiation request.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row"><span class="detail-label">Requested ${data.frequency} rate</span><span class="detail-value amount">${formatCurrency(data.requestedRate, data.currency)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Role</span><span class="detail-value" style="text-transform:capitalize;">${data.userType}</span></div>
    </div>
    <p>Our admin team will review your request and respond within <strong>24 hours</strong>. You'll be notified of any updates via email and your preferred messaging channel.</p>
    <a href="${data.dashboardUrl}" class="cta-button">View in Dashboard →</a>
  `;
  return {
    subject: `Price Negotiation Submitted – ${data.vehicleName}`,
    html: emailWrapper(content, "Negotiation Submitted"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Negotiation Approved Email
 */
export const negotiationApprovedEmail = (data: {
  firstName: string;
  vehicleName: string;
  approvedRate: number;
  currency: 'USD' | 'NGN';
  frequency: 'daily' | 'weekly';
  dashboardUrl: string;
}) => {
  const content = `
    <div class="success-box">✅ Price Approved</div>
    <h1>Your Negotiated Rate Has Been Approved!</h1>
    <p>Great news, ${escapeHtml(data.firstName)}! Your price negotiation has been approved.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Approved ${data.frequency} rate</span><span class="detail-value amount">${formatCurrency(data.approvedRate, data.currency)}</span></div>
    </div>
    <p>This rate is now active on your rental. No further action is required.</p>
    <a href="${data.dashboardUrl}" class="cta-button">View in Dashboard →</a>
  `;
  return {
    subject: `✅ Price Approved – ${formatCurrency(data.approvedRate, data.currency)}/${data.frequency}`,
    html: emailWrapper(content, "Negotiation Approved"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Negotiation Rejected Email
 */
export const negotiationRejectedEmail = (data: {
  firstName: string;
  vehicleName: string;
  requestedRate: number;
  currency: 'USD' | 'NGN';
  frequency: 'daily' | 'weekly';
  reason?: string;
  dashboardUrl: string;
}) => {
  const content = `
    <div class="error-box">❌ Negotiation Declined</div>
    <h1>Your Price Negotiation Was Declined</h1>
    <p>Hi ${escapeHtml(data.firstName)}, unfortunately your price negotiation for <strong>${escapeHtml(data.vehicleName)}</strong> was not approved.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(data.vehicleName)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Requested rate</span><span class="detail-value">${formatCurrency(data.requestedRate, data.currency)}/${data.frequency}</span></div>
    </div>
    ${data.reason ? `<div class="warning-box"><strong>Reason:</strong> ${escapeHtml(data.reason)}</div>` : ''}
    <p>You're welcome to submit a new negotiation request with an updated rate from your dashboard.</p>
    <a href="${data.dashboardUrl}" class="cta-button">Submit New Request →</a>
  `;
  return {
    subject: `Negotiation Declined – ${data.vehicleName}`,
    html: emailWrapper(content, "Negotiation Declined"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Negotiation Counter Offer Email
 */
export const negotiationCounterOfferEmail = (data: {
  firstName: string;
  vehicleName: string;
  originalRate: number;
  counterRate: number;
  currency: 'USD' | 'NGN';
  frequency: 'daily' | 'weekly';
  dashboardUrl: string;
}) => {
  const content = `
    <div class="warning-box">🔄 Counter Offer Received</div>
    <h1>You Have a Counter Offer</h1>
    <p>Hi ${escapeHtml(data.firstName)}, the admin has reviewed your negotiation for <strong>${escapeHtml(data.vehicleName)}</strong> and proposed a counter offer.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Your request</span><span class="detail-value">${formatCurrency(data.originalRate, data.currency)}/${data.frequency}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Counter offer</span><span class="detail-value amount">${formatCurrency(data.counterRate, data.currency)}/${data.frequency}</span></div>
    </div>
    <p>Please review the counter offer and respond in your dashboard.</p>
    <a href="${data.dashboardUrl}" class="cta-button">Review Counter Offer →</a>
  `;
  return {
    subject: `🔄 Counter Offer – ${data.vehicleName}`,
    html: emailWrapper(content, "Counter Offer"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Negotiation Locked Email
 */
export const negotiationLockedEmail = (data: {
  firstName: string;
  vehicleName: string;
  lockedRate: number;
  currency: 'USD' | 'NGN';
  frequency: 'daily' | 'weekly';
  dashboardUrl: string;
}) => {
  const content = `
    <div class="success-box">🔒 Price Locked</div>
    <h1>Your Rental Rate Has Been Finalized</h1>
    <p>Hi ${escapeHtml(data.firstName)}, the ${data.frequency} rate for <strong>${escapeHtml(data.vehicleName)}</strong> has been finalized and locked.</p>
    <div class="info-box">
      <div style="text-align:center;margin-bottom:20px;">
        <p style="color:#64748b;font-size:14px;margin:0;">Locked ${data.frequency} rate</p>
        <span class="amount">${formatCurrency(data.lockedRate, data.currency)}</span>
      </div>
    </div>
    <div class="warning-box"><strong>Note:</strong> This rate cannot be modified without submitting a formal modification request for admin approval.</div>
    <a href="${data.dashboardUrl}" style="color:#2563eb;">View in Dashboard →</a>
  `;
  return {
    subject: `🔒 Rate Locked – ${formatCurrency(data.lockedRate, data.currency)}/${data.frequency}`,
    html: emailWrapper(content, "Price Locked"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Modification Request Email
 */
export const negotiationModificationRequestEmail = (data: {
  firstName: string;
  vehicleName: string;
  currentRate: number;
  requestedRate: number;
  currency: 'USD' | 'NGN';
  reason: string;
  dashboardUrl: string;
}) => {
  const content = `
    <div class="info-box">📝 Modification Request</div>
    <h1>Price Modification Request Submitted</h1>
    <p>Hi ${escapeHtml(data.firstName)}, your request to modify the locked rate for <strong>${escapeHtml(data.vehicleName)}</strong> has been submitted.</p>
    <div class="info-box">
      <div class="detail-row"><span class="detail-label">Current rate</span><span class="detail-value">${formatCurrency(data.currentRate, data.currency)}</span></div>
      <div class="detail-row"><span class="detail-label">Requested rate</span><span class="detail-value amount">${formatCurrency(data.requestedRate, data.currency)}</span></div>
      <div class="detail-row" style="border-bottom:none;"><span class="detail-label">Reason</span><span class="detail-value">${escapeHtml(data.reason)}</span></div>
    </div>
    <p>An admin will review this request and you'll be notified of the outcome.</p>
    <a href="${data.dashboardUrl}" style="color:#2563eb;">View in Dashboard →</a>
  `;
  return {
    subject: `Price Modification Request – ${data.vehicleName}`,
    html: emailWrapper(content, "Modification Request"),
    from: formatSenderEmail("noreply"),
  };
};

/**
 * Modification Processed Email
 */
export const negotiationModificationProcessedEmail = (data: {
  firstName: string;
  vehicleName: string;
  newRate: number;
  currency: 'USD' | 'NGN';
  frequency: 'daily' | 'weekly';
  approved: boolean;
  adminResponse?: string;
  dashboardUrl: string;
}) => {
  const approved = data.approved;
  const content = `
    <div class="${approved ? 'success-box' : 'error-box'}">${approved ? '✅' : '❌'} Modification ${approved ? 'Approved' : 'Denied'}</div>
    <h1>Price Modification ${approved ? 'Approved' : 'Denied'}</h1>
    <p>Hi ${escapeHtml(data.firstName)}, your price modification request for <strong>${escapeHtml(data.vehicleName)}</strong> has been ${approved ? 'approved' : 'denied'}.</p>
    ${approved ? `
    <div class="info-box">
      <div style="text-align:center;">
        <p style="color:#64748b;font-size:14px;margin:0;">New ${data.frequency} rate</p>
        <span class="amount">${formatCurrency(data.newRate, data.currency)}</span>
      </div>
    </div>
    <p>The updated rate is now active on your rental.</p>` : `
    <p>The current rate remains unchanged.</p>`}
    ${data.adminResponse ? `<div class="info-box"><p><strong>Admin response:</strong> ${escapeHtml(data.adminResponse)}</p></div>` : ''}
    <a href="${data.dashboardUrl}" class="cta-button">View in Dashboard →</a>
  `;
  return {
    subject: `${approved ? '✅' : '❌'} Modification ${approved ? 'Approved' : 'Denied'} – ${data.vehicleName}`,
    html: emailWrapper(content, approved ? "Modification Approved" : "Modification Denied"),
    from: formatSenderEmail("noreply"),
  };
};

// ==================== AUTH & VERIFICATION TEMPLATES ====================

/**
 * Email Verification Template
 */
export const emailVerificationEmail = (data: {
  firstName: string;
  verificationUrl: string;
  expiresIn?: string;
}) => {
  const content = `
    <h1>Verify Your Email Address</h1>
    <p>Hi ${escapeHtml(data.firstName)},</p>
    <p>Welcome to Rentmaikar! Please verify your email address to complete your account setup and access all features.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.verificationUrl}" class="cta-button">Verify Email Address →</a>
    </div>
    <p style="color: #64748b; font-size: 13px;">This link expires in ${data.expiresIn || '24 hours'}. If you didn't create an account, you can safely ignore this email.</p>
  `;
  return {
    subject: "Verify your Rentmaikar email address",
    html: emailWrapper(content, "Email Verification"),
    from: formatSenderEmail("verify"),
  };
};

/**
 * Password Reset Template
 */
export const passwordResetEmail = (data: {
  firstName: string;
  resetUrl: string;
  expiresIn?: string;
}) => {
  const content = `
    <h1>Reset Your Password</h1>
    <p>Hi ${escapeHtml(data.firstName)},</p>
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.resetUrl}" class="cta-button">Reset Password →</a>
    </div>
    <p style="color: #64748b; font-size: 13px;">This link expires in ${data.expiresIn || '1 hour'}. If you didn't request this, please ignore this email — your account is safe.</p>
  `;
  return {
    subject: "Reset your Rentmaikar password",
    html: emailWrapper(content, "Password Reset"),
    from: formatSenderEmail("verify"),
  };
};

/**
 * Login Alert / New Device Notification
 */
export const loginAlertEmail = (data: {
  firstName: string;
  device: string;
  location?: string;
  time: string;
  dashboardUrl: string;
}) => {
  const content = `
    <h1>New Login Detected</h1>
    <p>Hi ${escapeHtml(data.firstName)},</p>
    <p>A new login to your Rentmaikar account was detected:</p>
    <div class="info-box">
      <p><strong>Device:</strong> ${escapeHtml(data.device)}</p>
      ${data.location ? `<p><strong>Location:</strong> ${escapeHtml(data.location)}</p>` : ''}
      <p><strong>Time:</strong> ${escapeHtml(data.time)}</p>
    </div>
    <p>If this was you, no action is needed. If you don't recognize this activity, please secure your account immediately:</p>
    <a href="${data.dashboardUrl}" class="cta-button">Review Account Security →</a>
  `;
  return {
    subject: "New login to your Rentmaikar account",
    html: emailWrapper(content, "Login Alert"),
    from: formatSenderEmail("verify"),
  };
};

/**
 * Account Deactivation Notice
 */
export const accountDeactivatedEmail = (data: {
  firstName: string;
  reason: string;
  supportEmail?: string;
}) => {
  const content = `
    <h1>Account Deactivated</h1>
    <p>Hi ${escapeHtml(data.firstName)},</p>
    <p>Your Rentmaikar account has been deactivated for the following reason:</p>
    <div class="info-box"><p>${escapeHtml(data.reason)}</p></div>
    <p>If you believe this was an error, please contact our support team at <strong>${data.supportEmail || 'support@rentmaikar.com'}</strong>.</p>
  `;
  return {
    subject: "Your Rentmaikar account has been deactivated",
    html: emailWrapper(content, "Account Deactivated"),
    from: formatSenderEmail("admin"),
  };
};

// ==================== TEMPLATE REGISTRY ====================

export type EmailTemplate =
  | 'welcome'
  | 'welcome_driver'
  | 'welcome_owner'
  | 'otp'
  | 'booking_confirmation'
  | 'owner_booking_notification'
  | 'payment_receipt'
  | 'payment_failed'
  | 'payment_reminder'
  | 'payment_overdue'
  | 'owner_payout'
  | 'vehicle_lockdown'
  | 'vehicle_unlocked'
  | 'plan_downgrade'
  | 'document_verified'
  | 'document_verification_failed'
  | 'document_expiry_warning'
  | 'vehicle_listed'
  | 'vehicle_assigned'
  | 'vehicle_maintenance_reminder'
  | 'police_report_required'
  | 'nin_verification'
  | 'support_ticket_created'
  | 'support_ticket_response'
  | 'vehicle_shutdown'
  | 'accident_alert'
  | 'seasonal_promotion'
  | 'admin_daily_report'
  | 'negotiation_submitted'
  | 'negotiation_approved'
  | 'negotiation_rejected'
  | 'negotiation_counter_offer'
  | 'negotiation_locked'
  | 'negotiation_modification_request'
  | 'negotiation_modification_processed'
  | 'email_verification'
  | 'password_reset'
  | 'login_alert'
  | 'account_deactivated'
  | 'provider_health_alert';

/**
 * Communication provider health alert (Twilio / Termii / Resend).
 * Sent to admins when delivery, bounce or webhook error rates spike.
 */
export const providerHealthAlertEmail = (data: {
  provider: string;
  severity: string;
  windowHours: number;
  headline: string;
  lines: string[];
  dashboardUrl: string;
}) => {
  const content = `
    <h1>${data.severity === 'critical' ? '🚨' : '⚠️'} Provider alert: ${escapeHtml(data.provider)}</h1>
    <p style="color:#64748b;">Detected over the last ${data.windowHours} hour(s).</p>
    <div class="warning-box">
      <h2>${escapeHtml(data.headline)}</h2>
      <ul>${data.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
    </div>
    <a href="${data.dashboardUrl}" class="cta-button">Open Provider Health →</a>
  `;
  return {
    subject: `[${data.severity.toUpperCase()}] ${data.provider} delivery issues — ${data.headline}`,
    html: emailWrapper(content, 'Provider Health Alert'),
    from: formatSenderEmail('admin'),
  };
};


/**
 * Generic event notification email used by the event-category fanout
 * (dispatch-event-notifications). Always carries the deep link to the record.
 */
export const eventNotificationEmail = (data: {
  title: string;
  body?: string;
  category: string;
  status?: string;
  recordId?: string;
  deepLink: string;
}) => {
  const content = `
    <h1>${escapeHtml(data.title)}</h1>
    <p style="color:#64748b;">Category: ${escapeHtml(data.category.replace(/_/g, ' '))}${
      data.status ? ` &middot; Status: ${escapeHtml(data.status)}` : ''
    }</p>
    ${data.body ? `<p>${escapeHtml(data.body)}</p>` : ''}
    ${data.recordId ? `<p style="color:#94a3b8;font-size:12px;">Record: ${escapeHtml(data.recordId)}</p>` : ''}
    <a href="${data.deepLink}" class="cta-button">Open record →</a>
  `;
  return {
    subject: data.title,
    html: emailWrapper(content, 'Event Notification'),
    text: `${data.title}\n\n${data.body ?? ''}\n\nOpen: ${data.deepLink}`,
    from: formatSenderEmail('notifications'),
  };
};
