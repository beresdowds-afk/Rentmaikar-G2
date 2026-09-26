/**
 * Google Ads Adapter (Google Ads API, OAuth 2.0, Offline/Enhanced Conversions, GAQL Reporting)
 * Server-side only. Protects Google Ads client secrets and refresh tokens.
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

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ADS_API_VERSION = 'v16';
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

export class GoogleAdsAdapter implements IAdPlatformAdapter {
  readonly platform = 'google' as const;

  private getCredentials() {
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '');

    return {
      developerToken,
      clientId,
      clientSecret,
      refreshToken,
      customerId: customerId || null,
      loginCustomerId: loginCustomerId || null,
      isConnected: Boolean(developerToken && clientId && clientSecret && refreshToken && customerId),
    };
  }

  private sha256(val: string | undefined): string | undefined {
    if (!val) return undefined;
    return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
  }

  /**
   * Generates OAuth 2.0 URL for Admin to connect Google Ads
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const creds = this.getCredentials();
    if (!creds.clientId) {
      throw new Error('GOOGLE_ADS_CLIENT_ID is not configured');
    }

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);

    return url.toString();
  }

  /**
   * Exchanges authorization code for tokens
   */
  async exchangeAuthorizationCode(code: string, redirectUri: string): Promise<{ refreshToken?: string; accessToken?: string; error?: string }> {
    const creds = this.getCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      return { error: 'Google OAuth Client ID / Secret missing' };
    }

    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.error_description || data.error || 'Token exchange failed' };
      }

      return {
        refreshToken: data.refresh_token,
        accessToken: data.access_token,
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  /**
   * Obtains a short-lived access token using the stored refresh token
   */
  private async getFreshAccessToken(): Promise<string | null> {
    const creds = this.getCredentials();
    if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
      return null;
    }

    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: creds.refreshToken,
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          grant_type: 'refresh_token',
        }),
      });

      if (!res.ok) {
        console.warn('[GoogleAdsAdapter] Token refresh failed:', await res.text());
        return null;
      }

      const data = await res.json();
      return data.access_token || null;
    } catch (e: any) {
      console.warn('[GoogleAdsAdapter] Refresh error:', e.message);
      return null;
    }
  }

  async getStatus(): Promise<ProviderStatusInfo> {
    const creds = this.getCredentials();

    if (!creds.isConnected || !creds.customerId) {
      return {
        platform: 'google',
        displayName: 'Google Ads',
        status: 'not_connected',
        accountId: creds.customerId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Credentials not configured (GOOGLE_ADS_DEVELOPER_TOKEN or refresh token missing)',
        capabilities: ['Search Campaigns', 'Performance Max', 'Enhanced Conversions', 'Offline Attribution', 'GAQL Reporting'],
      };
    }

    const accessToken = await this.getFreshAccessToken();
    if (!accessToken) {
      return {
        platform: 'google',
        displayName: 'Google Ads',
        status: 'expired',
        accountId: creds.customerId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'OAuth refresh token expired or invalid credentials',
        error: 'Unable to refresh Google access token',
        capabilities: ['Google Ads API'],
      };
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken!,
      };
      if (creds.loginCustomerId) {
        headers['login-customer-id'] = creds.loginCustomerId;
      }

      // Query Google Ads customer account info
      const res = await fetch(`${GOOGLE_ADS_BASE}/customers/${creds.customerId}`, {
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = errorData?.error?.message || `HTTP ${res.status}`;
        return {
          platform: 'google',
          displayName: 'Google Ads',
          status: 'error',
          accountId: creds.customerId,
          accountName: null,
          lastSynchronized: null,
          apiStatus: `Google Ads API Error: ${message}`,
          error: message,
          capabilities: ['Google Ads API'],
        };
      }

      const customer = await res.json();

      return {
        platform: 'google',
        displayName: 'Google Ads',
        status: 'connected',
        accountId: creds.customerId,
        accountName: customer.descriptiveName || `Google Ads Customer (${creds.customerId})`,
        lastSynchronized: new Date().toISOString(),
        apiStatus: `Connected (${customer.currencyCode || 'USD'} / ${customer.timeZone || 'UTC'})`,
        capabilities: ['Search Campaigns', 'Performance Max', 'Enhanced Conversions', 'Offline Conversions', 'GAQL Reporting', 'Smart Bidding'],
      };
    } catch (e: any) {
      return {
        platform: 'google',
        displayName: 'Google Ads',
        status: 'error',
        accountId: creds.customerId,
        accountName: null,
        lastSynchronized: null,
        apiStatus: 'Network or API failure',
        error: e.message,
        capabilities: ['Google Ads API'],
      };
    }
  }

  async createCampaign(params: CreateCampaignParams): Promise<{ ok: boolean; externalId?: string; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.customerId) {
      return { ok: false, error: 'NOT CONNECTED: Google Ads credentials are not configured.' };
    }

    const accessToken = await this.getFreshAccessToken();
    if (!accessToken) {
      return { ok: false, error: 'NOT CONNECTED: Google Ads authorization token expired.' };
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken!,
        'Content-Type': 'application/json',
      };
      if (creds.loginCustomerId) {
        headers['login-customer-id'] = creds.loginCustomerId;
      }

      // Step 1: Create Campaign Budget (in micros)
      const budgetAmountMicros = Math.round((params.budgetAmount || 10) * 1_000_000);
      const budgetRes = await fetch(`${GOOGLE_ADS_BASE}/customers/${creds.customerId}/campaignBudgets:mutate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operations: [
            {
              create: {
                name: `RentMaikar Budget ${Date.now()}`,
                amountMicros: String(budgetAmountMicros),
                deliveryMethod: 'STANDARD',
              },
            },
          ],
        }),
      });

      const budgetData = await budgetRes.json();
      if (!budgetRes.ok) {
        return { ok: false, error: budgetData?.error?.message || 'Failed to create Google Campaign Budget', raw: budgetData };
      }

      const budgetResourceName = budgetData?.results?.[0]?.resourceName;

      // Step 2: Create Campaign
      const campaignRes = await fetch(`${GOOGLE_ADS_BASE}/customers/${creds.customerId}/campaigns:mutate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operations: [
            {
              create: {
                name: `RentMaikar - ${params.name}`,
                status: 'PAUSED', // Always create safely in PAUSED status
                advertisingChannelType: 'SEARCH',
                campaignBudget: budgetResourceName,
                networkSettings: {
                  targetGoogleSearch: true,
                  targetSearchNetwork: true,
                  targetContentNetwork: false,
                },
              },
            },
          ],
        }),
      });

      const campaignData = await campaignRes.json();
      if (!campaignRes.ok) {
        return { ok: false, error: campaignData?.error?.message || 'Failed to create Google Campaign', raw: campaignData };
      }

      const resourceName = campaignData?.results?.[0]?.resourceName;
      // Extract numeric ID from resourceName: "customers/123/campaigns/456"
      const parts = resourceName?.split('/');
      const campaignId = parts?.[parts.length - 1] || resourceName;

      return { ok: true, externalId: campaignId, raw: campaignData };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async updateCampaign(externalId: string, params: UpdateCampaignParams): Promise<{ ok: boolean; error?: string; raw?: any }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.customerId) {
      return { ok: false, error: 'NOT CONNECTED: Google Ads credentials missing.' };
    }

    const accessToken = await this.getFreshAccessToken();
    if (!accessToken) {
      return { ok: false, error: 'NOT CONNECTED: Google Ads token expired.' };
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken!,
        'Content-Type': 'application/json',
      };
      if (creds.loginCustomerId) {
        headers['login-customer-id'] = creds.loginCustomerId;
      }

      const updateMaskFields: string[] = [];
      const campaignUpdate: Record<string, any> = {
        resourceName: `customers/${creds.customerId}/campaigns/${externalId}`,
      };

      if (params.name) {
        campaignUpdate.name = params.name;
        updateMaskFields.push('name');
      }

      if (params.status) {
        campaignUpdate.status = params.status === 'active' ? 'ENABLED' : params.status === 'archived' ? 'REMOVED' : 'PAUSED';
        updateMaskFields.push('status');
      }

      if (updateMaskFields.length === 0) {
        return { ok: true };
      }

      const res = await fetch(`${GOOGLE_ADS_BASE}/customers/${creds.customerId}/campaigns:mutate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          operations: [
            {
              update: campaignUpdate,
              updateMask: updateMaskFields.join(','),
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data?.error?.message || 'Google Ads campaign update failed', raw: data };
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
    return this.createCampaign({
      name: newName,
      objective: 'traffic',
      budgetType: 'daily',
      budgetAmount: 20,
      currency: 'USD',
      region: 'all',
    });
  }

  async fetchReporting(dateRange?: { startDate: string; endDate: string }): Promise<NormalizedMetrics[]> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.customerId) {
      return [];
    }

    const accessToken = await this.getFreshAccessToken();
    if (!accessToken) return [];

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken!,
        'Content-Type': 'application/json',
      };
      if (creds.loginCustomerId) {
        headers['login-customer-id'] = creds.loginCustomerId;
      }

      const query = `
        SELECT 
          campaign.id, 
          campaign.name, 
          metrics.impressions, 
          metrics.clicks, 
          metrics.cost_micros, 
          metrics.conversions
        FROM campaign 
        WHERE campaign.status != 'REMOVED'
        LIMIT 50
      `;

      const res = await fetch(`${GOOGLE_ADS_BASE}/customers/${creds.customerId}/googleAds:search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        console.warn('[GoogleAdsAdapter] Reporting query failed:', await res.text());
        return [];
      }

      const data = await res.json();
      const results = data.results || [];

      return results.map((row: any) => {
        const impressions = Number(row.metrics?.impressions || 0);
        const clicks = Number(row.metrics?.clicks || 0);
        const costMicros = Number(row.metrics?.costMicros || 0);
        const spend = Number((costMicros / 1_000_000).toFixed(2));
        const conversions = Number(row.metrics?.conversions || 0);
        const leads = conversions; // In search ads, conversions typically reflect inquiries / leads

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
            googleCampaignId: row.campaign?.id,
            googleCampaignName: row.campaign?.name,
          },
        };
      });
    } catch (e: any) {
      console.warn('[GoogleAdsAdapter] fetchReporting error:', e.message);
      return [];
    }
  }

  /**
   * Upload Enhanced Conversions / Click Conversions
   */
  async sendConversionEvent(payload: ConversionEventPayload): Promise<{ ok: boolean; responseId?: string; error?: string }> {
    const creds = this.getCredentials();
    if (!creds.isConnected || !creds.customerId) {
      return { ok: false, error: 'NOT CONNECTED: Google Ads account missing for enhanced conversions.' };
    }

    const accessToken = await this.getFreshAccessToken();
    if (!accessToken) {
      return { ok: false, error: 'NOT CONNECTED: Google Ads token refresh failed.' };
    }

    const conversionActionResource = process.env.GOOGLE_ADS_CONVERSION_ACTION || `customers/${creds.customerId}/conversionActions/default`;

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken!,
        'Content-Type': 'application/json',
      };
      if (creds.loginCustomerId) {
        headers['login-customer-id'] = creds.loginCustomerId;
      }

      // Prepare conversion record with hashed identifier for Enhanced Conversions
      const conversion: Record<string, any> = {
        conversionAction: conversionActionResource,
        conversionDateTime: new Date(payload.eventTime * 1000).toISOString().replace('T', ' ').substring(0, 19) + '+00:00',
        conversionValue: payload.customData?.value || 0,
        currencyCode: payload.customData?.currency || 'USD',
        orderId: payload.customData?.orderId || payload.eventId,
      };

      if (payload.user.gclid) {
        conversion.gclid = payload.user.gclid;
      }

      // Enhanced conversion user identifiers (hashed)
      const userIdentifiers: any[] = [];
      if (payload.user.email) {
        userIdentifiers.push({ hashedEmail: this.sha256(payload.user.email) });
      }
      if (payload.user.phone) {
        userIdentifiers.push({ hashedPhoneNumber: this.sha256(payload.user.phone) });
      }

      if (userIdentifiers.length > 0) {
        conversion.userIdentifiers = userIdentifiers;
      }

      const res = await fetch(`${GOOGLE_ADS_BASE}/customers/${creds.customerId}:uploadClickConversions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversions: [conversion],
          partialFailure: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data?.error?.message || 'Google conversion upload failed' };
      }

      return { ok: true, responseId: payload.eventId };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async handleWebhook(body: any, _headers: Record<string, string>): Promise<{ handled: boolean; eventType?: string; error?: string }> {
    return {
      handled: true,
      eventType: body?.eventType || 'google_ads_notification',
    };
  }
}
