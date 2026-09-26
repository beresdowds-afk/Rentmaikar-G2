/**
 * Meta Adapter (Facebook & Instagram Ads, Marketing API, Conversions API, Webhooks)
 * Server-side only. Protects all Meta secrets and credentials.
 */

import crypto from 'crypto';
import { 
  IAdPlatformAdapter, 
  ProviderStatusInfo, 
  CreateCampaignParams, 
  UpdateCampaignParams, 
  NormalizedMetrics, 
  ConversionEventPayload 
} from './types';

const META_GRAPH_VERSION = 'v19.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export class MetaAdapter implements IAdPlatformAdapter {
  readonly platform = 'meta' as const;

  private getCredentials() {
    const accessToken = process.env.META_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID || process.env.FACEBOOK_AD_ACCOUNT_ID;
    const pixelId = process.env.META_PIXEL_ID || process.env.VITE_META_PIXEL_ID;
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
    const appId = process.env.META_APP_ID || process.env.VITE_META_APP_ID;

    return {
      accessToken,
      adAccountId: adAccountId ? (adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`) : null,
      pixelId,
      appSecret,
      appId,
      isConnected: Boolean(accessToken && adAccountId),
    };
  }

  private sha256(val: string | undefined): string | undefined {
    if (!val) return undefined;
    return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
  }

  async getStatus(): Promise<ProviderStatusInfo> {
    const creds = this.getCredentials();

    if (!creds.isConnected || !creds.accessToken || !creds.adAccountId) {
      return {
        platform: 'meta',
        displayName: 'Meta (Facebook & Instagram)',
        status: 'not_connected',
        accountId: creds.adAccountId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Credentials not configured (META_ACCESS_TOKEN or META_AD_ACCOUNT_ID missing)',
        capabilities: ['Meta Business Suite', 'Facebook Ads', 'Instagram Ads', 'Conversions API', 'Pixel', 'Webhooks'],
      };
    }

    try {
      // Validate token & fetch account info from Meta Graph API
      const res = await fetch(`${META_GRAPH_BASE}/${creds.adAccountId}?fields=name,account_status,currency,timezone_name`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = errorData?.error?.message || `HTTP ${res.status}`;
        const isExpired = errorData?.error?.code === 190;

        return {
          platform: 'meta',
          displayName: 'Meta (Facebook & Instagram)',
          status: isExpired ? 'expired' : 'error',
          accountId: creds.adAccountId,
          accountName: null,
          lastSynchronized: null,
          apiStatus: isExpired ? 'Access token expired' : `API Error: ${message}`,
          error: message,
          capabilities: ['Facebook Ads', 'Instagram Ads', 'Conversions API'],
        };
      }

      const data = await res.json();
      return {
        platform: 'meta',
        displayName: 'Meta (Facebook & Instagram)',
        status: 'connected',
        accountId: creds.adAccountId,
        accountName: data.name || 'RentMaikar Meta Ads',
        lastSynchronized: new Date().toISOString(),
        apiStatus: `Connected (${data.currency || 'USD'} / ${data.timezone_name || 'UTC'})`,
        capabilities: ['Facebook Ads', 'Instagram Ads', 'Conversions API', 'Custom Audiences', 'Ad Sets', 'Webhooks'],
      };
    } catch (e: any) {
      return {
        platform: 'meta',
        displayName: 'Meta (Facebook & Instagram)',
        status: 'error',
        accountId: creds.adAccountId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Network / Connection failure',
        error: e.message,
        capabilities: ['Facebook Ads', 'Instagram Ads'],
      };
    }
  }

  async createCampaign(params: CreateCampaignParams): Promise<{ ok: boolean; externalId?: string; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken || !creds.adAccountId) {
      return { ok: false, error: 'NOT CONNECTED: Meta credentials are not configured server-side.' };
    }

    try {
      // Map RentMaikar objective to Meta objective
      const objectiveMap: Record<string, string> = {
        awareness: 'OUTCOME_AWARENESS',
        traffic: 'OUTCOME_TRAFFIC',
        leads: 'OUTCOME_LEADS',
        conversions: 'OUTCOME_SALES',
        app_installs: 'OUTCOME_APP_PROMOTION',
      };

      const metaObjective = objectiveMap[params.objective] || 'OUTCOME_TRAFFIC';
      const body: Record<string, any> = {
        name: `RentMaikar - ${params.name}`,
        objective: metaObjective,
        status: 'PAUSED', // Always create safely as PAUSED
        special_ad_categories: ['NONE'],
      };

      if (params.budgetType === 'daily' && params.budgetAmount > 0) {
        // Meta requires daily_budget in cents
        body.daily_budget = Math.round(params.budgetAmount * 100);
      }

      const res = await fetch(`${META_GRAPH_BASE}/${creds.adAccountId}/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data?.error?.message || 'Meta campaign creation failed', raw: data };
      }

      return { ok: true, externalId: data.id, raw: data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async updateCampaign(externalId: string, params: UpdateCampaignParams): Promise<{ ok: boolean; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken) {
      return { ok: false, error: 'NOT CONNECTED: Meta credentials missing.' };
    }

    try {
      const body: Record<string, any> = {};
      if (params.name) body.name = params.name;
      if (params.status) {
        body.status = params.status === 'active' ? 'ACTIVE' : params.status === 'archived' ? 'ARCHIVED' : 'PAUSED';
      }
      if (params.budgetAmount) {
        body.daily_budget = Math.round(params.budgetAmount * 100);
      }

      const res = await fetch(`${META_GRAPH_BASE}/${externalId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data?.error?.message || 'Meta campaign update failed', raw: data };
      }

      return { ok: true, raw: data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async setCampaignStatus(externalId: string, status: 'active' | 'paused' | 'archived'): Promise<{ ok: boolean; error?: string; raw?: any }> {
    return this.updateCampaign(externalId, { status });
  }

  async archiveCampaign(externalId: string): Promise<{ ok: boolean; error?: string; raw?: any }> {
    return this.updateCampaign(externalId, { status: 'archived' });
  }

  async duplicateCampaign(externalId: string, newName: string): Promise<{ ok: boolean; newExternalId?: string; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken) {
      return { ok: false, error: 'NOT CONNECTED: Meta credentials missing.' };
    }

    try {
      // 1. Fetch original campaign
      const getRes = await fetch(`${META_GRAPH_BASE}/${externalId}?fields=name,objective,daily_budget,special_ad_categories`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });
      const original = await getRes.json();
      if (!getRes.ok) {
        return { ok: false, error: original?.error?.message || 'Failed to fetch campaign for duplication' };
      }

      // 2. Clone campaign safely
      const cloneRes = await fetch(`${META_GRAPH_BASE}/${creds.adAccountId}/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
        },
        body: JSON.stringify({
          name: newName || `${original.name} (Copy)`,
          objective: original.objective,
          daily_budget: original.daily_budget,
          special_ad_categories: original.special_ad_categories || ['NONE'],
          status: 'PAUSED',
        }),
      });

      const cloneData = await cloneRes.json();
      if (!cloneRes.ok) {
        return { ok: false, error: cloneData?.error?.message || 'Failed to clone campaign on Meta', raw: cloneData };
      }

      return { ok: true, newExternalId: cloneData.id, raw: cloneData };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async fetchReporting(dateRange?: { startDate: string; endDate: string }): Promise<NormalizedMetrics[]> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken || !creds.adAccountId) {
      return [];
    }

    try {
      const url = new URL(`${META_GRAPH_BASE}/${creds.adAccountId}/insights`);
      url.searchParams.set('fields', 'impressions,clicks,spend,actions,cost_per_action_type');
      url.searchParams.set('date_preset', 'last_30d');
      if (dateRange?.startDate && dateRange?.endDate) {
        url.searchParams.set('time_range', JSON.stringify({ since: dateRange.startDate, until: dateRange.endDate }));
      }

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });

      if (!res.ok) {
        console.warn('[MetaAdapter] Reporting fetch failed:', await res.text());
        return [];
      }

      const json = await res.json();
      const insights = json.data || [];

      return insights.map((row: any) => {
        const impressions = Number(row.impressions || 0);
        const clicks = Number(row.clicks || 0);
        const spend = Number(row.spend || 0);
        
        // Find lead and purchase/conversion actions
        const actions = row.actions || [];
        const leadAction = actions.find((a: any) => a.action_type === 'lead');
        const purchaseAction = actions.find((a: any) => a.action_type === 'purchase' || a.action_type === 'complete_registration');
        const leads = Number(leadAction?.value || 0);
        const conversions = Number(purchaseAction?.value || 0);

        return {
          impressions,
          clicks,
          spend,
          currency: 'USD',
          leads,
          conversions,
          costPerLead: leads > 0 ? Number((spend / leads).toFixed(2)) : 0,
          costPerConversion: conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0,
          ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
          cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
          providerSpecific: { meta_actions: actions },
        };
      });
    } catch (e: any) {
      console.warn('[MetaAdapter] fetchReporting error:', e.message);
      return [];
    }
  }

  async sendConversionEvent(payload: ConversionEventPayload): Promise<{ ok: boolean; responseId?: string; error?: string }> {
    const creds = this.getCredentials();
    if (!creds.pixelId || !creds.accessToken) {
      return { ok: false, error: 'NOT CONNECTED: Meta Pixel ID or Access Token missing for CAPI.' };
    }

    try {
      // Map canonical event name to standard Meta CAPI event
      const eventMap: Record<string, string> = {
        PAGE_VIEW: 'PageView',
        LANDING_PAGE_VIEW: 'ViewContent',
        ACCOUNT_CREATED: 'CompleteRegistration',
        LEAD_CREATED: 'Lead',
        KYC_COMPLETED: 'SubmitApplication',
        PAYMENT_STARTED: 'InitiateCheckout',
        PAYMENT_COMPLETED: 'Purchase',
        RENTAL_COMPLETED: 'Subscribe',
      };

      const metaEventName = eventMap[payload.eventName] || payload.eventName;

      const serverEvent: Record<string, any> = {
        event_name: metaEventName,
        event_time: payload.eventTime || Math.floor(Date.now() / 1000),
        event_id: payload.eventId,
        action_source: payload.actionSource || 'website',
        user_data: {
          em: this.sha256(payload.user.email),
          ph: this.sha256(payload.user.phone),
          fn: this.sha256(payload.user.firstName),
          ln: this.sha256(payload.user.lastName),
          client_ip_address: payload.user.clientIpAddress,
          client_user_agent: payload.user.clientUserAgent,
          fbp: payload.user.fbp,
          fbc: payload.user.fbc,
        },
      };

      if (payload.customData) {
        serverEvent.custom_data = {
          currency: payload.customData.currency || 'USD',
          value: payload.customData.value || 0,
          order_id: payload.customData.orderId,
          content_name: payload.customData.contentName,
        };
      }

      const res = await fetch(`${META_GRAPH_BASE}/${creds.pixelId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
        },
        body: JSON.stringify({
          data: [serverEvent],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data?.error?.message || 'Meta CAPI request failed' };
      }

      return { ok: true, responseId: data.fbtrace_id };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async handleWebhook(body: any, headers: Record<string, string>): Promise<{ handled: boolean; eventType?: string; error?: string }> {
    const creds = this.getCredentials();
    
    // Verify Meta X-Hub-Signature-256 if appSecret exists
    if (creds.appSecret && headers['x-hub-signature-256']) {
      const signature = headers['x-hub-signature-256'];
      const rawPayload = typeof body === 'string' ? body : JSON.stringify(body);
      const expectedSignature = `sha256=${crypto.createHmac('sha256', creds.appSecret).update(rawPayload).digest('hex')}`;
      
      if (signature !== expectedSignature) {
        return { handled: false, error: 'Invalid Meta webhook HMAC signature' };
      }
    }

    const objectType = body?.object;
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];

    return {
      handled: true,
      eventType: changes?.field || objectType || 'meta_webhook_ping',
    };
  }
}
