/**
 * RentMaikar Marketing Engine - Resend Adapter
 * Transactional & Campaign Email engine using the verified outgoing domain: notify.rentmaikar.com
 * Supports delivery verification, bounce/complaint webhooks, and lead attribution.
 */

import { ProviderStatusInfo, SendEmailParams } from './types';

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
      const payload: any = {
        from,
        to: [to],
        subject: params.subject,
        headers: {
          'X-Entity-Ref-ID': params.leadId || `mkt_${Date.now()}`,
          ...(params.campaignId ? { 'X-Campaign-ID': params.campaignId } : {}),
        },
      };

      if (params.html) {
        payload.html = params.html;
      } else if (params.text) {
        payload.text = params.text;
      } else {
        payload.text = 'RentMaikar Notification';
      }

      if (params.replyTo) {
        payload.reply_to = params.replyTo;
      }

      const res = await fetch(`${RESEND_API_BASE}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          ok: false,
          error: body.message || `Resend dispatch failed (HTTP ${res.status})`,
          raw: body,
        };
      }

      return {
        ok: true,
        emailId: body.id,
        from,
        to,
        leadId: params.leadId,
        raw: body,
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
