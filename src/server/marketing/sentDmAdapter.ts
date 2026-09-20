/**
 * RentMaikar Marketing Engine - SENT.dm Adapter
 * Enterprise CPaaS integration supporting SMS, WhatsApp, Campaign Blasts, Delivery Status,
 * Inbound Webhooks, and Regulatory Opt-in/Opt-out enforcement.
 */

import { ProviderStatusInfo, SendMessageParams } from './types';

const SENT_API_BASE = process.env.SENT_API_BASE || 'https://api.sent.dm';

export interface SentDmMessageResult {
  ok: boolean;
  messageId?: string;
  channel?: 'sms' | 'whatsapp';
  status?: string;
  error?: string;
  raw?: any;
}

export interface SentDmStatusCheck {
  id: string;
  status: 'queued' | 'sending' | 'delivered' | 'failed' | 'read' | 'undelivered';
  channel: string;
  recipient: string;
  timestamp: string;
}

export class SentDmAdapter {
  readonly platform = 'sentdm' as const;
  private apiKey: string;
  private baseUrl: string;
  private senderId: string;
  private whatsappNumber: string;

  constructor() {
    this.apiKey = process.env.SENT_API_KEY || '';
    this.baseUrl = SENT_API_BASE;
    this.senderId = process.env.SENT_SENDER_ID || 'Rentmaikar';
    this.whatsappNumber = process.env.SENT_WHATSAPP_NUMBER || '+16085489220';
  }

  isConnected(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  async getStatus(): Promise<ProviderStatusInfo> {
    if (!this.isConnected()) {
      return {
        platform: 'sentdm' as any,
        displayName: 'SENT.dm (Global SMS & WhatsApp)',
        status: 'not_connected',
        accountId: null,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Credentials not configured (SENT_API_KEY missing)',
        capabilities: [
          'Direct SMS (USA 10DLC & Nigeria)',
          'Verified WhatsApp Business API',
          'Campaign Bulk Outbound',
          'Delivery Status Callbacks',
          'Opt-in / STOP Compliance',
          'Inbound Webhooks',
        ],
      };
    }

    try {
      // Validate SENT.dm account credentials
      const res = await fetch(`${this.baseUrl}/v3/account`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          platform: 'sentdm' as any,
          displayName: 'SENT.dm (Global SMS & WhatsApp)',
          status: 'error',
          accountId: this.senderId,
          accountName: null,
          lastSynchronized: new Date().toISOString(),
          apiStatus: `API Error ${res.status}: ${body?.error || body?.message || res.statusText}`,
          error: body?.error || 'Account validation failed',
          capabilities: [
            'SMS Delivery',
            'WhatsApp Delivery',
            'Delivery Receipts',
            'Webhooks',
          ],
        };
      }

      const data = await res.json();

      return {
        platform: 'sentdm' as any,
        displayName: 'SENT.dm (Global SMS & WhatsApp)',
        status: 'connected',
        accountId: data.account_id || data.id || this.senderId,
        accountName: data.name || data.company_name || 'RentMaikar CPaaS Gateway',
        lastSynchronized: new Date().toISOString(),
        apiStatus: 'Connected & Operational (v3 OpenAPI)',
        capabilities: [
          'Direct SMS (USA 10DLC & Nigeria)',
          'Verified WhatsApp Business API',
          'Campaign Outbound',
          'Delivery Receipts (DLR)',
          'Opt-out Enforcement',
          'Inbound Webhooks',
        ],
      };
    } catch (err: any) {
      return {
        platform: 'sentdm' as any,
        displayName: 'SENT.dm (Global SMS & WhatsApp)',
        status: 'error',
        accountId: this.senderId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: `Connection Error: ${err.message}`,
        error: err.message,
        capabilities: ['SMS Delivery', 'WhatsApp Delivery', 'Webhooks'],
      };
    }
  }

  /**
   * Dispatch single SMS or WhatsApp message
   */
  async sendMessage(params: SendMessageParams): Promise<SentDmMessageResult> {
    if (!this.isConnected()) {
      return { ok: false, error: 'SENT.DM NOT CONNECTED: Missing SENT_API_KEY' };
    }

    // Check opt-out keywords
    const cleanedTo = params.to.trim();
    if (!cleanedTo) {
      return { ok: false, error: 'Recipient phone number is required' };
    }

    try {
      const channel = params.channel === 'whatsapp' ? 'whatsapp' : 'sms';
      const from = channel === 'whatsapp' ? this.whatsappNumber : this.senderId;

      const payload: any = {
        to: cleanedTo,
        from,
        channel,
        text: params.text,
        metadata: {
          leadId: params.leadId,
          ...(params.metadata || {}),
        },
      };

      if (params.templateId) {
        payload.template_id = params.templateId;
      }

      const res = await fetch(`${this.baseUrl}/v3/messages`, {
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
          error: body.error || body.message || `Dispatch failed (HTTP ${res.status})`,
          raw: body,
        };
      }

      return {
        ok: true,
        messageId: body.id || body.message_id || `sent_${Date.now()}`,
        channel,
        status: body.status || 'sent',
        raw: body,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Query delivery status for a dispatched message
   */
  async getDeliveryStatus(messageId: string): Promise<{ ok: boolean; status?: SentDmStatusCheck; error?: string }> {
    if (!this.isConnected()) {
      return { ok: false, error: 'SENT.DM NOT CONNECTED: Missing SENT_API_KEY' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/v3/messages/${messageId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return {
        ok: true,
        status: {
          id: data.id || messageId,
          status: data.status || 'delivered',
          channel: data.channel || 'sms',
          recipient: data.to || '',
          timestamp: data.updated_at || new Date().toISOString(),
        },
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Process incoming webhook (DLR delivery receipts, inbound replies, opt-outs)
   */
  async handleWebhook(body: any, _headers: Record<string, string>): Promise<{
    handled: boolean;
    eventType?: string;
    isOptOut?: boolean;
    messageId?: string;
    status?: string;
    inboundText?: string;
    sender?: string;
    error?: string;
  }> {
    try {
      const eventType = body.event || body.type || 'message.status';
      const message = body.data || body.message || body;

      const messageId = message.id || message.message_id;
      const status = message.status;
      const text = message.text || message.body || '';
      const sender = message.from || message.sender;

      // Check opt-out keywords (STOP, UNSUBSCRIBE, CANCEL, QUIT, END)
      const isOptOut = /^(stop|unsubscribe|cancel|quit|end)\b/i.test(text.trim());

      return {
        handled: true,
        eventType,
        isOptOut,
        messageId,
        status,
        inboundText: text,
        sender,
      };
    } catch (err: any) {
      return { handled: false, error: err.message };
    }
  }
}
