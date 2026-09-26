/**
 * RentMaikar Marketing Engine Server-Side Types
 * Canonical advertising platform definitions, normalized metrics, and adapter contracts.
 */

export type AdPlatform = 'meta' | 'google' | 'tiktok' | 'linkedin';

export type ProviderConnectionStatus = 'connected' | 'not_connected' | 'error' | 'expired';

export type ReportingStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'NOT_CONFIGURED';

export interface ProviderReportingResult {
  status: ReportingStatus;
  metrics: NormalizedMetrics[];
  error?: string | null;
}

export interface AggregatedReportingResult {
  byPlatform: Record<AdPlatform, NormalizedMetrics[]>;
  total: NormalizedMetrics;
  status: ReportingStatus;
  totalsByCurrency: {
    USD: NormalizedMetrics;
    NGN: NormalizedMetrics;
  };
  providerStatuses: Record<AdPlatform, {
    status: ReportingStatus;
    error?: string | null;
  }>;
}

export interface ProviderStatusInfo {
  platform: AdPlatform;
  displayName: string;
  status: ProviderConnectionStatus;
  accountId: string | null;
  accountName: string | null;
  lastSynchronized: string | null;
  apiStatus: string;
  error?: string | null;
  capabilities: string[];
}

export interface NormalizedMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  currency: string;
  leads: number;
  conversions: number;
  costPerLead: number;
  costPerConversion: number;
  ctr: number; // Click-through rate (%)
  cpc: number; // Cost per click
  providerSpecific?: Record<string, any>;
}

export interface NormalizedCampaign {
  id: string;
  platform: AdPlatform;
  externalId?: string;
  name: string;
  status: 'active' | 'paused' | 'archived' | 'draft' | 'completed';
  objective: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  currency: string;
  startDate?: string;
  endDate?: string;
  region?: string;
  metrics: NormalizedMetrics;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCampaignParams {
  name: string;
  objective: 'awareness' | 'traffic' | 'leads' | 'conversions' | 'app_installs';
  budgetType: 'daily' | 'lifetime';
  budgetAmount: number;
  currency: string;
  region: 'all' | 'usa' | 'nigeria';
  startDate?: string;
  endDate?: string;
  adContent?: {
    headline?: string;
    bodyText?: string;
    destinationUrl?: string;
    mediaUrl?: string;
    callToAction?: string;
  };
  targeting?: {
    countries?: string[];
    ageMin?: number;
    ageMax?: number;
    interests?: string[];
  };
}

export interface UpdateCampaignParams {
  name?: string;
  status?: 'active' | 'paused' | 'archived';
  budgetAmount?: number;
  endDate?: string;
}

export interface ConversionEventPayload {
  eventName: string;
  eventId: string;
  eventTime: number; // UNIX timestamp in seconds
  actionSource: 'website' | 'app' | 'system_generated';
  user: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
    fbp?: string;
    fbc?: string;
    gclid?: string;
    ttclid?: string;
  };
  customData?: {
    currency?: string;
    value?: number;
    orderId?: string;
    contentName?: string;
    contentType?: string;
    status?: string;
    role?: string;
    stage?: string;
    [key: string]: any;
  };
}

export interface IAdPlatformAdapter {
  platform: AdPlatform;
  getStatus(): Promise<ProviderStatusInfo>;
  createCampaign(params: CreateCampaignParams): Promise<{ ok: boolean; externalId?: string; error?: string; raw?: any }>;
  updateCampaign(externalId: string, params: UpdateCampaignParams): Promise<{ ok: boolean; error?: string; raw?: any }>;
  setCampaignStatus(externalId: string, status: 'active' | 'paused' | 'archived'): Promise<{ ok: boolean; error?: string; raw?: any }>;
  archiveCampaign(externalId: string): Promise<{ ok: boolean; error?: string; raw?: any }>;
  duplicateCampaign(externalId: string, newName: string): Promise<{ ok: boolean; newExternalId?: string; error?: string; raw?: any }>;
  fetchReporting(dateRange?: { startDate: string; endDate: string }): Promise<NormalizedMetrics[]>;
  sendConversionEvent(payload: ConversionEventPayload): Promise<{ ok: boolean; responseId?: string; error?: string }>;
  handleWebhook(body: any, headers: Record<string, string>): Promise<{ handled: boolean; eventType?: string; error?: string }>;
}

export type CommunicationProvider = 'manychat' | 'sentdm' | 'twilio' | 'resend';

export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'REGISTERED'
  | 'VERIFIED'
  | 'KYC_COMPLETED'
  | 'VEHICLE_LISTED'
  | 'VEHICLE_APPROVED'
  | 'RENTAL'
  | 'CONVERTED'
  | 'OPTED_OUT'
  | 'DISQUALIFIED';

export const STAGE_ORDER: LeadStage[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'REGISTERED',
  'VERIFIED',
  'KYC_COMPLETED',
  'VEHICLE_LISTED',
  'VEHICLE_APPROVED',
  'RENTAL',
  'CONVERTED',
];

export type LeadSource =
  | 'meta'
  | 'google'
  | 'tiktok'
  | 'linkedin'
  | 'manychat'
  | 'sentdm'
  | 'twilio'
  | 'resend'
  | 'organic'
  | 'referral'
  | 'direct'
  | 'outreach'
  | 'roster'
  | 'import';

export type LeadTargetRole = 'driver' | 'owner' | 'renter' | 'corporate';

export interface UnifiedLead {
  id: string;
  user_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  country: string;
  city?: string | null;
  target_role: LeadTargetRole;
  stage: LeadStage;
  acquisition_source: LeadSource;
  campaign_id?: string | null;
  campaign_name?: string | null;
  ad_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  first_touch_at: string;
  last_touch_at: string;
  first_touch_channel: string;
  last_touch_channel: string;
  touchpoints_count: number;
  vehicle_id?: string | null;
  vehicle_status?: string | null;
  rental_id?: string | null;
  rental_status?: string | null;
  is_verified?: boolean;
  kyc_status?: string | null;
  communications_count?: {
    sms: number;
    whatsapp: number;
    email: number;
    calls: number;
    total: number;
  };
  opted_out?: boolean;
  opted_out_at?: string | null;
  opt_out_reason?: string | null;
  last_campaign_sent_at?: string | null;
  campaign_cycle_id?: string | null;
  notes?: string | null;
  tags?: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CampaignCycle {
  id: string;
  cycle_name: string;
  target_audience: string;
  frequency: 'monthly';
  status: 'scheduled' | 'in_progress' | 'completed' | 'paused' | 'failed';
  cycle_month: string; // e.g. '2026-09'
  scheduled_for: string;
  executed_at?: string | null;
  completed_at?: string | null;
  total_recipients: number;
  delivered_count: number;
  opt_out_count: number;
  failed_count: number;
  channels: ('sms' | 'email' | 'whatsapp')[];
  message_template: {
    smsText?: string;
    emailSubject?: string;
    emailBody?: string;
  };
  compliance_statement: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DriverImportResult {
  totalScanned: number;
  importedCount: number;
  updatedCount: number;
  optedOutCount: number;
  sampleIds: string[];
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type:
    | 'stage_change'
    | 'sms'
    | 'whatsapp'
    | 'email'
    | 'call'
    | 'note'
    | 'ad_click'
    | 'form_submit'
    | 'web_visit'
    | 'registration'
    | 'verification'
    | 'kyc'
    | 'vehicle'
    | 'rental';
  channel?: string;
  provider?: string;
  direction?: 'inbound' | 'outbound' | 'system';
  summary: string;
  content?: string;
  external_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface SendMessageParams {
  to: string;
  channel: 'sms' | 'whatsapp';
  text: string;
  templateId?: string;
  metadata?: Record<string, any>;
  leadId?: string;
}

export interface InitiateCallParams {
  to: string;
  leadId?: string;
  callType?: 'individual' | 'group';
  callerRole?: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  leadId?: string;
  campaignId?: string;
  from?: string;
  replyTo?: string;
}

