export type CheckoutPSP = 'paystack' | 'opay' | 'paypal';

export function resolveCountryCode(country: string): string {
  if (!country) return 'US';
  const c = country.toLowerCase();
  if (c.includes('nigeria') || c === 'ng') return 'NG';
  if (c.includes('usa') || c.includes('united states') || c === 'us') return 'US';
  return 'US';
}

export function getRegionCurrency(country: string): string {
  const cc = resolveCountryCode(country);
  return cc === 'NG' ? 'NGN' : 'USD';
}

export function getCheckoutPSPs(country: string): CheckoutPSP[] {
  const cc = resolveCountryCode(country);
  if (cc === 'NG') {
    return ['paystack', 'opay'];
  }
  return ['paypal', 'paystack'];
}
