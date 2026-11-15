/**
 * RentMaikar Marketing Engine - Resend Adapter
 * Transactional & Campaign Email engine using the verified outgoing domain: notify.rentmaikar.com
 * Supports delivery verification, bounce/complaint webhooks, and lead attribution.
 */

import { ProviderStatusInfo, SendEmailParams } from './types';
import { sendEmailViaResend } from '../emailService';

const RESEND_API_BASE = 'https://api.resend.com';
export const OUTGOING_SENDER_DOMAIN = 'notify.rentmaikar.com';
export const DEFAULT_SENDER = `RentMaikar <campaigns@${OUTGOING_SENDER_DOMAIN}>`;

export interface ResendEmailResult {
  ok: boolean;
  emailId?: string;
  from?: string;
  to?: string;
  leadId?: string;
  error?: string;
  raw?: any;
}

export interface ResendEmailStatus {
  id: string;
  to: string[];
  from: string;
  subject: string;
  status: 'sent' | 'delivered' | 'delivery_delayed' | 'complained' | 'bounced';
  createdAt: string;
}

export class ResendAdapter {
  readonly platform = 'resend' as const;
  private apiKey: string;
  private defaultFrom: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || '';
    this.defaultFrom = DEFAULT_SENDER;
  }

  isConnected(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  async getStatus(): Promise<ProviderStatusInfo> {
    if (!this.isConnected()) {
      return {
        platform: 'resend' as any,
        displayName: 'Resend (Email Engine)',
        status: 'not_connected',
        accountId: null,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Credentials not configured (RESEND_API_KEY missing)',
        capabilities: [
          `Verified Outbound Domain (${OUTGOING_SENDER_DOMAIN})`,
          'Marketing & Campaign Newsletters',
          'Transactional Email Delivery',
          'Bounce & Complaint Handling',
          'Webhooks & Open/Click Tracking',
        ],
      };
    }

    try {
      // Validate with Resend API
      const res = await fetch(`${RESEND_API_BASE}/api-keys`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          platform: 'resend' as any,
          displayName: 'Resend (Email Engine)',
          status: 'error',
          accountId: null,
          accountName: null,
          lastSynchronized: new Date().toISOString(),
          apiStatus: `API Error ${res.status}: ${body?.message || res.statusText}`,
          error: body?.message || 'Authentication error',
          capabilities: ['Email Outbound', 'Webhooks'],
        };
      }

      return {
        platform: 'resend' as any,
        displayName: 'Resend (Email Engine)',
        status: 'connected',
        accountId: OUTGOING_SENDER_DOMAIN,
        accountName: `Verified Sender (${OUTGOING_SENDER_DOMAIN})`,
        lastSynchronized: new Date().toISOString(),
        apiStatus: 'Connected & Operational (Resend REST API)',
        capabilities: [
          `Verified Outbound Domain (${OUTGOING_SENDER_DOMAIN})`,
          'Campaign Email Outbound',
          'Transactional Email Delivery',
          'Bounce & Complaint Detection',
          'Webhook Ingestion',
        ],
      };
    } catch (err: any) {
      return {
        platform: 'resend' as any,
        displayName: 'Resend (Email Engine)',
        status: 'error',
        accountId: OUTGOING_SENDER_DOMAIN,
        accountName: null,
        lastSynchronized: null,
        apiStatus: `Connection Error: ${err.message}`,
        error: err.message,
        capabilities: ['Email Outbound', 'Webhooks'],
      };
    }
  }

  /**
   * Dispatch campaign or marketing email using notify.rentmaikar.com
   */
  async sendEmail(params: SendEmailParams): Promise<ResendEmailResult> {
    if (!this.isConnected()) {
      return { ok: false, error: 'RESEND NOT CONNECTED: Missing RESEND_API_KEY' };
    }

    const to = params.to?.trim();
    if (!to) {
      return { ok: false, error: 'Recipient email is required' };
    }

    // Sender must use verified domain notify.rentmaikar.com
    const from = params.from && params.from.includes(OUTGOING_SENDER_DOMAIN)
      ? params.from
      : this.defaultFrom;

    try {
      const unsubscribeNotice = `\n\n---\nRentMaikar Fleet Operations | 100% CAN-SPAM & TCPA Compliant\nTo unsubscribe from monthly marketing updates, click here: https://rentmaikar.com/unsubscribe?email=${encodeURIComponent(to)}\nOr reply STOP to opt out.`;

      let html = '';
      let text: string | undefined = undefined;

      if (params.html) {
        if (!params.html.toLowerCase().includes('unsubscribe')) {
          html = `${params.html}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5;"><p>You received this message as part of the RentMaikar driver roster monthly campaign.</p><p><a href="https://rentmaikar.com/unsubscribe?email=${encodeURIComponent(to)}" style="color:#0284c7;text-decoration:underline;">Unsubscribe from marketing updates</a> | Reply STOP to opt out.</p><p>RentMaikar Fleet Operations &bull; 100% CAN-SPAM Compliant</p></div>`;
        } else {
          html = params.html;
        }
        text = params.text;
      } else if (params.text) {
        text = (!params.text.toLowerCase().includes('unsubscribe') && !params.text.toLowerCase().includes('stop'))
          ? `${params.text}${unsubscribeNotice}`
          : params.text;
        html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1e293b;font-size:15px;">${text.replace(/\n/g, '<br/>')}</div>`;
      } else {
        text = `RentMaikar Fleet Notification${unsubscribeNotice}`;
        html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1e293b;font-size:15px;">${text.replace(/\n/g, '<br/>')}</div>`;
      }

      const result = await sendEmailViaResend({
        from,
        to,
        subject: params.subject,
        html,
        text,
        replyTo: params.replyTo,
        templateName: params.campaignId ? `marketing_campaign_${params.campaignId}` : 'marketing_campaign',
        metadata: {
          channel: 'marketing',
          leadId: params.leadId,
          campaignId: params.campaignId,
        },
      });

      if (!result.ok) {
        return {
          ok: false,
          error: result.error || 'Marketing email dispatch failed',
        };
      }

      return {
        ok: true,
        emailId: result.messageId,
        from,
        to,
        leadId: params.leadId,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Fetch status of an email
   */
  async getEmailStatus(emailId: string): Promise<{ ok: boolean; status?: ResendEmailStatus; error?: string }> {
    if (!this.isConnected()) {
      return { ok: false, error: 'RESEND NOT CONNECTED' };
    }

    try {
      const res = await fetch(`${RESEND_API_BASE}/emails/${emailId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return {
        ok: true,
        status: {
          id: data.id,
          to: data.to,
          from: data.from,
          subject: data.subject,
          status: data.last_event || 'delivered',
          createdAt: data.created_at,
        },
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Process incoming Resend Webhooks (delivery, open, click, bounce, complaint)
   */
  async handleWebhook(body: any, _headers: Record<string, string>): Promise<{
    handled: boolean;
    eventType?: string;
    emailId?: string;
    recipient?: string;
    isBounce?: boolean;
    isComplaint?: boolean;
    error?: string;
  }> {
    try {
      const eventType = body.type || 'email.event';
      const data = body.data || body;

      const emailId = data.email_id || data.id;
      const recipient = Array.isArray(data.to) ? data.to[0] : data.to;
      const isBounce = eventType === 'email.bounced';
      const isComplaint = eventType === 'email.complained';

      return {
        handled: true,
        eventType,
        emailId,
        recipient,
        isBounce,
        isComplaint,
      };
    } catch (err: any) {
      return { handled: false, error: err.message };
    }
  }
}
