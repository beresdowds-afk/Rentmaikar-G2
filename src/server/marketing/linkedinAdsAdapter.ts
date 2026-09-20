/**
 * LinkedIn Ads Adapter (LinkedIn Marketing Developer Platform REST API)
 * Server-side only. Protects LinkedIn client secrets and access tokens.
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

const LINKEDIN_REST_BASE = 'https://api.linkedin.com/rest';
const LINKEDIN_OAUTH_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';

export class LinkedInAdsAdapter implements IAdPlatformAdapter {
  readonly platform = 'linkedin' as const;

  private getCredentials() {
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
    const adAccountId = process.env.LINKEDIN_AD_ACCOUNT_ID;
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    return {
      accessToken,
      adAccountId: adAccountId ? (adAccountId.startsWith('urn:li:sponsoredAccount:') ? adAccountId : `urn:li:sponsoredAccount:${adAccountId}`) : null,
      clientId,
      clientSecret,
      isConnected: Boolean(accessToken && adAccountId),
    };
  }

  private sha256(val: string | undefined): string | undefined {
    if (!val) return undefined;
    return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
  }

  getAuthorizationUrl(redirectUri: string, state: string): string {
    const creds = this.getCredentials();
    if (!creds.clientId) {
      throw new Error('LINKEDIN_CLIENT_ID is not configured');
    }

    const url = new URL(LINKEDIN_AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'rw_ads r_ads_reporting');

    return url.toString();
  }

  async exchangeAuthorizationCode(code: string, redirectUri: string): Promise<{ accessToken?: string; expiresIn?: number; error?: string }> {
    const creds = this.getCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      return { error: 'LinkedIn OAuth credentials missing' };
    }

    try {
      const res = await fetch(LINKEDIN_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.error_description || 'LinkedIn OAuth exchange failed' };
      }

      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  async getStatus(): Promise<ProviderStatusInfo> {
    const creds = this.getCredentials();

    if (!creds.isConnected || !creds.accessToken || !creds.adAccountId) {
      return {
        platform: 'linkedin',
        displayName: 'LinkedIn Ads',
        status: 'not_connected',
        accountId: creds.adAccountId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Credentials not configured (LINKEDIN_ACCESS_TOKEN or LINKEDIN_AD_ACCOUNT_ID missing)',
        capabilities: ['Sponsored Content', 'Lead Gen Forms', 'Conversions API', 'B2B Audience Targeting'],
      };
    }

    try {
      // Query account information
      const accountUrnEncoded = encodeURIComponent(creds.adAccountId);
      const res = await fetch(`${LINKEDIN_REST_BASE}/adAccounts/${accountUrnEncoded}`, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = errorData?.message || `HTTP ${res.status}`;
        const isExpired = res.status === 401;

        return {
          platform: 'linkedin',
          displayName: 'LinkedIn Ads',
          status: isExpired ? 'expired' : 'error',
          accountId: creds.adAccountId,
          accountName: null,
          lastSynchronized: null,
          apiStatus: isExpired ? 'LinkedIn OAuth token expired' : `LinkedIn API Error: ${message}`,
          error: message,
          capabilities: ['LinkedIn Ads'],
        };
      }

      const data = await res.json();

      return {
        platform: 'linkedin',
        displayName: 'LinkedIn Ads',
        status: 'connected',
        accountId: creds.adAccountId,
        accountName: data.name || `LinkedIn Sponsored Account (${creds.adAccountId})`,
        lastSynchronized: new Date().toISOString(),
        apiStatus: `Connected (${data.currency || 'USD'} / ${data.status || 'ACTIVE'})`,
        capabilities: ['Sponsored Content', 'Sponsored InMail', 'Lead Gen Forms', 'Conversions API', 'Matched Audiences'],
      };
    } catch (e: any) {
      return {
        platform: 'linkedin',
        displayName: 'LinkedIn Ads',
        status: 'error',
        accountId: creds.adAccountId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Network / Connection failure',
        error: e.message,
        capabilities: ['LinkedIn Ads'],
      };
    }
  }

  async createCampaign(params: CreateCampaignParams): Promise<{ ok: boolean; externalId?: string; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken || !creds.adAccountId) {
      return { ok: false, error: 'NOT CONNECTED: LinkedIn Ads credentials are not configured.' };
    }

    try {
      const objectiveMap: Record<string, string> = {
        awareness: 'BRAND_AWARENESS',
        traffic: 'WEBSITE_VISITS',
        leads: 'LEAD_GENERATION',
        conversions: 'WEBSITE_CONVERSIONS',
        app_installs: 'JOB_APPLY',
      };

      const objective = objectiveMap[params.objective] || 'WEBSITE_VISITS';

      const body = {
        account: creds.adAccountId,
        name: `RentMaikar - ${params.name}`,
        status: 'PAUSED', // Always safely paused upon creation
        type: 'TEXT_AD',
        costType: 'CPC',
        dailyBudget: {
          amount: String(params.budgetAmount || 25),
          currencyCode: params.currency || 'USD',
        },
        objectiveType: objective,
        runSchedule: {
          start: Date.now(),
        },
      };

      const res = await fetch(`${LINKEDIN_REST_BASE}/adCampaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data?.message || 'LinkedIn campaign creation failed', raw: data };
      }

      const campaignUrn = res.headers.get('x-restli-id') || data.id;

      return { ok: true, externalId: campaignUrn, raw: data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async updateCampaign(externalId: string, params: UpdateCampaignParams): Promise<{ ok: boolean; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken) {
      return { ok: false, error: 'NOT CONNECTED: LinkedIn credentials missing.' };
    }

    try {
      const patch: Record<string, any> = {};
      if (params.name) patch.name = params.name;
      if (params.status) {
        patch.status = params.status === 'active' ? 'ACTIVE' : params.status === 'archived' ? 'ARCHIVED' : 'PAUSED';
      }

      const encodedId = encodeURIComponent(externalId);
      const res = await fetch(`${LINKEDIN_REST_BASE}/adCampaigns/${encodedId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
          'X-RestLi-Method': 'PARTIAL_UPDATE',
        },
        body: JSON.stringify({ patch: { $set: patch } }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return { ok: false, error: errorData?.message || 'LinkedIn campaign update failed' };
      }

      return { ok: true };
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
    return this.createCampaign({
      name: newName,
      objective: 'traffic',
      budgetType: 'daily',
      budgetAmount: 25,
      currency: 'USD',
      region: 'all',
    });
  }

  async fetchReporting(dateRange?: { startDate: string; endDate: string }): Promise<NormalizedMetrics[]> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken || !creds.adAccountId) {
      return [];
    }

    try {
      const url = new URL(`${LINKEDIN_REST_BASE}/adAnalytics`);
      url.searchParams.set('q', 'analytics');
      url.searchParams.set('pivot', 'CAMPAIGN');
      url.searchParams.set('dateRange.start.day', '1');
      url.searchParams.set('dateRange.start.month', '1');
      url.searchParams.set('dateRange.start.year', '2026');
      url.searchParams.set('timeGranularity', 'ALL');
      url.searchParams.set('accounts[0]', creds.adAccountId);
      url.searchParams.set('fields', 'impressions,clicks,costInLocalCurrency,conversionValueInLocalCurrency,externalWebsiteConversions,oneClickLeads');

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (!res.ok) {
        console.warn('[LinkedInAdsAdapter] Report fetch failed:', await res.text());
        return [];
      }

      const data = await res.json();
      const elements = data.elements || [];

      return elements.map((item: any) => {
        const impressions = Number(item.impressions || 0);
        const clicks = Number(item.clicks || 0);
        const spend = Number(item.costInLocalCurrency || 0);
        const conversions = Number(item.externalWebsiteConversions || 0);
        const leads = Number(item.oneClickLeads || conversions);

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
            pivotValue: item.pivotValue,
          },
        };
      });
    } catch (e: any) {
      console.warn('[LinkedInAdsAdapter] fetchReporting error:', e.message);
      return [];
    }
  }

  async sendConversionEvent(payload: ConversionEventPayload): Promise<{ ok: boolean; responseId?: string; error?: string }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.accessToken) {
      return { ok: false, error: 'NOT CONNECTED: LinkedIn credentials missing for conversions.' };
    }

    try {
      const conversionRuleId = process.env.LINKEDIN_CONVERSION_RULE_ID;
      if (!conversionRuleId) {
        return { ok: false, error: 'LINKEDIN_CONVERSION_RULE_ID not configured.' };
      }

      const res = await fetch(`${LINKEDIN_REST_BASE}/conversionEvents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          conversion: conversionRuleId,
          conversionHappenedAt: payload.eventTime * 1000,
          user: {
            userIds: [
              ...(payload.user.email ? [{ idType: 'SHA256_EMAIL', idValue: this.sha256(payload.user.email) }] : []),
            ],
          },
          eventValue: {
            currencyCode: payload.customData?.currency || 'USD',
            amount: String(payload.customData?.value || 0),
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err?.message || 'LinkedIn conversion upload failed' };
      }

      return { ok: true, responseId: payload.eventId };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async handleWebhook(body: any, _headers: Record<string, string>): Promise<{ handled: boolean; eventType?: string; error?: string }> {
    return {
      handled: true,
      eventType: body?.eventType || 'linkedin_notification',
    };
  }
}
