/**
 * RentMaikar Marketing Engine - Unified Server Abstraction
 * Isolates the rest of RentMaikar from provider-specific advertising APIs.
 */

import { MetaAdapter } from './metaAdapter';
import { GoogleAdsAdapter } from './googleAdsAdapter';
import { TikTokAdsAdapter } from './tiktokAdsAdapter';
import { LinkedInAdsAdapter } from './linkedinAdsAdapter';
import { ManyChatAdapter } from './manychatAdapter';
import { SentDmAdapter } from './sentDmAdapter';
import { TwilioAdapter } from './twilioAdapter';
import { ResendAdapter } from './resendAdapter';
import { leadService, LeadService } from './leadService';
import { 
  AdPlatform, 
  CommunicationProvider,
  IAdPlatformAdapter, 
  ProviderStatusInfo, 
  CreateCampaignParams, 
  UpdateCampaignParams, 
  NormalizedMetrics, 
  ConversionEventPayload,
  SendMessageParams,
  InitiateCallParams,
  SendEmailParams,
} from './types';

export class MarketingEngineServer {
  private adapters: Map<AdPlatform, IAdPlatformAdapter>;
  public readonly manychat: ManyChatAdapter;
  public readonly sentdm: SentDmAdapter;
  public readonly twilio: TwilioAdapter;
  public readonly resend: ResendAdapter;
  public readonly leads: LeadService;

  constructor() {
    this.adapters = new Map<AdPlatform, IAdPlatformAdapter>([
      ['meta', new MetaAdapter()],
      ['google', new GoogleAdsAdapter()],
      ['tiktok', new TikTokAdsAdapter()],
      ['linkedin', new LinkedInAdsAdapter()],
    ]);

    this.manychat = new ManyChatAdapter();
    this.sentdm = new SentDmAdapter();
    this.twilio = new TwilioAdapter();
    this.resend = new ResendAdapter();
    this.leads = leadService;
  }


  getAdapter(platform: AdPlatform): IAdPlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Unsupported advertising platform: ${platform}`);
    }
    return adapter;
  }

  /**
   * Returns status for Meta, Google Ads, TikTok, and LinkedIn
   */
  async getAllProviderStatuses(): Promise<ProviderStatusInfo[]> {
    const platforms: AdPlatform[] = ['meta', 'google', 'tiktok', 'linkedin'];
    return Promise.all(
      platforms.map(async (p) => {
        try {
          return await this.getAdapter(p).getStatus();
        } catch (err: any) {
          return {
            platform: p,
            displayName: p.toUpperCase(),
            status: 'error',
            accountId: null,
            accountName: null,
            lastSynchronized: null,
            apiStatus: `Status check failed: ${err.message}`,
            error: err.message,
            capabilities: [],
          };
        }
      })
    );
  }

  /**
   * Unified Campaign Creation
   * Only performs operation if the provider confirms success or returns clear NOT CONNECTED.
   */
  async createCampaign(platform: AdPlatform, params: CreateCampaignParams): Promise<{ ok: boolean; externalId?: string; error?: string; raw?: any }> {
    const adapter = this.getAdapter(platform);
    const status = await adapter.getStatus();
    
    if (status.status !== 'connected') {
      return {
        ok: false,
        error: `NOT CONNECTED: ${status.displayName} is not connected (${status.apiStatus}). Please configure credentials or connect via OAuth first.`,
      };
    }

    return adapter.createCampaign(params);
  }

  /**
   * Unified Campaign Update
   */
  async updateCampaign(platform: AdPlatform, externalId: string, params: UpdateCampaignParams): Promise<{ ok: boolean; error?: string; raw?: any }> {
    const adapter = this.getAdapter(platform);
    const status = await adapter.getStatus();
    
    if (status.status !== 'connected') {
      return {
        ok: false,
        error: `NOT CONNECTED: ${status.displayName} is not connected.`,
      };
    }

    return adapter.updateCampaign(externalId, params);
  }

  /**
   * Unified Campaign Pause/Resume
   */
  async setCampaignStatus(platform: AdPlatform, externalId: string, status: 'active' | 'paused' | 'archived'): Promise<{ ok: boolean; error?: string; raw?: any }> {
    const adapter = this.getAdapter(platform);
    const providerStatus = await adapter.getStatus();
    
    if (providerStatus.status !== 'connected') {
      return {
        ok: false,
        error: `NOT CONNECTED: ${providerStatus.displayName} is not connected.`,
      };
    }

    return adapter.setCampaignStatus(externalId, status);
  }

  /**
   * Unified Campaign Archive
   */
  async archiveCampaign(platform: AdPlatform, externalId: string): Promise<{ ok: boolean; error?: string; raw?: any }> {
    const adapter = this.getAdapter(platform);
    const status = await adapter.getStatus();
    
    if (status.status !== 'connected') {
      return {
        ok: false,
        error: `NOT CONNECTED: ${status.displayName} is not connected.`,
      };
    }

    return adapter.archiveCampaign(externalId);
  }

  /**
   * Unified Campaign Duplication
   */
  async duplicateCampaign(platform: AdPlatform, externalId: string, newName: string): Promise<{ ok: boolean; newExternalId?: string; error?: string; raw?: any }> {
    const adapter = this.getAdapter(platform);
    const status = await adapter.getStatus();
    
    if (status.status !== 'connected') {
      return {
        ok: false,
        error: `NOT CONNECTED: ${status.displayName} is not connected.`,
      };
    }

    return adapter.duplicateCampaign(externalId, newName);
  }

  /**
   * Syncs and aggregates metrics from all connected advertising platforms
   */
  async syncAndAggregateReporting(dateRange?: { startDate: string; endDate: string }): Promise<{
    byPlatform: Record<AdPlatform, NormalizedMetrics[]>;
    total: NormalizedMetrics;
  }> {
    const platforms: AdPlatform[] = ['meta', 'google', 'tiktok', 'linkedin'];
    const byPlatform: Record<AdPlatform, NormalizedMetrics[]> = {
      meta: [],
      google: [],
      tiktok: [],
      linkedin: [],
    };

    let totalImpressions = 0;
    let totalClicks = 0;
    let totalSpend = 0;
    let totalLeads = 0;
    let totalConversions = 0;

    await Promise.all(
      platforms.map(async (p) => {
        try {
          const adapter = this.getAdapter(p);
          const metricsList = await adapter.fetchReporting(dateRange);
          byPlatform[p] = metricsList;

          for (const m of metricsList) {
            totalImpressions += m.impressions;
            totalClicks += m.clicks;
            totalSpend += m.spend;
            totalLeads += m.leads;
            totalConversions += m.conversions;
          }
        } catch (e: any) {
          console.warn(`[MarketingEngineServer] Sync failed for ${p}:`, e.message);
        }
      })
    );

    const total: NormalizedMetrics = {
      impressions: totalImpressions,
      clicks: totalClicks,
      spend: Number(totalSpend.toFixed(2)),
      currency: 'USD',
      leads: totalLeads,
      conversions: totalConversions,
      costPerLead: totalLeads > 0 ? Number((totalSpend / totalLeads).toFixed(2)) : 0,
      costPerConversion: totalConversions > 0 ? Number((totalSpend / totalConversions).toFixed(2)) : 0,
      ctr: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
      cpc: totalClicks > 0 ? Number((totalSpend / totalClicks).toFixed(2)) : 0,
    };

    return { byPlatform, total };
  }

  /**
   * Dispatches server-side conversion events to all connected platforms
   */
  async dispatchConversionEvent(payload: ConversionEventPayload): Promise<Record<AdPlatform, { ok: boolean; responseId?: string; error?: string }>> {
    const results: Partial<Record<AdPlatform, { ok: boolean; responseId?: string; error?: string }>> = {};
    const platforms: AdPlatform[] = ['meta', 'google', 'tiktok', 'linkedin'];

    await Promise.all(
      platforms.map(async (p) => {
        try {
          const adapter = this.getAdapter(p);
          results[p] = await adapter.sendConversionEvent(payload);
        } catch (err: any) {
          results[p] = { ok: false, error: err.message };
        }
      })
    );

    return results as Record<AdPlatform, { ok: boolean; responseId?: string; error?: string }>;
  }

  /**
   * Returns status for communication providers: ManyChat, SENT.dm, Twilio, Resend
   */
  async getAllCommunicationStatuses(): Promise<ProviderStatusInfo[]> {
    const providers = [
      { name: 'manychat', fn: () => this.manychat.getStatus() },
      { name: 'sentdm', fn: () => this.sentdm.getStatus() },
      { name: 'twilio', fn: () => this.twilio.getStatus() },
      { name: 'resend', fn: () => this.resend.getStatus() },
    ];

    return Promise.all(
      providers.map(async (p) => {
        try {
          return await p.fn();
        } catch (err: any) {
          return {
            platform: p.name as any,
            displayName: p.name.toUpperCase(),
            status: 'error',
            accountId: null,
            accountName: null,
            lastSynchronized: null,
            apiStatus: `Check failed: ${err.message}`,
            error: err.message,
            capabilities: [],
          };
        }
      })
    );
  }

  /**
   * Dispatch communication via requested provider and automatically record touchpoint to lead activity
   */
  async dispatchLeadCommunication(params: {
    provider: CommunicationProvider;
    channel: 'sms' | 'whatsapp' | 'email' | 'call' | 'social';
    leadId?: string;
    to: string;
    text?: string;
    subject?: string;
    html?: string;
    templateId?: string;
  }): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    let result: { ok: boolean; externalId?: string; error?: string } = { ok: false };

    if (params.provider === 'sentdm') {
      const res = await this.sentdm.sendMessage({
        to: params.to,
        channel: params.channel === 'whatsapp' ? 'whatsapp' : 'sms',
        text: params.text || '',
        templateId: params.templateId,
        leadId: params.leadId,
      });
      result = { ok: res.ok, externalId: res.messageId, error: res.error };
    } else if (params.provider === 'twilio') {
      const res = await this.twilio.initiateCall({
        to: params.to,
        leadId: params.leadId,
      });
      result = { ok: res.ok, externalId: res.callSid, error: res.error };
    } else if (params.provider === 'resend') {
      const res = await this.resend.sendEmail({
        to: params.to,
        subject: params.subject || 'RentMaikar Update',
        text: params.text,
        html: params.html,
        leadId: params.leadId,
      });
      result = { ok: res.ok, externalId: res.emailId, error: res.error };
    } else if (params.provider === 'manychat') {
      const res = await this.manychat.sendContent(params.to, params.text || '');
      result = { ok: res.ok, externalId: res.messageId, error: res.error };
    }

    // If successful and leadId provided, log activity
    if (result.ok && params.leadId) {
      await this.leads.logActivity(params.leadId, {
        id: `act-${Date.now()}`,
        lead_id: params.leadId,
        activity_type: params.channel as any,
        channel: params.channel.toUpperCase(),
        provider: params.provider,
        direction: 'outbound',
        summary: `Outbound ${params.channel} dispatched via ${params.provider}`,
        content: params.text || params.subject,
        external_id: result.externalId,
        created_at: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * Handles incoming webhooks
   */
  async handleWebhook(platform: AdPlatform, body: any, headers: Record<string, string>): Promise<{ handled: boolean; eventType?: string; error?: string }> {
    const adapter = this.getAdapter(platform);
    return adapter.handleWebhook(body, headers);
  }
}

export const marketingEngineServer = new MarketingEngineServer();
