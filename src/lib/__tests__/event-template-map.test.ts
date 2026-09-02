import { describe, expect, it } from 'vitest';
import { EVENT_TEMPLATE_MAP, resolveEventTemplate } from '../event-template-map';
import { MESSAGE_USE_CASES } from '../message-use-cases';

describe('event → template map', () => {
  it('links every event to an existing canned-message use case', () => {
    const ids = new Set(MESSAGE_USE_CASES.map((u) => u.id));
    for (const mapping of EVENT_TEMPLATE_MAP) {
      expect(ids.has(mapping.useCaseId), `${mapping.kind}/${mapping.status ?? '*'}`).toBe(true);
    }
  });

  it('always includes email plus copy for every declared channel', () => {
    for (const m of EVENT_TEMPLATE_MAP) {
      expect(m.channels).toContain('email');
      expect(m.emailSubject.length).toBeGreaterThan(0);
      expect(m.emailBody.length).toBeGreaterThan(0);
      if (m.channels.includes('sms')) expect(m.sms.length).toBeGreaterThan(0);
      if (m.channels.includes('whatsapp')) expect(m.whatsapp.length).toBeGreaterThan(0);
      if (m.channels.includes('push')) expect(m.pushTitle.length).toBeGreaterThan(0);
    }
  });

  it('has at most one status-less fallback per kind', () => {
    const counts = new Map<string, number>();
    for (const m of EVENT_TEMPLATE_MAP.filter((x) => !x.status)) {
      counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
    }
    for (const [kind, count] of counts) expect(count, kind).toBe(1);
  });

  it('prefers the status-specific mapping', () => {
    expect(resolveEventTemplate('payments_status', 'failed')?.label).toBe('Payment failed');
    expect(resolveEventTemplate('payments_status', 'pending')?.label).toBe(
      'Payment status update',
    );
    expect(resolveEventTemplate('unknown_kind', 'x')).toBeNull();
  });

  it('never sends OTP or verification codes through event automation', () => {
    for (const m of EVENT_TEMPLATE_MAP) {
      const blob = `${m.sms} ${m.whatsapp} ${m.emailBody}`.toLowerCase();
      expect(blob).not.toContain('verification code');
      expect(blob).not.toContain('otp');
    }
  });
});
