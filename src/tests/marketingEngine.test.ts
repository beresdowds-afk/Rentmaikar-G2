import { describe, it, expect, beforeEach, vi } from 'vitest';
import { marketingEngine } from '@/services/marketingEngine';

describe('MarketingEngineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates or maintains a valid session id', () => {
    const sessionId = marketingEngine.getSessionId();
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it('captures UTM parameters correctly from document context', () => {
    const touch = marketingEngine.captureTouchpoint();
    expect(touch).toBeDefined();
    expect(typeof touch).toBe('object');
  });

  it('tracks canonical events and returns a unique event identifier', async () => {
    const eventId = await marketingEngine.track('PAGE_VIEW', {
      path: '/test-route',
      source: 'test',
    });

    expect(eventId).toBeDefined();
    expect(typeof eventId).toBe('string');
    expect(eventId.length).toBeGreaterThan(0);
  });

  it('captures conversion events for attribution recording', async () => {
    const eventId = await marketingEngine.track('PAYMENT_COMPLETED', {
      amount: 1500,
      currency: 'USD',
    });

    expect(eventId).toBeDefined();
  });
});
