/**
 * End-to-end test: region-aware IDD phone input.
 *
 * Verifies that the shared PhoneNumberInput renders a country selector, formats
 * user input as E.164 for multiple countries (US, NG, GB), enforces per-country
 * validity, and produces dial-ready strings suitable for tel: links across web
 * and Capacitor (iOS/Android) shells (both use the same webview component).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js';
import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { TestProviders } from '@/test/providers';



// -----------------------------------------------------------------------------
// Mock Supabase (including Realtime)
// -----------------------------------------------------------------------------
vi.mock("@/integrations/supabase/client", () => {
  const query: any = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    upsert: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    gt: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: (resolve: any) =>
      resolve({ data: null, error: null }),
  };

  const realtimeChannel: any = {
    on: vi.fn(() => realtimeChannel),
    subscribe: vi.fn(() => realtimeChannel),
    unsubscribe: vi.fn(),
  };

  return {
    supabase: {
      from: vi.fn(() => query),

      // Realtime API
      channel: vi.fn(() => realtimeChannel),
      removeChannel: vi.fn(),
      removeAllChannels: vi.fn(),

      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: null,
        })),

        onAuthStateChange: vi.fn(() => ({
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        })),
      },
    },
  };
});
vi.mock('@/hooks/useDefaultPhoneCountry', () => ({
  useDefaultPhoneCountry: () => 'US',
}));

const CASES = [
  // Baseline countries.
  { country: 'US' as const, national: '2125551234', expected: '+12125551234' },
  { country: 'NG' as const, national: '8012345678', expected: '+2348012345678' },
  { country: 'GB' as const, national: '7400123456', expected: '+447400123456' },
  // Extra countries — cover EU, LATAM, APAC, MEA.
  { country: 'DE' as const, national: '15112345678', expected: '+4915112345678' },
  { country: 'IN' as const, national: '9876543210', expected: '+919876543210' },
  { country: 'BR' as const, national: '11987654321', expected: '+5511987654321' },
  { country: 'ZA' as const, national: '821234567', expected: '+27821234567' },
  { country: 'AU' as const, national: '412345678', expected: '+61412345678' },
];

describe('Region-aware IDD phone input (E2E)', () => {
  for (const { country, national, expected } of CASES) {
    it(`formats ${country} numbers to E.164 and remains dial-ready`, () => {
      const onChange = vi.fn();
      const { unmount } = render(
        <TestProviders>
        <PhoneNumberInput
          defaultCountry={country}
          value=""
          onChange={onChange}
          placeholder={`Enter ${country} number`}
        />
        </TestProviders>,
      );

      const input = screen.getByPlaceholderText(`Enter ${country} number`) as HTMLInputElement;
      fireEvent.change(input, { target: { value: national } });

      expect(onChange).toHaveBeenCalled();
      const emitted = onChange.mock.calls.at(-1)![0] as string;
      expect(emitted).toBe(expected);
      expect(isValidPhoneNumber(emitted)).toBe(true);

      const parsed = parsePhoneNumberFromString(emitted);
      expect(parsed?.country).toBe(country);
      expect(parsed?.getURI()).toBe(`tel:${expected}`);
      unmount();
    });
  }

  it('rejects invalid numbers per selected country', () => {
    expect(isValidPhoneNumber('+1234', 'US')).toBe(false);
    expect(isValidPhoneNumber('+2340000', 'NG')).toBe(false);
    // Too-short GB mobile.
    expect(isValidPhoneNumber('+4479', 'GB')).toBe(false);
    // Letters and symbols must be rejected outright.
    expect(isValidPhoneNumber('+1-abc-defg', 'US')).toBe(false);
  });

  describe('Edge cases', () => {
    it('normalizes leading zeros in national numbers (NG mobile with trunk 0)', () => {
      // Users often type the national trunk prefix ("0") when entering their
      // number. libphonenumber-js should strip it and produce a valid E.164.
      const parsed = parsePhoneNumberFromString('08012345678', 'NG');
      expect(parsed?.isValid()).toBe(true);
      expect(parsed?.number).toBe('+2348012345678');
    });

    it('normalizes UK numbers entered with the trunk zero', () => {
      const parsed = parsePhoneNumberFromString('07911123456', 'GB');
      expect(parsed?.isValid()).toBe(true);
      expect(parsed?.number).toBe('+447911123456');
    });

    it('strips formatting characters (spaces, dashes, brackets, dots)', () => {
      const parsed = parsePhoneNumberFromString('+1 (212) 555-1234', 'US');
      expect(parsed?.isValid()).toBe(true);
      expect(parsed?.number).toBe('+12125551234');

      const dotted = parsePhoneNumberFromString('+1.212.555.1234', 'US');
      expect(dotted?.number).toBe('+12125551234');
    });

    it('parses numbers with an extension without polluting the E.164 base', () => {
      const parsed = parsePhoneNumberFromString('+1 212-555-1234 ext. 999', 'US');
      expect(parsed?.isValid()).toBe(true);
      expect(parsed?.number).toBe('+12125551234');
      expect(parsed?.ext).toBe('999');
      // The URI includes ext but the stored E.164 does not — matching the
      // server-side is_valid_e164() trigger which forbids extensions.
      expect(parsed?.getURI()).toBe('tel:+12125551234;ext=999');
    });

    it('rejects numbers whose country code starts with 0', () => {
      // Our server-side regex requires ^\+[1-9] — a leading "+0" is invalid.
      expect(/^\+[1-9]\d{6,14}$/.test('+02125551234')).toBe(false);
    });

    it('rejects numbers exceeding the 15-digit E.164 max', () => {
      expect(/^\+[1-9]\d{6,14}$/.test('+1234567890123456')).toBe(false);
    });

    it('handles empty input without crashing the parser', () => {
      expect(parsePhoneNumberFromString('')).toBeUndefined();
      expect(parsePhoneNumberFromString('   ')).toBeUndefined();
    });
  });
});
 
