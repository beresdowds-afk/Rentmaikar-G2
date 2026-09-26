/**
 * RentMaikar Marketing Engine - Hardened Authoritative Server API Routes
 * Exposes server-side provider status, OAuth flows, normalized campaign operations,
 * durable webhook deduplication, RBAC authorization, and reporting.
 * Protects secrets strictly server-side.
 */

import { Router, Request, Response } from 'express';
import { marketingEngineServer } from './marketingEngineServer';
import { AdPlatform } from './types';
import { GoogleAdsAdapter } from './googleAdsAdapter';
import { LinkedInAdsAdapter } from './linkedinAdsAdapter';
import { claimWebhookEventDurable, markWebhookStatus } from './webhookIdempotency';
import { createOAuthState, validateAndConsumeOAuthState, saveProviderCredentials } from './oauthState';
import { validateWebhookSignature, getRawBodyFromRequest } from './webhookUtils';
import {
  requireMarketingRoles,
  requireAdminOnly,
  requireCampaignManagers,
  requireMarketingStaff,
  authenticateMarketingUser,
} from './authMiddleware';
import { marketingCorsMiddleware } from './corsMiddleware';

export const marketingApiRouter = Router();

// Apply hardened CORS middleware across all Marketing Engine endpoints
marketingApiRouter.use(marketingCorsMiddleware);

/**
 * 0. Health & Diagnostics Check (Preserved for backwards compatibility with backend stub)
 */
marketingApiRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    module: 'authoritative_marketing_engine',
    version: '2.0.0-hardened',
    timestamp: new Date().toISOString(),
    capabilities: [
      'campaign_management',
      'conversion_dispatch',
      'durable_webhooks',
      'rbac_authorization',
      'oauth_hardened',
      'unified_leads',
      'multi_network_reporting',
    ],
  });
});

/**
 * 0. Event Ingestion (Canonical Marketing Events & Attribution)
 */
marketingApiRouter.post('/events', async (req: Request, res: Response) => {
  try {
    const { event_name, event_id, properties, user_data, session_id } = req.body || {};

    if (!event_name) {
      return res.status(400).json({ ok: false, error: 'event_name is required' });
    }

    const canonicalEventId = event_id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Dispatch conversion event if applicable
    if (['RENTAL_COMPLETED', 'PAYMENT_COMPLETED', 'USER_REGISTERED', 'LEAD_CAPTURED'].includes(event_name)) {
      await marketingEngineServer.dispatchConversionEvent({
        eventName: event_name,
        eventId: canonicalEventId,
        timestamp: Date.now(),
        userId: user_data?.user_id,
        email: user_data?.email,
        phone: user_data?.phone,
        value: properties?.value || properties?.amount,
        currency: properties?.currency || 'USD',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      eventId: canonicalEventId,
      received: true,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, success: false, error: err.message || 'Failed to process event' });
  }
});

/**
 * 1. Admin Provider Connection Status (Requires Marketing Staff: admin, admin_assistant, support)
 */
marketingApiRouter.get('/providers/status', requireMarketingStaff, async (_req: Request, res: Response) => {
  try {
    const statuses = await marketingEngineServer.getAllProviderStatuses();
    res.json({ ok: true, providers: statuses });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 2. Normalized Reporting & Metrics (Requires Marketing Staff)
 */
marketingApiRouter.get('/reporting', requireMarketingStaff, async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

    const dateRange = startDate && endDate ? { startDate, endDate } : undefined;
    const reporting = await marketingEngineServer.syncAndAggregateReporting(dateRange);

    res.json({ ok: true, reporting });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 3. Campaign Creation (Requires Campaign Managers: admin, admin_assistant)
 */
marketingApiRouter.post('/campaigns', requireCampaignManagers, async (req: Request, res: Response) => {
  try {
    const { platform, ...params } = req.body;
    if (!platform) {
      return res.status(400).json({ ok: false, error: 'Target advertising platform is required' });
    }

    const result = await marketingEngineServer.createCampaign(platform as AdPlatform, params);
    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 4. Campaign Management (Update, Pause, Resume, Archive) (Requires Campaign Managers)
 */
marketingApiRouter.patch('/campaigns/:id', requireCampaignManagers, async (req: Request, res: Response) => {
  try {
    const externalId = req.params.id;
    const { platform, action, status, ...patch } = req.body;

    if (!platform) {
      return res.status(400).json({ ok: false, error: 'Platform is required' });
    }

    let result;
    if (action === 'pause' || status === 'paused') {
      result = await marketingEngineServer.setCampaignStatus(platform as AdPlatform, externalId, 'paused');
    } else if (action === 'resume' || status === 'active') {
      result = await marketingEngineServer.setCampaignStatus(platform as AdPlatform, externalId, 'active');
    } else if (action === 'archive' || status === 'archived') {
      result = await marketingEngineServer.archiveCampaign(platform as AdPlatform, externalId);
    } else {
      result = await marketingEngineServer.updateCampaign(platform as AdPlatform, externalId, patch);
    }

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 5. Campaign Duplication (Requires Campaign Managers)
 */
marketingApiRouter.post('/campaigns/:id/duplicate', requireCampaignManagers, async (req: Request, res: Response) => {
  try {
    const externalId = req.params.id;
    const { platform, newName } = req.body;

    if (!platform) {
      return res.status(400).json({ ok: false, error: 'Platform is required' });
    }

    const result = await marketingEngineServer.duplicateCampaign(platform as AdPlatform, externalId, newName);
    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 6. Server-side Conversion Dispatch (Requires Authenticated User or Internal Engine)
 */
marketingApiRouter.post('/conversions', requireMarketingStaff, async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload.eventName) {
      return res.status(400).json({ ok: false, error: 'eventName is required' });
    }

    payload.user = payload.user || {};
    payload.user.clientIpAddress = payload.user.clientIpAddress || req.ip || req.headers['x-forwarded-for'];
    payload.user.clientUserAgent = payload.user.clientUserAgent || req.headers['user-agent'];

    const results = await marketingEngineServer.dispatchConversionEvent(payload);
    res.json({ ok: true, results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 7. OAuth Flows: Initiate authorization for Google Ads & LinkedIn
 * Requires authenticated admin. Generates single-use cryptographically random state.
 */
marketingApiRouter.get('/oauth/:platform/authorize', requireAdminOnly, async (req: Request, res: Response) => {
  const platform = req.params.platform as AdPlatform;
  const origin = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${origin}/api/marketing/oauth/${platform}/callback`;

  try {
    const adminId = req.marketingUser?.id || 'admin';
    const stateToken = await createOAuthState(platform, adminId);

    if (platform === 'google') {
      const adapter = new GoogleAdsAdapter();
      const authUrl = adapter.getAuthorizationUrl(redirectUri, stateToken);
      return res.redirect(authUrl);
    } else if (platform === 'linkedin') {
      const adapter = new LinkedInAdsAdapter();
      const authUrl = adapter.getAuthorizationUrl(redirectUri, stateToken);
      return res.redirect(authUrl);
    } else {
      return res.status(400).json({ ok: false, error: `OAuth authorize not implemented for ${platform}` });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 8. OAuth Flows: Handle callback for Google Ads & LinkedIn
 * Hardened validation: checks state existence, expiration, single-use, admin identity, and provider match.
 * Persists credentials server-side in marketing_provider_credentials.
 */
marketingApiRouter.get('/oauth/:platform/callback', async (req: Request, res: Response) => {
  const platform = req.params.platform as AdPlatform;
  const code = req.query.code ? String(req.query.code) : null;
  const state = req.query.state ? String(req.query.state) : null;
  const error = req.query.error ? String(req.query.error) : null;
  const origin = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${origin}/api/marketing/oauth/${platform}/callback`;
  const frontendApp = process.env.PUBLIC_APP_URL || '';

  // 1. Verify and consume state
  const stateCheck = await validateAndConsumeOAuthState(state, platform);
  if (!stateCheck.valid) {
    const errorMsg = `oauth_state_invalid_${stateCheck.error}`;
    return res.redirect(
      `${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(errorMsg)}`
    );
  }

  if (error || !code) {
    return res.redirect(
      `${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(error || 'missing_code')}`
    );
  }

  try {
    if (platform === 'google') {
      const adapter = new GoogleAdsAdapter();
      const tokenRes = await adapter.exchangeAuthorizationCode(code, redirectUri);
      if (tokenRes.error) {
        return res.redirect(
          `${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(tokenRes.error)}`
        );
      }

      // Persist refresh token securely server-side in Supabase marketing_provider_credentials
      if (tokenRes.refreshToken) {
        await saveProviderCredentials({
          platform: 'google',
          accountId: process.env.GOOGLE_ADS_CUSTOMER_ID || 'pending_google_customer_id',
          accountName: 'Google Ads Master Account',
          accessToken: tokenRes.accessToken,
          refreshToken: tokenRes.refreshToken,
          scope: 'https://www.googleapis.com/auth/adwords',
        });
      }

      return res.redirect(`${frontendApp}/admin?marketing_tab=integrations&oauth_success=google`);
    } else if (platform === 'linkedin') {
      const adapter = new LinkedInAdsAdapter();
      const tokenRes = await adapter.exchangeAuthorizationCode(code, redirectUri);
      if (tokenRes.error) {
        return res.redirect(
          `${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(tokenRes.error)}`
        );
      }

      if (tokenRes.accessToken) {
        await saveProviderCredentials({
          platform: 'linkedin',
          accountId: process.env.LINKEDIN_ACCOUNT_ID || 'pending_linkedin_account_id',
          accountName: 'LinkedIn Campaign Manager',
          accessToken: tokenRes.accessToken,
          refreshToken: tokenRes.refreshToken,
          scope: 'r_ads,r_ads_reporting,rw_ads',
        });
      }

      return res.redirect(`${frontendApp}/admin?marketing_tab=integrations&oauth_success=linkedin`);
    }

    res.redirect(`${frontendApp}/admin?marketing_tab=integrations`);
  } catch (err: any) {
    res.redirect(
      `${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(err.message)}`
    );
  }
});

/**
 * 9. Webhook Verification (GET)
 * Supports Meta App Dashboard challenge verification and ping checks
 */
marketingApiRouter.get('/webhooks/:platform', (req: Request, res: Response) => {
  const platform = req.params.platform;

  if (platform === 'meta') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'rentmaikar_meta_webhook_verify';

    if (mode === 'subscribe' && token === expectedToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden: Meta webhook verification token mismatch');
  }

  return res.status(200).json({
    ok: true,
    platform,
    status: 'listening',
    timestamp: new Date().toISOString(),
  });
});

/**
 * 9. Webhook Ingestion Routes (POST) for Ad Platforms & Communication Providers
 * Hardened with durable database deduplication, signature verification, and safe error handling.
 */
marketingApiRouter.post('/webhooks/:platform', async (req: Request, res: Response) => {
  const platform = req.params.platform;
  const headers = req.headers as Record<string, string>;
  const startTime = Date.now();

  try {
    // 0. Cryptographic Webhook Signature Check using Raw Request Body
    const rawBody = getRawBodyFromRequest(req);
    const sigCheck = validateWebhookSignature(platform, rawBody, headers);
    if (!sigCheck.valid) {
      console.warn(`[Marketing Webhook Security] Invalid signature for platform ${platform}: ${sigCheck.error}`);
      return res.status(401).json({
        handled: false,
        error: sigCheck.error || 'Invalid webhook signature',
        platform,
      });
    }

    // 1. Extract provider event ID from standard headers or payload keys
    const eventId =
      headers['x-sent-message-id'] ||
      headers['svix-id'] ||
      req.body?.id ||
      req.body?.event_id ||
      req.body?.CallSid ||
      req.body?.data?.id;

    // 2. Durable Idempotency Check
    let claimRecordId: string | undefined;
    if (eventId) {
      const claim = await claimWebhookEventDurable(platform, String(eventId), req.body, headers);
      if (claim.isDuplicate) {
        return res.status(200).json({
          handled: true,
          duplicate: true,
          platform,
          eventId,
          source: claim.source,
          timestamp: new Date().toISOString(),
        });
      }
      claimRecordId = claim.recordId;
    }

    // 3. Advertising Platforms: Meta, Google, TikTok, LinkedIn
    if (['meta', 'google', 'tiktok', 'linkedin'].includes(platform)) {
      const result = await marketingEngineServer.handleWebhook(platform as AdPlatform, req.body, headers);
      await markWebhookStatus(claimRecordId, result.handled ? 'processed' : 'failed', result.error);
      return res.status(200).json(result);
    }

    // 4. ManyChat Webhook
    if (platform === 'manychat') {
      const result = await marketingEngineServer.manychat.handleWebhook(req.body, headers);
      if (result.leadData) {
        await marketingEngineServer.leads.createOrUpdateLead({
          first_name: result.leadData.first_name,
          last_name: result.leadData.last_name,
          full_name: result.leadData.name,
          email: result.leadData.email,
          phone: result.leadData.phone,
          acquisition_source: 'manychat',
          utm_source: result.leadData.utm_source,
          utm_campaign: result.leadData.utm_campaign,
          utm_medium: result.leadData.utm_medium,
          ad_id: result.leadData.ad_id,
          channel: 'ManyChat Social DM',
        });
      }
      await markWebhookStatus(claimRecordId, result.handled ? 'processed' : 'failed');
      return res.status(200).json(result);
    }

    // 5. SENT.dm (SMS & WhatsApp DLR / Opt-outs)
    if (platform === 'sentdm' || platform === 'sent') {
      const result = await marketingEngineServer.sentdm.handleWebhook(req.body, headers);

      if (result.isOptOut && result.sender) {
        await marketingEngineServer.leads.handleOptOut(
          { phone: result.sender },
          `Inbound SMS keyword: ${result.inboundText || 'STOP'}`
        );
      }

      await markWebhookStatus(claimRecordId, result.handled ? 'processed' : 'failed');
      return res.status(200).json(result);
    }

    // 6. Twilio (Voice & VoIP call events)
    if (platform === 'twilio') {
      const result = await marketingEngineServer.twilio.handleWebhook(req.body, headers);
      const bodyText = (req.body?.Body || '').trim().toUpperCase();
      const fromPhone = req.body?.From;
      if (fromPhone && ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END'].includes(bodyText)) {
        await marketingEngineServer.leads.handleOptOut(
          { phone: fromPhone },
          `Inbound Twilio SMS keyword: ${bodyText}`
        );
      }
      await markWebhookStatus(claimRecordId, result.handled ? 'processed' : 'failed');
      return res.status(200).json(result);
    }

    // 7. Resend (Email delivery, bounces, and complaints)
    if (platform === 'resend') {
      const result = await marketingEngineServer.resend.handleWebhook(req.body, headers);

      if ((result.isBounce || result.isComplaint || result.isUnsubscribe) && result.recipient) {
        await marketingEngineServer.leads.handleOptOut(
          { email: result.recipient },
          `Resend event: ${result.isUnsubscribe ? 'Unsubscribe Link Clicked' : result.isBounce ? 'Bounced Email' : 'Spam Complaint'}`
        );
      }

      await markWebhookStatus(claimRecordId, result.handled ? 'processed' : 'failed');
      return res.status(200).json(result);
    }

    res.status(400).json({ error: `Unknown provider webhook: ${platform}` });
  } catch (err: any) {
    console.error(`[Marketing Webhook Error] Platform: ${platform}`, err.message);
    res.status(500).json({ handled: false, error: err.message });
  }
});

/**
 * 10. Communications Endpoints (Requires Marketing Staff)
 */
marketingApiRouter.get('/communications/status', requireMarketingStaff, async (_req: Request, res: Response) => {
  try {
    const statuses = await marketingEngineServer.getAllCommunicationStatuses();
    res.json({ ok: true, providers: statuses });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.post('/communications/send', requireCampaignManagers, async (req: Request, res: Response) => {
  const { provider, channel, leadId, to, text, subject, html, templateId } = req.body;

  if (!provider || !to) {
    return res.status(400).json({ ok: false, error: 'Provider and recipient destination ("to") are required' });
  }

  try {
    const result = await marketingEngineServer.dispatchLeadCommunication({
      provider,
      channel: channel || 'sms',
      leadId,
      to,
      text,
      subject,
      html,
      templateId,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 11. Unified Leads API (Read requires Marketing Staff)
 */
marketingApiRouter.get('/leads', requireMarketingStaff, async (req: Request, res: Response) => {
  try {
    const { stage, source, country, city, role, search, campaignId } = req.query;
    const leads = await marketingEngineServer.leads.getLeads({
      stage: stage as string,
      source: source as string,
      country: country as string,
      city: city as string,
      role: role as string,
      search: search as string,
      campaignId: campaignId as string,
    });
    res.json({ ok: true, count: leads.length, leads });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Lead capture from public landing pages / lead ads (Publicly allowed)
marketingApiRouter.post('/leads', async (req: Request, res: Response) => {
  try {
    const result = await marketingEngineServer.leads.createOrUpdateLead(req.body);
    res.status(result.isNew ? 201 : 200).json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.get('/leads/:id', requireMarketingStaff, async (req: Request, res: Response) => {
  try {
    const lead = await marketingEngineServer.leads.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }
    const activities = await marketingEngineServer.leads.getLeadActivities(req.params.id);
    res.json({ ok: true, lead, activities });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.patch('/leads/:id/stage', requireMarketingStaff, async (req: Request, res: Response) => {
  const { stage, note } = req.body;
  if (!stage) {
    return res.status(400).json({ ok: false, error: 'New stage is required' });
  }

  try {
    const result = await marketingEngineServer.leads.advanceStage(req.params.id, stage, note);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.post('/leads/:id/note', requireMarketingStaff, async (req: Request, res: Response) => {
  const { note } = req.body;
  if (!note) {
    return res.status(400).json({ ok: false, error: 'Note content is required' });
  }

  try {
    await marketingEngineServer.leads.logActivity(req.params.id, {
      id: `act-${Date.now()}`,
      lead_id: req.params.id,
      activity_type: 'note',
      channel: 'Admin Note',
      provider: 'internal',
      direction: 'system',
      summary: note,
      created_at: new Date().toISOString(),
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.get('/leads/:id/activities', requireMarketingStaff, async (req: Request, res: Response) => {
  try {
    const activities = await marketingEngineServer.leads.getLeadActivities(req.params.id);
    res.json({ ok: true, activities });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 12. Marketing Overview Analytics (Canonical Reporting Authority)
 * Accessible to Marketing Staff (admin, admin_assistant, support)
 */
marketingApiRouter.get('/overview', requireMarketingStaff, async (req: Request, res: Response) => {
  try {
    const { dateRange, country, city, platform, campaign, channel, role } = req.query;
    const overview = await marketingEngineServer.leads.getOverviewMetrics({
      dateRange: dateRange as string,
      country: country as string,
      city: city as string,
      platform: platform as string,
      campaign: campaign as string,
      channel: channel as string,
      role: role as string,
    });
    res.json({ ok: true, overview, status: 'live' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 13. Ingest 600+ Driver Contacts Roster (Requires Campaign Managers)
 */
marketingApiRouter.post('/leads/import-driver-contacts', requireCampaignManagers, async (req: Request, res: Response) => {
  try {
    const { forceRefresh } = req.body || {};
    const result = await marketingEngineServer.leads.importDriverContacts({ forceRefresh });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 14. Compliance Opt-Out Endpoint (STOP keyword or Unsubscribe Link - Public)
 */
marketingApiRouter.post('/compliance/opt-out', async (req: Request, res: Response) => {
  try {
    const { phone, email, leadId, reason } = req.body;
    if (!phone && !email && !leadId) {
      return res.status(400).json({ ok: false, error: 'At least one identifier (phone, email, leadId) is required' });
    }

    const result = await marketingEngineServer.leads.handleOptOut({ phone, email, leadId }, reason);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 15. Compliance Suppression Status Check (Public)
 */
marketingApiRouter.get('/compliance/status', async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string | undefined;
    const email = req.query.email as string | undefined;
    const suppressed = await marketingEngineServer.leads.isSuppressed(email, phone);
    res.json({ ok: true, suppressed });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 16. Monthly Campaign Cycles (Requires Campaign Managers)
 */
marketingApiRouter.get('/campaigns/cycles', requireMarketingStaff, async (_req: Request, res: Response) => {
  try {
    const cycles = await marketingEngineServer.leads.getCampaignCycles();
    const upcoming = await marketingEngineServer.leads.getUpcomingCycle();
    res.json({ ok: true, cycles, upcoming });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.post('/campaigns/cycles/trigger', requireCampaignManagers, async (req: Request, res: Response) => {
  try {
    const { dryRun, force, cycleId, messageOverrides } = req.body || {};
    const result = await marketingEngineServer.leads.triggerMonthlyCycle({
      dryRun,
      force,
      cycleId,
      messageOverrides,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.post('/campaigns/cycles/schedule', requireCampaignManagers, async (_req: Request, res: Response) => {
  try {
    const nextCycle = await marketingEngineServer.leads.scheduleNextMonthlyCycle();
    res.json({ ok: true, cycle: nextCycle });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
