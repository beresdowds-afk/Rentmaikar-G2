/**
 * RentMaikar Marketing Engine - ManyChat Adapter
 * Social conversation automation layer for Facebook Messenger, Instagram DM, and WhatsApp.
 * Supports lead capture, conversational triggers, webhook processing, campaign attribution, and lead sync.
 */

import { ProviderStatusInfo } from './types';

const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

export interface ManyChatSubscriberData {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  status?: string;
  subscribed?: string;
  last_interaction?: string;
  custom_fields?: Record<string, any>;
  tags?: string[];
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  ad_id?: string;
}

export class ManyChatAdapter {
  readonly platform = 'manychat' as const;
  private apiKey: string;
  private pageId: string | null = null;

  constructor() {
    this.apiKey = process.env.MANYCHAT_API_KEY || process.env.MANYCHAT_ACCESS_TOKEN || '';
    this.pageId = process.env.MANYCHAT_PAGE_ID || null;
  }

  isConnected(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  async getStatus(): Promise<ProviderStatusInfo> {
    if (!this.isConnected()) {
      return {
        platform: 'manychat' as any,
        displayName: 'ManyChat (Social Automation)',
        status: 'not_connected',
        accountId: null,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Credentials not configured (MANYCHAT_API_KEY missing)',
        capabilities: [
          'Social Conversation Automation',
          'Lead Capture & Sync',
          'Instagram DM / Messenger Triggers',
          'Campaign Attribution',
          'Webhooks',
        ],
      };
    }

    try {
      const res = await fetch(`${MANYCHAT_API_BASE}/page/getInfo`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          platform: 'manychat' as any,
          displayName: 'ManyChat (Social Automation)',
          status: 'error',
          accountId: this.pageId,
          accountName: null,
          lastSynchronized: new Date().toISOString(),
          apiStatus: `API Error ${res.status}: ${body?.message || res.statusText}`,
          error: body?.message || 'Authentication or permissions error',
          capabilities: [
            'Social Conversation Automation',
            'Lead Capture & Sync',
            'Campaign Attribution',
            'Webhooks',
          ],
        };
      }

      const data = await res.json();
      const page = data.data || {};

      return {
        platform: 'manychat' as any,
        displayName: 'ManyChat (Social Automation)',
        status: 'connected',
        accountId: String(page.id || this.pageId || 'manychat-page'),
        accountName: page.name || 'RentMaikar Social Inbox',
        lastSynchronized: new Date().toISOString(),
        apiStatus: 'Connected & Operational (API v2)',
        capabilities: [
          'Social Conversation Automation',
          'Lead Capture & Sync',
          'Instagram DM / Messenger Triggers',
          'Campaign Attribution',
          'Webhooks',
        ],
      };
    } catch (err: any) {
      return {
        platform: 'manychat' as any,
        displayName: 'ManyChat (Social Automation)',
        status: 'error',
        accountId: this.pageId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: `Connection Failure: ${err.message}`,
        error: err.message,
        capabilities: [
          'Social Conversation Automation',
          'Lead Capture & Sync',
          'Campaign Attribution',
          'Webhooks',
        ],
      };
    }
  }

  /**
   * Send automated content / message to a ManyChat subscriber
   */
  async sendContent(
    subscriberId: string | number,
    text: string,
    options?: { buttons?: Array<{ type: string; title: string; url?: string; payload?: string }> }
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.isConnected()) {
      return { ok: false, error: 'MANYCHAT NOT CONNECTED: Missing MANYCHAT_API_KEY' };
    }

    try {
      const payload: any = {
        subscriber_id: subscriberId,
        data: {
          version: 'v2',
          content: {
            type: 'text',
            text,
            buttons: options?.buttons || [],
          },
        },
      };

      const res = await fetch(`${MANYCHAT_API_BASE}/sending/sendContent`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status === 'error') {
        return { ok: false, error: json.message || `HTTP ${res.status}` };
      }

      return { ok: true, messageId: json.data?.message_id || `mc_${Date.now()}` };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Extract or create subscriber with attribution
   */
  async createOrUpdateSubscriber(data: ManyChatSubscriberData): Promise<{ ok: boolean; subscriberId?: string | number; error?: string }> {
    if (!this.isConnected()) {
      return { ok: false, error: 'MANYCHAT NOT CONNECTED: Missing MANYCHAT_API_KEY' };
    }

    try {
      const res = await fetch(`${MANYCHAT_API_BASE}/subscriber/createSubscriber`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
          email: data.email,
          has_opt_in_sms: true,
          has_opt_in_email: true,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status === 'error') {
        return { ok: false, error: json.message || `HTTP ${res.status}` };
      }

      const subscriberId = json.data?.id;

      // Set attribution custom fields if present
      if (subscriberId && (data.utm_source || data.utm_campaign || data.ad_id)) {
        await this.setCustomFields(subscriberId, {
          utm_source: data.utm_source || 'manychat',
          utm_campaign: data.utm_campaign || 'social_flow',
          utm_medium: data.utm_medium || 'social',
          ad_id: data.ad_id || '',
        });
      }

      return { ok: true, subscriberId };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Set custom fields on subscriber for campaign attribution
   */
  async setCustomFields(subscriberId: string | number, fields: Record<string, string>): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      for (const [fieldName, value] of Object.entries(fields)) {
        if (!value) continue;
        await fetch(`${MANYCHAT_API_BASE}/subscriber/setCustomFieldByName`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subscriber_id: subscriberId,
            field_name: fieldName,
            field_value: value,
          }),
        }).catch(() => null);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse incoming webhook from ManyChat
   * Extracts subscriber info, conversation events, and marketing attribution
   */
  async handleWebhook(body: any, _headers: Record<string, string>): Promise<{
    handled: boolean;
    eventType?: string;
    leadData?: ManyChatSubscriberData;
    error?: string;
  }> {
    try {
      const eventType = body.type || body.event || 'subscriber_event';
      const subscriber = body.subscriber || body.data || body;

      const customFields = subscriber.custom_fields || {};
      const utmSource = customFields.utm_source || subscriber.utm_source || 'manychat';
      const utmCampaign = customFields.utm_campaign || subscriber.utm_campaign;
      const utmMedium = customFields.utm_medium || subscriber.utm_medium;
      const adId = customFields.ad_id || subscriber.ad_id;

      const leadData: ManyChatSubscriberData = {
        id: subscriber.id,
        first_name: subscriber.first_name,
        last_name: subscriber.last_name,
        name: subscriber.name || `${subscriber.first_name || ''} ${subscriber.last_name || ''}`.trim(),
        email: subscriber.email,
        phone: subscriber.phone,
        status: subscriber.status,
        last_interaction: subscriber.last_interaction,
        custom_fields: customFields,
        tags: subscriber.tags || [],
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        utm_medium: utmMedium,
        ad_id: adId,
      };

      return {
        handled: true,
        eventType,
        leadData,
      };
    } catch (err: any) {
      return { handled: false, error: err.message };
    }
  }
}
