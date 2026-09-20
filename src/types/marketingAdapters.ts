// Provider Adapter Interfaces for RentMaikar Marketing Engine
import { CanonicalMarketingEvent, MarketingPlatform, MarketingProviderAdapter } from "./marketing";

// 1. Meta (Facebook & Instagram)
export interface MetaAdapterConfig {
  pixelId?: string;
  conversionsApiToken?: string;
  adAccountId?: string;
}

export interface MetaAdapter extends MarketingProviderAdapter<MetaAdapterConfig> {
  readonly platform: 'meta';
  syncCustomAudience(audienceId: string, users: Array<{ email?: string; phone?: string }>): Promise<{ success: boolean; count: number }>;
}

// 2. Google Ads
export interface GoogleAdsAdapterConfig {
  customerId?: string;
  conversionId?: string;
  conversionLabel?: string;
}

export interface GoogleAdsAdapter extends MarketingProviderAdapter<GoogleAdsAdapterConfig> {
  readonly platform: 'google';
  uploadEnhancedConversion(event: CanonicalMarketingEvent): Promise<{ success: boolean }>;
}

// 3. TikTok Ads
export interface TikTokAdapterConfig {
  pixelCode?: string;
  eventsApiToken?: string;
}

export interface TikTokAdapter extends MarketingProviderAdapter<TikTokAdapterConfig> {
  readonly platform: 'tiktok';
}

// 4. LinkedIn Ads
export interface LinkedInAdapterConfig {
  partnerId?: string;
  conversionRuleId?: string;
}

export interface LinkedInAdapter extends MarketingProviderAdapter<LinkedInAdapterConfig> {
  readonly platform: 'linkedin';
}

// 5. ManyChat
export interface ManyChatAdapterConfig {
  apiToken?: string;
}

export interface ManyChatAdapter extends MarketingProviderAdapter<ManyChatAdapterConfig> {
  readonly platform: 'manychat';
  sendFlow(subscriberId: string, flowNs: string): Promise<{ success: boolean }>;
  setCustomFields(subscriberId: string, fields: Record<string, unknown>): Promise<{ success: boolean }>;
}

// 6. Sent.dm (CPaaS WhatsApp & SMS)
export interface SentDmAdapterConfig {
  apiKey?: string;
  sandbox?: boolean;
}

export interface SentDmAdapter extends MarketingProviderAdapter<SentDmAdapterConfig> {
  readonly platform: 'sentdm';
  sendTemplateNotification(phone: string, templateId: string, params?: Record<string, unknown>): Promise<{ success: boolean; id?: string }>;
}

// 7. Twilio (SMS & Voice)
export interface TwilioAdapterConfig {
  accountSid?: string;
  authToken?: string;
  serviceSid?: string;
}

export interface TwilioAdapter extends MarketingProviderAdapter<TwilioAdapterConfig> {
  readonly platform: 'twilio';
}

// 8. Resend (Email Marketing & Transactional)
export interface ResendAdapterConfig {
  apiKey?: string;
  verifiedDomain?: string;
}

export interface ResendAdapter extends MarketingProviderAdapter<ResendAdapterConfig> {
  readonly platform: 'resend';
  sendMarketingBroadcast(to: string[], campaignId: string, subject: string, html: string): Promise<{ success: boolean; id?: string }>;
}
