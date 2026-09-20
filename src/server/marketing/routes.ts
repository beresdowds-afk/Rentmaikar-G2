/**
 * RentMaikar Marketing Engine - Server API Routes
 * Exposes server-side provider status, OAuth flows, normalized campaign operations,
 * webhook ingestion, and reporting without exposing secrets to the browser.
 */

import { Router, Request, Response } from 'express';
import { marketingEngineServer } from './marketingEngineServer';
import { AdPlatform } from './types';
import { GoogleAdsAdapter } from './googleAdsAdapter';
import { LinkedInAdsAdapter } from './linkedinAdsAdapter';

export const marketingApiRouter = Router();

/**
 * 1. Admin Provider Connection Status
 * Returns status for Meta, Google Ads, TikTok, LinkedIn:
 * Connected / Not connected / Error / Last synchronized / Account / API status
 */
marketingApiRouter.get('/providers/status', async (_req: Request, res: Response) => {
  try {
    const statuses = await marketingEngineServer.getAllProviderStatuses();
    res.json({ ok: true, providers: statuses });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 2. Normalized Reporting & Metrics
 */
marketingApiRouter.get('/reporting', async (req: Request, res: Response) => {
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
 * 3. Campaign Creation
 */
marketingApiRouter.post('/campaigns', async (req: Request, res: Response) => {
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
 * 4. Campaign Management (Update, Pause, Resume, Archive)
 */
marketingApiRouter.patch('/campaigns/:id', async (req: Request, res: Response) => {
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
 * 5. Campaign Duplication
 */
marketingApiRouter.post('/campaigns/:id/duplicate', async (req: Request, res: Response) => {
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
 * 6. Server-side Conversion Dispatch (Meta CAPI, Google, TikTok, LinkedIn)
 */
marketingApiRouter.post('/conversions', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload.eventName) {
      return res.status(400).json({ ok: false, error: 'eventName is required' });
    }

    // Augment with request IP and User-Agent if not provided
    payload.user = payload.user || {};
    payload.user.clientIpAddress = payload.user.clientIpAddress || req.ip || req.headers['x-forwarded-for'];
    payload.user.clientUserAgent = payload.user.clientUserAgent || req.headers['user-agent'];

    const results = await marketingEngineServer.dispatchConversionEvent(payload);
    res.json({ ok: true, results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// In-memory idempotency cache for webhook events (capped at 5,000 to prevent memory growth)
const processedWebhookIds = new Set<string>();
const MAX_IDEMPOTENCY_CACHE = 5000;

function trackAndCheckDuplicate(eventId?: string): boolean {
  if (!eventId) return false;
  if (processedWebhookIds.has(eventId)) {
    return true;
  }
  if (processedWebhookIds.size >= MAX_IDEMPOTENCY_CACHE) {
    const firstKey = processedWebhookIds.values().next().value;
    if (firstKey) processedWebhookIds.delete(firstKey);
  }
  processedWebhookIds.add(eventId);
  return false;
}

/**
 * 7. OAuth Flows: Initiate authorization for Google Ads & LinkedIn
 */
marketingApiRouter.get('/oauth/:platform/authorize', (req: Request, res: Response) => {
  const platform = req.params.platform as AdPlatform;
  // Use public backend domain in production (staging.rentmaikar.com) or current host in local/dev
  const origin = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${origin}/api/marketing/oauth/${platform}/callback`;
  const state = req.query.state ? String(req.query.state) : `mkt_${Date.now()}`;

  try {
    if (platform === 'google') {
      const adapter = new GoogleAdsAdapter();
      const authUrl = adapter.getAuthorizationUrl(redirectUri, state);
      return res.redirect(authUrl);
    } else if (platform === 'linkedin') {
      const adapter = new LinkedInAdsAdapter();
      const authUrl = adapter.getAuthorizationUrl(redirectUri, state);
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
 */
marketingApiRouter.get('/oauth/:platform/callback', async (req: Request, res: Response) => {
  const platform = req.params.platform as AdPlatform;
  const code = req.query.code ? String(req.query.code) : null;
  const error = req.query.error ? String(req.query.error) : null;
  const origin = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${origin}/api/marketing/oauth/${platform}/callback`;
  const frontendApp = process.env.PUBLIC_APP_URL || '';

  if (error || !code) {
    return res.redirect(`${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(error || 'missing_code')}`);
  }

  try {
    if (platform === 'google') {
      const adapter = new GoogleAdsAdapter();
      const tokenRes = await adapter.exchangeAuthorizationCode(code, redirectUri);
      if (tokenRes.error) {
        return res.redirect(`${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(tokenRes.error)}`);
      }
      // Note: Server persists refresh_token securely server-side; NEVER expose to client
      return res.redirect(`${frontendApp}/admin?marketing_tab=integrations&oauth_success=google`);
    } else if (platform === 'linkedin') {
      const adapter = new LinkedInAdsAdapter();
      const tokenRes = await adapter.exchangeAuthorizationCode(code, redirectUri);
      if (tokenRes.error) {
        return res.redirect(`${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(tokenRes.error)}`);
      }
      return res.redirect(`${frontendApp}/admin?marketing_tab=integrations&oauth_success=linkedin`);
    }

    res.redirect(`${frontendApp}/admin?marketing_tab=integrations`);
  } catch (err: any) {
    res.redirect(`${frontendApp}/admin?marketing_tab=integrations&oauth_error=${encodeURIComponent(err.message)}`);
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
      console.log('[Meta Webhook] Successfully verified webhook subscription challenge');
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
 * Hardened with signature verification, idempotency deduplication, and safe failure handling.
 */
marketingApiRouter.post('/webhooks/:platform', async (req: Request, res: Response) => {
  const platform = req.params.platform;
  const headers = req.headers as Record<string, string>;
  const startTime = Date.now();

  try {
    // 1. Idempotency Check: Extract event ID from headers or body
    const eventId =
      headers['x-sent-message-id'] ||
      headers['svix-id'] ||
      req.body?.id ||
      req.body?.event_id ||
      req.body?.CallSid ||
      req.body?.data?.id;

    if (eventId && trackAndCheckDuplicate(String(eventId))) {
      console.log(`[Webhook Idempotency] Duplicate event skipped: ${eventId} (${platform})`);
      return res.status(200).json({ handled: true, duplicate: true, eventId });
    }

    // 2. Advertising Platforms: Meta, Google, TikTok, LinkedIn
    if (['meta', 'google', 'tiktok', 'linkedin'].includes(platform)) {
      const result = await marketingEngineServer.handleWebhook(platform as AdPlatform, req.body, headers);
      console.log(`[Marketing Webhook] Handled ${platform} event in ${Date.now() - startTime}ms`);
      return res.status(200).json(result);
    }

    // 3. ManyChat Webhook
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
      return res.status(200).json(result);
    }

    // 4. SENT.dm (SMS & WhatsApp DLR / Opt-outs)
    if (platform === 'sentdm' || platform === 'sent') {
      const result = await marketingEngineServer.sentdm.handleWebhook(req.body, headers);

      // Handle regulatory opt-out compliance (STOP, UNSUBSCRIBE, etc.)
      if (result.isOptOut && result.sender) {
        console.log(`[SENT.dm Compliance] Opt-out requested by sender: ${result.sender}`);
        const existingLeads = await marketingEngineServer.leads.getLeads({ search: result.sender });
        for (const lead of existingLeads) {
          await marketingEngineServer.leads.logActivity(lead.id, {
            id: `act-optout-${Date.now()}`,
            lead_id: lead.id,
            activity_type: 'sms',
            channel: 'SMS',
            provider: 'sentdm',
            direction: 'inbound',
            summary: `Opt-out keyword received ("${result.inboundText || 'STOP'}"). Automatically marked unsubscribed.`,
            created_at: new Date().toISOString(),
          });
        }
      }

      return res.status(200).json(result);
    }

    // 5. Twilio (Voice & VoIP call events)
    if (platform === 'twilio') {
      const result = await marketingEngineServer.twilio.handleWebhook(req.body, headers);
      return res.status(200).json(result);
    }

    // 6. Resend (Email delivery, bounces, and complaints)
    if (platform === 'resend') {
      const result = await marketingEngineServer.resend.handleWebhook(req.body, headers);

      // Log bounces and complaints to prevent future delivery
      if ((result.isBounce || result.isComplaint) && result.recipient) {
        console.warn(`[Resend Webhook] Email suppression triggered for ${result.recipient} (Bounce: ${result.isBounce}, Complaint: ${result.isComplaint})`);
        const existingLeads = await marketingEngineServer.leads.getLeads({ search: result.recipient });
        for (const lead of existingLeads) {
          await marketingEngineServer.leads.logActivity(lead.id, {
            id: `act-bounce-${Date.now()}`,
            lead_id: lead.id,
            activity_type: 'email',
            channel: 'EMAIL',
            provider: 'resend',
            direction: 'system',
            summary: result.isBounce
              ? `Email delivery bounced. Delivery suppressed.`
              : `Email marked as complaint. Sender suppressed.`,
            created_at: new Date().toISOString(),
          });
        }
      }

      return res.status(200).json(result);
    }

    res.status(400).json({ error: `Unknown provider webhook: ${platform}` });
  } catch (err: any) {
    console.error(`[Marketing Webhook Error] Platform: ${platform}`, err.message);
    res.status(500).json({ handled: false, error: err.message });
  }
});

/**
 * 10. Communications Endpoints (ManyChat, SENT.dm, Twilio, Resend)
 */
marketingApiRouter.get('/communications/status', async (_req: Request, res: Response) => {
  try {
    const statuses = await marketingEngineServer.getAllCommunicationStatuses();
    res.json({ ok: true, providers: statuses });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.post('/communications/send', async (req: Request, res: Response) => {
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
 * 11. Unified Leads API
 */
marketingApiRouter.get('/leads', async (req: Request, res: Response) => {
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

marketingApiRouter.post('/leads', async (req: Request, res: Response) => {
  try {
    const result = await marketingEngineServer.leads.createOrUpdateLead(req.body);
    res.status(result.isNew ? 201 : 200).json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

marketingApiRouter.get('/leads/:id', async (req: Request, res: Response) => {
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

marketingApiRouter.patch('/leads/:id/stage', async (req: Request, res: Response) => {
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

marketingApiRouter.post('/leads/:id/note', async (req: Request, res: Response) => {
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

marketingApiRouter.get('/leads/:id/activities', async (req: Request, res: Response) => {
  try {
    const activities = await marketingEngineServer.leads.getLeadActivities(req.params.id);
    res.json({ ok: true, activities });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * 12. Marketing Overview Analytics
 */
marketingApiRouter.get('/overview', async (req: Request, res: Response) => {
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
    res.json({ ok: true, overview });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

