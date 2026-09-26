/**
 * TikTok Ads Adapter (TikTok Marketing API v1.3 & TikTok Events API)
 * Server-side only. Protects all TikTok advertiser tokens and app secrets.
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

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

export class TikTokAdsAdapter implements IAdPlatformAdapter {
  readonly platform = 'tiktok' as const;

  private getCredentials() {
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
    const advertiserId = process.env.TIKTOK_ADVERTISER_ID;
    const appId = process.env.TIKTOK_APP_ID;
    const appSecret = process.env.TIKTOK_SECRET || process.env.TIKTOK_APP_SECRET;
    const pixelCode = process.env.TIKTOK_PIXEL_CODE;

    return {
      accessToken,
      advertiserId,
      appId,
      appSecret,
      pixelCode,
      isConnected: Boolean(accessToken && advertiserId),
    };
  }

  private sha256(val: string | undefined): string | undefined {
    if (!val) return undefined;
    return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
  }

  async getStatus(): Promise<ProviderStatusInfo> {
    const creds = this.getCredentials();

    if (!creds.isConnected || !creds.accessToken || !creds.advertiserId) {
      return {
        platform: 'tiktok',
        displayName: 'TikTok Ads',
        status: 'not_connected',
        accountId: creds.advertiserId || null,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Credentials not configured (TIKTOK_ACCESS_TOKEN or TIKTOK_ADVERTISER_ID missing)',
        capabilities: ['TikTok Marketing API', 'Ad Groups', 'Spark Ads', 'Events API', 'Custom Audiences'],
      };
    }

    try {
      // Query advertiser info
      const url = new URL(`${TIKTOK_API_BASE}/advertiser/info/`);
      url.searchParams.set('advertiser_ids', JSON.stringify([creds.advertiserId]));

      const res = await fetch(url.toString(), {
        headers: { 'Access-Token': creds.accessToken },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = errorData?.message || `HTTP ${res.status}`;
        return {
          platform: 'tiktok',
          displayName: 'TikTok Ads',
          status: 'error',
          accountId: creds.advertiserId,
          accountName: null,
          lastSynchronized: null,
          apiStatus: `TikTok API Error: ${message}`,
          error: message,
          capabilities: ['TikTok Ads'],
        };
      }

      const data = await res.json();
      if (data.code !== 0) {
        return {
          platform: 'tiktok',
          displayName: 'TikTok Ads',
          status: data.code === 40105 ? 'expired' : 'error',
          accountId: creds.advertiserId,
          accountName: null,
          lastSynchronized: null,
          apiStatus: data.message || `Code ${data.code}`,
          error: data.message,
          capabilities: ['TikTok Ads'],
        };
      }

      const advInfo = data.data?.list?.[0];

      return {
        platform: 'tiktok',
        displayName: 'TikTok Ads',
        status: 'connected',
        accountId: creds.advertiserId,
        accountName: advInfo?.name || `TikTok Advertiser (${creds.advertiserId})`,
        lastSynchronized: new Date().toISOString(),
        apiStatus: `Connected (${advInfo?.currency || 'USD'} / ${advInfo?.timezone || 'UTC'})`,
        capabilities: ['Campaigns', 'Ad Groups', 'TikTok Events API', 'Spark Ads', 'Lead Generation', 'App Installs'],
      };
    } catch (e: any) {
      return {
        platform: 'tiktok',
        displayName: 'TikTok Ads',
        status: 'error',
        accountId: creds.advertiserId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Network / Connection failure',
        error: e.message,
        capabilities: ['TikTok Ads'],
      };
    }
  }

  async createCampaign(params: CreateCampaignParams): Promise<{ ok: boolean; externalId?: string; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken || !creds.advertiserId) {
      return { ok: false, error: 'NOT CONNECTED: TikTok Ads credentials are not configured.' };
    }

    try {
      const objectiveMap: Record<string, string> = {
        awareness: 'REACH',
        traffic: 'TRAFFIC',
        leads: 'LEAD_GENERATION',
        conversions: 'CONVERSIONS',
        app_installs: 'APP_PROMOTION',
      };

      const tiktokObjective = objectiveMap[params.objective] || 'TRAFFIC';

      const body: Record<string, any> = {
        advertiser_id: creds.advertiserId,
        campaign_name: `RentMaikar - ${params.name}`,
        objective_type: tiktokObjective,
        budget_mode: params.budgetType === 'daily' ? 'BUDGET_MODE_DAY' : 'BUDGET_MODE_TOTAL',
        budget: params.budgetAmount || 50, // Minimum daily budget applies on TikTok
        operation_status: 'DISABLE', // Always safely paused on creation
      };

      const res = await fetch(`${TIKTOK_API_BASE}/campaign/create/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': creds.accessToken,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.code !== 0) {
        return { ok: false, error: data?.message || 'TikTok campaign creation failed', raw: data };
      }

      return { ok: true, externalId: String(data.data?.campaign_id), raw: data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async updateCampaign(externalId: string, params: UpdateCampaignParams): Promise<{ ok: boolean; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken || !creds.advertiserId) {
      return { ok: false, error: 'NOT CONNECTED: TikTok credentials missing.' };
    }

    try {
      const body: Record<string, any> = {
        advertiser_id: creds.advertiserId,
        campaign_id: externalId,
      };

      if (params.name) body.campaign_name = params.name;
      if (params.budgetAmount) body.budget = params.budgetAmount;

      const res = await fetch(`${TIKTOK_API_BASE}/campaign/update/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': creds.accessToken,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.code !== 0) {
        return { ok: false, error: data?.message || 'TikTok campaign update failed', raw: data };
      }

      if (params.status) {
        await this.setCampaignStatus(externalId, params.status);
      }

      return { ok: true, raw: data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async setCampaignStatus(externalId: string, status: 'active' | 'paused' | 'archived'): Promise<{ ok: boolean; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken || !creds.advertiserId) {
      return { ok: false, error: 'NOT CONNECTED: TikTok credentials missing.' };
    }

    try {
      const optStatus = status === 'active' ? 'ENABLE' : status === 'archived' ? 'DELETE' : 'DISABLE';
      const res = await fetch(`${TIKTOK_API_BASE}/campaign/status/update/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': creds.accessToken,
        },
        body: JSON.stringify({
          advertiser_id: creds.advertiserId,
          campaign_ids: [externalId],
          opt_status: optStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.code !== 0) {
        return { ok: false, error: data?.message || 'TikTok status update failed', raw: data };
      }

      return { ok: true, raw: data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async archiveCampaign(externalId: string): Promise<{ ok: boolean; error?: string; raw?: any }> {
    return this.setCampaignStatus(externalId, 'archived');
  }

  async duplicateCampaign(externalId: string, newName: string): Promise<{ ok: boolean; newExternalId?: string; error?: string; raw?: any }> {
    return this.createCampaign({
      name: newName,
      objective: 'traffic',
      budgetType: 'daily',
      budgetAmount: 50,
      currency: 'USD',
      region: 'all',
    });
  }

  async fetchReporting(dateRange?: { startDate: string; endDate: string }): Promise<NormalizedMetrics[]> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken || !creds.advertiserId) {
      return [];
    }

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const startDate = dateRange?.startDate || thirtyDaysAgo.toISOString().split('T')[0];
      const endDate = dateRange?.endDate || now.toISOString().split('T')[0];

      const url = new URL(`${TIKTOK_API_BASE}/report/integrated/get/`);
      url.searchParams.set('advertiser_id', creds.advertiserId);
      url.searchParams.set('report_type', 'BASIC');
      url.searchParams.set('data_level', 'AUCTION_CAMPAIGN');
      url.searchParams.set('dimensions', JSON.stringify(['campaign_id']));
      url.searchParams.set('metrics', JSON.stringify(['campaign_name', 'spend', 'impressions', 'clicks', 'conversion']));
      url.searchParams.set('start_date', startDate);
      url.searchParams.set('end_date', endDate);

      const res = await fetch(url.toString(), {
        headers: { 'Access-Token': creds.accessToken },
      });

      if (!res.ok) {
        console.warn('[TikTokAdsAdapter] Report fetch failed:', await res.text());
        return [];
      }

      const data = await res.json();
      const list = data.data?.list || [];

      return list.map((item: any) => {
        const metrics = item.metrics || {};
        const impressions = Number(metrics.impressions || 0);
        const clicks = Number(metrics.clicks || 0);
        const spend = Number(metrics.spend || 0);
        const conversions = Number(metrics.conversion || 0);
        const leads = conversions;

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
          providerSpecific: {
            tiktokCampaignId: item.dimensions?.campaign_id,
            tiktokCampaignName: metrics.campaign_name,
          },
        };
      });
    } catch (e: any) {
      console.warn('[TikTokAdsAdapter] fetchReporting error:', e.message);
      return [];
    }
  }

  /**
   * TikTok Events API v1.3
   */
  async sendConversionEvent(payload: ConversionEventPayload): Promise<{ ok: boolean; responseId?: string; error?: string }> {
    const creds = this.getCredentials();
    if (!creds.pixelCode || !creds.accessToken) {
      return { ok: false, error: 'NOT CONNECTED: TikTok Pixel Code or Access Token missing.' };
    }

    try {
      const eventMap: Record<string, string> = {
        PAGE_VIEW: 'ViewContent',
        LANDING_PAGE_VIEW: 'ViewContent',
        ACCOUNT_CREATED: 'CompleteRegistration',
        LEAD_CREATED: 'SubmitForm',
        KYC_COMPLETED: 'Contact',
        PAYMENT_STARTED: 'InitiateCheckout',
        PAYMENT_COMPLETED: 'PlaceAnOrder',
        RENTAL_COMPLETED: 'Subscribe',
      };

      const tiktokEvent = eventMap[payload.eventName] || 'Custom';

      const eventData: Record<string, any> = {
        event: tiktokEvent,
        event_id: payload.eventId,
        timestamp: new Date(payload.eventTime * 1000).toISOString(),
        context: {
          user: {
            email: this.sha256(payload.user.email),
            phone_number: this.sha256(payload.user.phone),
            ttclid: payload.user.ttclid,
            ip: payload.user.clientIpAddress,
            user_agent: payload.user.clientUserAgent,
          },
          page: {
            url: payload.customData?.pageUrl || 'https://rentmaikar.com',
          },
        },
        properties: {
          currency: payload.customData?.currency || 'USD',
          value: payload.customData?.value || 0,
        },
      };

      const res = await fetch(`${TIKTOK_API_BASE}/event/track/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': creds.accessToken,
        },
        body: JSON.stringify({
          event_source: 'web',
          event_source_id: creds.pixelCode,
          data: [eventData],
        }),
      });

      const data = await res.json();
      if (!res.ok || data.code !== 0) {
        return { ok: false, error: data?.message || 'TikTok Events API call failed' };
      }

      return { ok: true, responseId: payload.eventId };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async handleWebhook(body: any, _headers: Record<string, string>): Promise<{ handled: boolean; eventType?: string; error?: string }> {
    return {
      handled: true,
      eventType: body?.event || 'tiktok_webhook',
    };
  }
}
