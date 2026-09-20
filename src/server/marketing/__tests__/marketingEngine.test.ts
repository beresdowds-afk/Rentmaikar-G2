import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarketingEngineServer } from '../marketingEngineServer';
import { GoogleAdsAdapter } from '../googleAdsAdapter';
import { TikTokAdsAdapter } from '../tiktokAdsAdapter';
import { LinkedInAdsAdapter } from '../linkedinAdsAdapter';

describe('RentMaikar Marketing Engine - Cross-Platform Adapters', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear out credentials for clean isolation
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;
    delete process.env.TIKTOK_ACCESS_TOKEN;
    delete process.env.TIKTOK_ADVERTISER_ID;
    delete process.env.LINKEDIN_ACCESS_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('MarketingEngineServer Status & Error Boundary', () => {
    it('accurately reports not_connected status for all platforms when unconfigured', async () => {
      const server = new MarketingEngineServer();
      const statuses = await server.getAllProviderStatuses();

      expect(statuses).toHaveLength(4);
      const platforms = statuses.map(s => s.platform);
      expect(platforms).toContain('meta');
      expect(platforms).toContain('google');
      expect(platforms).toContain('tiktok');
      expect(platforms).toContain('linkedin');

      statuses.forEach(status => {
        expect(status.status).toBe('not_connected');
        expect(status.apiStatus.toLowerCase()).toContain('missing');
        expect(status.capabilities.length).toBeGreaterThan(0);
      });
    });

    it('rejects campaign creation if provider is not connected and does not fake success', async () => {
      const server = new MarketingEngineServer();
      const res = await server.createCampaign('tiktok', {
        name: 'Summer Lagos Fleet Promo',
        objective: 'traffic',
        budgetAmount: 500,
        currency: 'USD',
        region: 'lagos',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('NOT CONNECTED');
    });

    it('returns normalized reporting metrics across all providers', async () => {
      const server = new MarketingEngineServer();
      const reporting = await server.syncAndAggregateReporting();

      expect(reporting).toBeDefined();
      expect(reporting.total).toBeDefined();

      const { total } = reporting;
      expect(typeof total.impressions).toBe('number');
      expect(typeof total.clicks).toBe('number');
      expect(typeof total.spend).toBe('number');
      expect(typeof total.leads).toBe('number');
      expect(typeof total.conversions).toBe('number');
      expect(typeof total.costPerLead).toBe('number');
      expect(typeof total.costPerConversion).toBe('number');
      expect(typeof total.ctr).toBe('number');
      expect(typeof total.cpc).toBe('number');
    });
  });

  describe('GoogleAdsAdapter', () => {
    it('generates a valid OAuth authorization URL with adwords scopes', () => {
      process.env.GOOGLE_ADS_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

      const adapter = new GoogleAdsAdapter();
      const authUrl = adapter.getAuthorizationUrl('https://app.rentmaikar.com/auth/callback', 'tenant-state-123');

      expect(authUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(authUrl).toContain('client_id=test-client-id.apps.googleusercontent.com');
      expect(authUrl).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadwords');
      expect(authUrl).toContain('state=tenant-state-123');
      expect(authUrl).toContain('redirect_uri=https%3A%2F%2Fapp.rentmaikar.com%2Fauth%2Fcallback');
    });

    it('reports not_connected when developer token is missing', async () => {
      const adapter = new GoogleAdsAdapter();
      const status = await adapter.getStatus();

      expect(status.status).toBe('not_connected');
      expect(status.apiStatus.toLowerCase()).toContain('missing');
    });
  });

  describe('TikTokAdsAdapter', () => {
    it('reports not_connected when access token is missing', async () => {
      const adapter = new TikTokAdsAdapter();
      const status = await adapter.getStatus();

      expect(status.status).toBe('not_connected');
      expect(status.apiStatus.toLowerCase()).toContain('missing');
    });

    it('safely handles conversion dispatch when disconnected without crashing', async () => {
      const adapter = new TikTokAdsAdapter();
      const res = await adapter.sendConversionEvent({
        eventId: 'evt-1234',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        user: { email: 'renter@example.com' },
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('NOT CONNECTED');
    });
  });

  describe('LinkedInAdsAdapter', () => {
    it('generates an OAuth URL containing required LinkedIn Ads scopes', () => {
      process.env.LINKEDIN_CLIENT_ID = 'linkedin-client-xyz';

      const adapter = new LinkedInAdsAdapter();
      const authUrl = adapter.getAuthorizationUrl('https://app.rentmaikar.com/auth/callback', 'linkedin-state-456');

      expect(authUrl).toContain('linkedin.com/oauth/v2/authorization');
      expect(authUrl).toContain('client_id=linkedin-client-xyz');
      expect(authUrl).toContain('rw_ads');
      expect(authUrl).toContain('state=linkedin-state-456');
    });

    it('safely returns error on conversion dispatch when disconnected without faking success', async () => {
      const adapter = new LinkedInAdsAdapter();
      const res = await adapter.sendConversionEvent({
        eventId: 'conv-5678',
        eventName: 'SIGN_UP',
        eventTime: Math.floor(Date.now() / 1000),
        user: { email: 'corporate@rentmaikar.com' },
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('NOT CONNECTED');
    });
  });
});
