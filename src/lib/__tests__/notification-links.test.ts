import { describe, it, expect } from 'vitest';
import { notificationDeepLink, toRelativeDeepLink } from '../notification-links';

describe('notification-links', () => {
  describe('notificationDeepLink - Staff', () => {
    it('generates correct admin deep links for invoices', () => {
      const link = notificationDeepLink({ table: 'invoices', record_id: 'inv-123' }, 'invoice_created', 'admin');
      expect(link).toBe('/admin?portal=crm&tab=billing&record=inv-123');
    });

    it('generates correct admin deep links for applications', () => {
      const link = notificationDeepLink({ table: 'applications', record_id: 'app-456' }, 'application_status', 'admin_assistant');
      expect(link).toBe('/admin?portal=crm&tab=applications&record=app-456');
    });

    it('generates correct admin deep links for payments and treasury', () => {
      expect(notificationDeepLink({ table: 'payments', record_id: 'pay-1' }, 'payment_success', 'admin')).toBe('/admin/payments?record=pay-1');
      expect(notificationDeepLink({ table: 'owner_payouts', record_id: 'po-1' }, 'payout_processed', 'admin')).toBe('/admin/treasury?record=po-1');
      expect(notificationDeepLink({ table: 'withdrawal_authorizations', record_id: 'wd-1' }, 'withdrawal_approved', 'superadmin')).toBe('/admin/treasury?record=wd-1');
    });

    it('generates correct admin deep links for vehicles and agreements', () => {
      expect(notificationDeepLink({ table: 'vehicles', record_id: 'veh-99' }, 'vehicle_registered', 'admin')).toBe('/admin/vehicle-queue?record=veh-99');
      expect(notificationDeepLink({ table: 'legal_agreements', record_id: 'leg-1' }, 'agreement_signed', 'admin')).toBe('/admin?portal=crm&tab=legal-agreements&record=leg-1');
      expect(notificationDeepLink({ table: 'rent_to_own_agreements', record_id: 'rto-1' }, 'rto_created', 'admin')).toBe('/admin?portal=crm&tab=rent-to-own&record=rto-1');
    });
  });

  describe('notificationDeepLink - Drivers', () => {
    it('routes invoices and payments to /driver/dashboard?tab=payments', () => {
      const invLink = notificationDeepLink({ table: 'invoices', record_id: 'inv-1' }, 'invoice_due', 'driver');
      expect(invLink).toBe('/driver/dashboard?tab=payments&record=inv-1');

      const payLink = notificationDeepLink({ table: 'payments', record_id: 'pay-2' }, 'payment_receipt', 'driver');
      expect(payLink).toBe('/driver/dashboard?tab=payments&record=pay-2');
    });

    it('routes lease-to-own agreements to /driver/dashboard?tab=lease-to-own', () => {
      const rtoLink = notificationDeepLink({ table: 'rent_to_own_agreements', record_id: 'rto-2' }, 'rto_approved', 'driver');
      expect(rtoLink).toBe('/driver/dashboard?tab=lease-to-own&record=rto-2');
    });

    it('routes price negotiations to /driver/dashboard?tab=negotiate', () => {
      const negLink = notificationDeepLink({ table: 'price_negotiations', record_id: 'neg-1' }, 'negotiation_counter', 'driver');
      expect(negLink).toBe('/driver/dashboard?tab=negotiate&record=neg-1');
    });

    it('routes rentals and bookings to /driver/dashboard?tab=overview', () => {
      const rentLink = notificationDeepLink({ table: 'rentals', record_id: 'rent-1' }, 'rental_active', 'driver');
      expect(rentLink).toBe('/driver/dashboard?tab=overview&record=rent-1');

      const bookLink = notificationDeepLink({ table: 'booking_requests', record_id: 'book-1' }, 'booking_accepted', 'driver');
      expect(bookLink).toBe('/driver/dashboard?tab=overview&record=book-1');
    });

    it('routes incidents to /driver/dashboard?tab=incidents', () => {
      const incLink = notificationDeepLink({ table: 'incidents', record_id: 'inc-1' }, 'incident_updated', 'driver');
      expect(incLink).toBe('/driver/dashboard?tab=incidents&record=inc-1');
    });
  });

  describe('notificationDeepLink - Owners', () => {
    it('routes earnings and payouts to /owner/dashboard?tab=earnings', () => {
      const earnLink = notificationDeepLink({ table: 'invoices', record_id: 'inv-10' }, 'invoice_paid', 'owner');
      expect(earnLink).toBe('/owner/dashboard?tab=earnings&record=inv-10');

      const poLink = notificationDeepLink({ table: 'owner_payouts', record_id: 'po-10' }, 'payout_sent', 'owner');
      expect(poLink).toBe('/owner/dashboard?tab=earnings&record=po-10');
    });

    it('routes withdrawals to /owner/dashboard?tab=withdrawals', () => {
      const wdLink = notificationDeepLink({ table: 'withdrawal_authorizations', record_id: 'wd-2' }, 'withdrawal_complete', 'owner');
      expect(wdLink).toBe('/owner/dashboard?tab=withdrawals&record=wd-2');
    });

    it('routes rent-to-own to /owner/dashboard?tab=rent-to-own', () => {
      const rtoLink = notificationDeepLink({ table: 'rent_to_own_agreements', record_id: 'rto-3' }, 'rto_offer', 'owner');
      expect(rtoLink).toBe('/owner/dashboard?tab=rent-to-own&record=rto-3');
    });

    it('routes pricing negotiations to /owner/dashboard?tab=pricing', () => {
      const priceLink = notificationDeepLink({ table: 'price_negotiations', record_id: 'neg-2' }, 'negotiation_new', 'owner');
      expect(priceLink).toBe('/owner/dashboard?tab=pricing&record=neg-2');
    });

    it('routes fleet vehicles and rentals to /owner/dashboard?tab=vehicles', () => {
      const vehLink = notificationDeepLink({ table: 'vehicles', record_id: 'veh-5' }, 'vehicle_verified', 'owner');
      expect(vehLink).toBe('/owner/dashboard?tab=vehicles&record=veh-5');
    });
  });

  describe('toRelativeDeepLink', () => {
    it('converts absolute rentmaikar.com URLs to relative paths', () => {
      expect(toRelativeDeepLink('https://rentmaikar.com/driver/dashboard?tab=payments&record=123')).toBe('/driver/dashboard?tab=payments&record=123');
      expect(toRelativeDeepLink('http://rentmaikar.com/owner/dashboard?tab=earnings')).toBe('/owner/dashboard?tab=earnings');
    });

    it('preserves already relative paths', () => {
      expect(toRelativeDeepLink('/driver/dashboard?tab=overview')).toBe('/driver/dashboard?tab=overview');
    });

    it('handles null, undefined, or empty values gracefully', () => {
      expect(toRelativeDeepLink(null)).toBeNull();
      expect(toRelativeDeepLink(undefined)).toBeNull();
      expect(toRelativeDeepLink('')).toBeNull();
    });
  });
});
