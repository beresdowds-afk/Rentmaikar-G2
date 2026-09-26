/**
 * Comprehensive Automated Tests for Webhook Signature Verification Utilities
 * Validates cryptographic checks on raw request bodies for:
 * - Resend (Svix standard)
 * - ManyChat (HMAC-SHA256 & Bearer)
 * - Meta (x-hub-signature-256)
 * - SENT.dm
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  validateResendWebhook,
  validateManyChatWebhook,
  validateMetaWebhook,
  validateSentDmWebhook,
  validateWebhookSignature,
  validateProviderWebhookSignature,
} from '../webhookUtils';

describe('Webhook Cryptographic Signature Verification Utilities', () => {
  describe('1. Resend (Svix) Webhook Validation', () => {
    const testSecret = 'whsec_mfYJuJTruKdK7YGh0rwuisPdjOZkrFull='; // 32-byte base64 test secret
    const rawSecretKey = Buffer.from(testSecret.substring(6), 'base64');
    const rawPayload = JSON.stringify({
      type: 'email.delivered',
      data: { id: 'msg_test_123', to: ['driver@rentmaikar.com'] },
    });

    it('successfully validates a legitimate Resend Svix signature with raw payload', () => {
      const svixId = 'msg_svix_001';
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      const toSign = `${svixId}.${svixTimestamp}.${rawPayload}`;
      const sigBase64 = crypto.createHmac('sha256', rawSecretKey).update(toSign).digest('base64');

      const headers = {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${sigBase64}`,
      };

      const result = validateResendWebhook(rawPayload, headers, testSecret);
      expect(result.valid).toBe(true);
      expect(result.provider).toBe('resend');
      expect(result.eventId).toBe(svixId);
    });

    it('rejects tampered or mismatched payload body', () => {
      const svixId = 'msg_svix_002';
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      const toSign = `${svixId}.${svixTimestamp}.${rawPayload}`;
      const sigBase64 = crypto.createHmac('sha256', rawSecretKey).update(toSign).digest('base64');

      const headers = {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${sigBase64}`,
      };

      // Attacker altered payload
      const tamperedPayload = JSON.stringify({
        type: 'email.bounced',
        data: { id: 'msg_test_123', to: ['hacked@rentmaikar.com'] },
      });

      const result = validateResendWebhook(tamperedPayload, headers, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature mismatch');
    });

    it('rejects expired timestamps to prevent replay attacks', () => {
      const svixId = 'msg_svix_003';
      // 10 minutes in the past (outside 5-minute tolerance)
      const expiredTimestamp = String(Math.floor(Date.now() / 1000) - 600);
      const toSign = `${svixId}.${expiredTimestamp}.${rawPayload}`;
      const sigBase64 = crypto.createHmac('sha256', rawSecretKey).update(toSign).digest('base64');

      const headers = {
        'svix-id': svixId,
        'svix-timestamp': expiredTimestamp,
        'svix-signature': `v1,${sigBase64}`,
      };

      const result = validateResendWebhook(rawPayload, headers, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside tolerance');
    });

    it('rejects missing Svix headers', () => {
      const result = validateResendWebhook(rawPayload, {}, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required Svix headers');
    });
  });

  describe('2. ManyChat Webhook Validation', () => {
    const testSecret = 'manychat_secret_key_2026_secure';
    const rawPayload = JSON.stringify({
      event: 'live_chat',
      subscriber: { id: 'mc_sub_99', phone: '+2348011112222' },
    });

    it('validates legitimate HMAC-SHA256 signature over raw request body', () => {
      const hexSignature = crypto.createHmac('sha256', testSecret).update(rawPayload).digest('hex');

      const headers = {
        'x-manychat-signature': `sha256=${hexSignature}`,
      };

      const result = validateManyChatWebhook(rawPayload, headers, testSecret);
      expect(result.valid).toBe(true);
      expect(result.provider).toBe('manychat');
    });

    it('validates Bearer token authorization header', () => {
      const headers = {
        authorization: `Bearer ${testSecret}`,
      };

      const result = validateManyChatWebhook(rawPayload, headers, testSecret);
      expect(result.valid).toBe(true);
      expect(result.provider).toBe('manychat');
    });

    it('rejects invalid ManyChat signature', () => {
      const headers = {
        'x-manychat-signature': 'sha256=invalid_forged_signature_hex_00000000000000000000000000000000',
      };

      const result = validateManyChatWebhook(rawPayload, headers, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature mismatch');
    });
  });

  describe('3. Meta & SENT.dm Webhook Validation', () => {
    it('validates Meta HMAC signature', () => {
      const metaSecret = 'meta_app_secret_abc123';
      const payload = JSON.stringify({ entry: [{ id: '12345', changes: [] }] });
      const sig = crypto.createHmac('sha256', metaSecret).update(payload).digest('hex');

      const headers = {
        'x-hub-signature-256': `sha256=${sig}`,
      };

      const validRes = validateMetaWebhook(payload, headers, metaSecret);
      expect(validRes.valid).toBe(true);

      const invalidRes = validateMetaWebhook(payload, { 'x-hub-signature-256': 'sha256=bad' }, metaSecret);
      expect(invalidRes.valid).toBe(false);
    });

    it('validates SENT.dm Bearer auth', () => {
      const sentSecret = 'sent_api_key_xyz987';
      const payload = JSON.stringify({ id: 'msg_001', status: 'delivered' });

      const validRes = validateSentDmWebhook(payload, { authorization: `Bearer ${sentSecret}` }, sentSecret);
      expect(validRes.valid).toBe(true);

      const invalidRes = validateSentDmWebhook(payload, { authorization: 'Bearer wrong_token' }, sentSecret);
      expect(invalidRes.valid).toBe(false);
    });
  });

  describe('4. Universal Webhook Signature Dispatcher', () => {
    it('dispatches to Resend validator correctly', () => {
      const secret = 'whsec_mfYJuJTruKdK7YGh0rwuisPdjOZkrFull=';
      const key = Buffer.from(secret.substring(6), 'base64');
      const body = '{"hello":"world"}';
      const id = 'evt_uni_1';
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');

      const res = validateWebhookSignature(
        'resend',
        body,
        {
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': `v1,${sig}`,
        },
        secret
      );

      expect(res.valid).toBe(true);
    });

    it('validates provider webhook using validateProviderWebhookSignature with Express Request or raw args', () => {
      const secret = 'whsec_mfYJuJTruKdK7YGh0rwuisPdjOZkrFull=';
      const key = Buffer.from(secret.substring(6), 'base64');
      const body = '{"hello":"resend"}';
      const id = 'evt_uni_2';
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');

      const mockReq: any = {
        headers: {
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': `v1,${sig}`,
        },
        rawBody: Buffer.from(body, 'utf8'),
        params: { platform: 'resend' },
      };

      const resFromReq = validateProviderWebhookSignature(mockReq, 'resend', secret);
      expect(resFromReq.valid).toBe(true);
      expect(resFromReq.provider).toBe('resend');

      // Test ManyChat via validateProviderWebhookSignature with raw params
      const mcSecret = 'mc_secret_123';
      const mcBody = JSON.stringify({ subscriber_id: 1234 });
      const mcSig = crypto.createHmac('sha256', mcSecret).update(mcBody).digest('hex');

      const resFromRaw = validateProviderWebhookSignature('manychat', mcBody, { 'x-manychat-signature': mcSig }, mcSecret);
      expect(resFromRaw.valid).toBe(true);
      expect(resFromRaw.provider).toBe('manychat');
    });
  });
});
