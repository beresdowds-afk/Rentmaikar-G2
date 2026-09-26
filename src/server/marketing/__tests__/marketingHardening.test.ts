/**
 * Comprehensive Automated Tests for Marketing Engine Production Hardening
 * Uses standard Node.js http server and fetch - no external supertest dependency.
 * Covers:
 * 1. Concurrency Webhook Idempotency & Horizontal Scale Deduplication
 * 2. Role-Based Access Control (RBAC) & Authorization Boundaries
 * 3. CORS Origin Verification & Preflight Handling
 * 4. Google Ads OAuth State Cryptographic Hardening & Single-Use Enforcement
 * 5. Consolidated Marketing API Router Integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import http from 'http';
import { marketingApiRouter } from '../routes';
import { claimWebhookEventDurable } from '../webhookIdempotency';
import { createOAuthState, validateAndConsumeOAuthState } from '../oauthState';
import { isOriginAllowed } from '../corsMiddleware';

describe('RentMaikar Marketing Engine - Production Hardening Test Suite', () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/marketing', marketingApiRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
  });

  describe('1. Durable Webhook Idempotency & Concurrency Deduplication', () => {
    it('simultaneous concurrent webhook deliveries are deduplicated and processed exactly once', async () => {
      const eventId = `concurrent_evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const platform = 'meta';

      // Simulate 5 simultaneous concurrent incoming webhook requests with identical event ID
      const concurrentCalls = Array.from({ length: 5 }, () =>
        claimWebhookEventDurable(platform, eventId, { type: 'leadgen', id: eventId })
      );

      const results = await Promise.all(concurrentCalls);

      // Exactly ONE call must be accepted as new (isDuplicate === false)
      const freshClaims = results.filter((r) => r.isDuplicate === false);
      const duplicateClaims = results.filter((r) => r.isDuplicate === true);

      expect(freshClaims.length).toBe(1);
      expect(duplicateClaims.length).toBe(4);
    });

    it('replaying an already processed webhook returns safe duplicate acknowledgement', async () => {
      const testEventId = `replay_evt_${Date.now()}`;

      // First webhook delivery
      const firstRes = await fetch(`${baseUrl}/api/marketing/webhooks/sentdm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sent-message-id': testEventId,
        },
        body: JSON.stringify({
          id: testEventId,
          status: 'delivered',
          recipient: '+2348012345678',
        }),
      });

      expect(firstRes.status).toBe(200);

      // Second identical webhook delivery (replay/retry from provider)
      const secondRes = await fetch(`${baseUrl}/api/marketing/webhooks/sentdm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sent-message-id': testEventId,
        },
        body: JSON.stringify({
          id: testEventId,
          status: 'delivered',
          recipient: '+2348012345678',
        }),
      });

      expect(secondRes.status).toBe(200);
      const secondBody = await secondRes.json();
      expect(secondBody.duplicate).toBe(true);
      expect(secondBody.handled).toBe(true);
    });
  });

  describe('2. Marketing API RBAC Authorization Hardening', () => {
    it('rejects unauthenticated/anonymous access to campaign creation with 401', async () => {
      const res = await fetch(`${baseUrl}/api/marketing/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'meta',
          name: 'Unauthorized Campaign',
          objective: 'traffic',
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('AUTH_REQUIRED');
    });

    it('rejects drivers and owners from managing campaigns with 403 Forbidden', async () => {
      // Driver attempt
      const driverRes = await fetch(`${baseUrl}/api/marketing/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-role': 'driver',
          'x-test-user-id': 'usr_driver_01',
        },
        body: JSON.stringify({
          platform: 'meta',
          name: 'Driver Campaign',
          objective: 'leads',
        }),
      });

      expect(driverRes.status).toBe(403);
      const driverBody = await driverRes.json();
      expect(driverBody.code).toBe('INSUFFICIENT_ROLE');

      // Owner attempt
      const ownerRes = await fetch(`${baseUrl}/api/marketing/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-role': 'owner',
          'x-test-user-id': 'usr_owner_01',
        },
        body: JSON.stringify({
          platform: 'google',
          name: 'Owner Campaign',
          objective: 'leads',
        }),
      });

      expect(ownerRes.status).toBe(403);
      const ownerBody = await ownerRes.json();
      expect(ownerBody.code).toBe('INSUFFICIENT_ROLE');
    });

    it('allows admin and admin_assistant to access campaign management', async () => {
      // Admin should pass authorization check
      const adminRes = await fetch(`${baseUrl}/api/marketing/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-role': 'admin',
          'x-test-user-id': 'usr_admin_01',
        },
        body: JSON.stringify({
          platform: 'meta',
          name: 'Fleet Expansion Lagos Q4',
          objective: 'leads',
          budgetAmount: 150,
          currency: 'USD',
        }),
      });

      // Authorization passed (if provider not connected, adapter returns structured error, NOT 401 or 403)
      expect(adminRes.status).not.toBe(401);
      expect(adminRes.status).not.toBe(403);

      // Admin Assistant should also pass authorization check
      const assistantRes = await fetch(`${baseUrl}/api/marketing/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-role': 'admin_assistant',
          'x-test-user-id': 'usr_assistant_01',
        },
        body: JSON.stringify({
          platform: 'meta',
          name: 'Fleet Assistant Campaign',
          objective: 'leads',
        }),
      });

      expect(assistantRes.status).not.toBe(401);
      expect(assistantRes.status).not.toBe(403);
    });

    it('allows support staff read-only access to overview, but bars them from campaign changes', async () => {
      // Support read overview
      const readRes = await fetch(`${baseUrl}/api/marketing/overview`, {
        headers: { 'x-test-role': 'support' },
      });

      expect(readRes.status).toBe(200);
      const readBody = await readRes.json();
      expect(readBody.ok).toBe(true);

      // Support attempt to create campaign must be forbidden
      const writeRes = await fetch(`${baseUrl}/api/marketing/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-role': 'support',
        },
        body: JSON.stringify({ platform: 'meta', name: 'Support Campaign' }),
      });

      expect(writeRes.status).toBe(403);
    });

    it('allows public access to legitimate public endpoints (health, public lead capture, compliance opt-out)', async () => {
      // 1. Health check
      const healthRes = await fetch(`${baseUrl}/api/marketing/health`);
      expect(healthRes.status).toBe(200);
      const healthBody = await healthRes.json();
      expect(healthBody.status).toBe('ok');

      // 2. Compliance opt-out
      const optOutRes = await fetch(`${baseUrl}/api/marketing/compliance/opt-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+2348000000000', reason: 'SMS STOP keyword' }),
      });
      expect(optOutRes.status).toBe(200);

      // 3. Public landing page lead capture
      const leadRes = await fetch(`${baseUrl}/api/marketing/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: 'Lead',
          phone: `+234800${Math.floor(100000 + Math.random() * 900000)}`,
          acquisition_source: 'landing_page',
        }),
      });
      expect([200, 201]).toContain(leadRes.status);
    });
  });

  describe('3. CORS Origin Verification & Preflight Hardening', () => {
    it('verifies allowed production and development origins', () => {
      expect(isOriginAllowed('https://rentmaikar.com')).toBe(true);
      expect(isOriginAllowed('https://www.rentmaikar.com')).toBe(true);
      expect(isOriginAllowed('https://staging.rentmaikar.com')).toBe(true);
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(isOriginAllowed('http://localhost:5173')).toBe(true);
      expect(isOriginAllowed('https://preview-service.europe-west1.run.app')).toBe(true);
    });

    it('rejects unauthorized third-party origins', () => {
      expect(isOriginAllowed('https://evil-hacker.com')).toBe(false);
      expect(isOriginAllowed('https://fake-rentmaikar.org')).toBe(false);
      expect(isOriginAllowed('http://localhost:9999')).toBe(false);
    });

    it('sets CORS response headers for authorized origin on requests', async () => {
      const res = await fetch(`${baseUrl}/api/marketing/health`, {
        headers: { Origin: 'https://rentmaikar.com' },
      });

      expect(res.headers.get('access-control-allow-origin')).toBe('https://rentmaikar.com');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('does not set Access-Control-Allow-Origin for unauthorized origin', async () => {
      const res = await fetch(`${baseUrl}/api/marketing/health`, {
        headers: { Origin: 'https://malicious-site.example' },
      });

      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('preflight OPTIONS returns 204 for authorized origin and 403 for unauthorized origin', async () => {
      const allowedPreflight = await fetch(`${baseUrl}/api/marketing/overview`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://staging.rentmaikar.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(allowedPreflight.status).toBe(204);
      expect(allowedPreflight.headers.get('access-control-allow-origin')).toBe('https://staging.rentmaikar.com');

      const deniedPreflight = await fetch(`${baseUrl}/api/marketing/overview`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://unauthorized-attacker.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(deniedPreflight.status).toBe(403);
    });
  });

  describe('4. Google Ads OAuth State Cryptographic Hardening', () => {
    it('generates a cryptographically random, single-use state token bound to provider and admin', async () => {
      const adminId = 'admin_usr_42';
      const stateToken = await createOAuthState('google', adminId);

      expect(stateToken).toBeDefined();
      expect(stateToken.startsWith('rm_oauth_google_')).toBe(true);
      expect(stateToken.length).toBeGreaterThan(40);

      // Validate and consume state token for the first time
      const firstValidation = await validateAndConsumeOAuthState(stateToken, 'google');
      expect(firstValidation.valid).toBe(true);
      expect(firstValidation.record?.adminId).toBe(adminId);

      // Second attempt to use the same state token must be rejected (single-use enforcement)
      const secondValidation = await validateAndConsumeOAuthState(stateToken, 'google');
      expect(secondValidation.valid).toBe(false);
      expect(secondValidation.error).toBe('already_used');
    });

    it('rejects missing, forged, wrong provider, or unknown OAuth state tokens', async () => {
      // 1. Missing state
      const missing = await validateAndConsumeOAuthState(null, 'google');
      expect(missing.valid).toBe(false);
      expect(missing.error).toBe('missing_state');

      // 2. Forged / non-existent state
      const forged = await validateAndConsumeOAuthState('rm_oauth_fake_state_12345', 'google');
      expect(forged.valid).toBe(false);
      expect(forged.error).toBe('invalid_state');

      // 3. Wrong provider (token minted for LinkedIn used on Google callback)
      const linkedinToken = await createOAuthState('linkedin', 'admin_1');
      const providerMismatch = await validateAndConsumeOAuthState(linkedinToken, 'google');
      expect(providerMismatch.valid).toBe(false);
      expect(providerMismatch.error).toBe('wrong_provider');
    });

    it('OAuth callback rejects invalid state and redirects with descriptive error without leaking secrets', async () => {
      const res = await fetch(
        `${baseUrl}/api/marketing/oauth/google/callback?code=mock_code&state=unrecognized_state_token`,
        { redirect: 'manual' }
      );

      // Must redirect to admin portal with oauth_error parameter
      expect(res.status).toBe(302);
      const location = res.headers.get('location') || '';
      expect(location).toContain('oauth_error=oauth_state_invalid_invalid_state');
    });
  });

  describe('5. Consolidated Marketing API Engine Integration', () => {
    it('verifies /api/marketing/overview returns live authoritative metrics', async () => {
      const res = await fetch(`${baseUrl}/api/marketing/overview`, {
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.overview).toBeDefined();
      expect(body.status).toBe('live');
      expect(typeof body.overview.spend).toBe('number');
      expect(typeof body.overview.impressions).toBe('number');
    });

    it('verifies canonical /api/marketing/events ingestion operates correctly', async () => {
      const res = await fetch(`${baseUrl}/api/marketing/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: 'LEAD_CAPTURED',
          event_id: `evt_test_${Date.now()}`,
          properties: { value: 50, currency: 'USD' },
          user_data: { email: 'driver@test.rentmaikar.com' },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.eventId).toBeDefined();
    });
  });
});
