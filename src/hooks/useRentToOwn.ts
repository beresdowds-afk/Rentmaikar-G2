import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type RTOCurrency = 'USD' | 'NGN' | (string & {});

export interface RTOListing {
  id: string;
  vehicle_id: string;
  owner_id: string;
  total_price: number;
  down_payment: number;
  monthly_payment: number;
  duration_months: number;
  currency: RTOCurrency;
  allow_buyout: boolean;
  allow_conversion_to_rental: boolean;
  admin_counter_total_price: number | null;
  admin_counter_down_payment: number | null;
  admin_counter_monthly_payment: number | null;
  admin_counter_duration_months: number | null;
  admin_response: string | null;
  owner_message: string | null;
  final_total_price: number | null;
  final_down_payment: number | null;
  final_monthly_payment: number | null;
  final_duration_months: number | null;
  status: string;
  is_available: boolean;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  vehicle?: {
    id: string;
    make: string;
    model: string;
    year: number;
    license_plate: string;
  };
  owner_profile?: {
    full_name: string;
    email: string;
    phone: string | null;
  };
}

export interface RTOAgreement {
  id: string;
  listing_id: string;
  vehicle_id: string;
  driver_id: string;
  owner_id: string;
  total_price: number;
  down_payment: number;
  monthly_payment: number;
  duration_months: number;
  currency: RTOCurrency;
  allow_buyout: boolean;
  allow_conversion_to_rental: boolean;
  payments_made: number;
  total_amount_paid: number;
  next_payment_due: string | null;
  status: string;
  driver_signature: string | null;
  driver_signed_at: string | null;
  owner_signature: string | null;
  owner_signed_at: string | null;
  admin_witness_signature: string | null;
  admin_witnessed_at: string | null;
  admin_witness_id: string | null;
  agreement_content: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  vehicle?: {
    id: string;
    make: string;
    model: string;
    year: number;
    license_plate: string;
  };
  driver_profile?: {
    full_name: string;
    email: string;
    phone: string | null;
  };
  owner_profile?: {
    full_name: string;
    email: string;
    phone: string | null;
  };
}

export interface RTOSettings {
  id: string;
  feature_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface CreateRTOListingData {
  vehicle_id: string;
  total_price: number;
  down_payment: number;
  monthly_payment: number;
  duration_months: number;
  currency: RTOCurrency;
  allow_buyout: boolean;
  allow_conversion_to_rental: boolean;
  owner_message?: string;
}

export function useRentToOwn() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<RTOSettings | null>(null);
  const [listings, setListings] = useState<RTOListing[]>([]);
  const [agreements, setAgreements] = useState<RTOAgreement[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch RTO settings
  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('rent_to_own_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching RTO settings:', error);
      return;
    }
    setSettings(data);
  }, []);

  // Toggle feature on/off (admin only)
  const toggleFeature = async (enabled: boolean) => {
    if (!user) return;

    const { error } = await supabase
      .from('rent_to_own_settings')
      .update({ 
        feature_enabled: enabled,
        updated_by: user.id 
      })
      .eq('id', settings?.id);

    if (error) {
      toast.error('Failed to update settings');
      console.error(error);
      return;
    }

    setSettings(prev => prev ? { ...prev, feature_enabled: enabled } : prev);
    toast.success(`Rent to Own feature ${enabled ? 'enabled' : 'disabled'}`);
  };

  // Fetch listings based on role, with optional region filter for drivers
  const fetchListings = useCallback(async (role: 'admin' | 'owner' | 'driver', regionCurrency?: RTOCurrency) => {
    let query = supabase
      .from('rent_to_own_listings')
      .select(`
        *,
        vehicle:vehicles(id, make, model, year, license_plate, photo_urls),
        owner_profile:profiles!rent_to_own_listings_owner_id_fkey(full_name, email, phone)
      `)
      .order('created_at', { ascending: false });

    if (role === 'owner' && user) {
      query = query.eq('owner_id', user.id);
    } else if (role === 'driver') {
      query = query.eq('is_available', true).eq('status', 'active');
      // Filter by region currency to ensure drivers only see listings from their country
      if (regionCurrency) {
        query = query.eq('currency', regionCurrency);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching listings:', error);
      return;
    }

    // Type assertion since Supabase types don't know about joins
    setListings((data as unknown as RTOListing[]) || []);
  }, [user]);

  // Fetch agreements based on role
  const fetchAgreements = useCallback(async (role: 'admin' | 'owner' | 'driver') => {
    let query = supabase
      .from('rent_to_own_agreements')
      .select(`
        *,
        vehicle:vehicles(id, make, model, year, license_plate, photo_urls),
        driver_profile:profiles!rent_to_own_agreements_driver_id_fkey(full_name, email, phone),
        owner_profile:profiles!rent_to_own_agreements_owner_id_fkey(full_name, email, phone)
      `)
      .order('created_at', { ascending: false });

    if (role === 'owner' && user) {
      query = query.eq('owner_id', user.id);
    } else if (role === 'driver' && user) {
      query = query.eq('driver_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching agreements:', error);
      return;
    }

    setAgreements((data as unknown as RTOAgreement[]) || []);
  }, [user]);

  // Create a new listing (owner)
  const createListing = async (data: CreateRTOListingData) => {
    if (!user) return null;

    const { data: newListing, error } = await supabase
      .from('rent_to_own_listings')
      .insert({
        ...data,
        owner_id: user.id,
        status: 'pending',
        is_available: false,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create listing');
      console.error(error);
      return null;
    }

    toast.success('Rent to Own listing submitted for admin approval');
    return newListing;
  };

  // Accept counter offer (owner)
  const acceptCounterOffer = async (listingId: string) => {
    const listing = listings.find(l => l.id === listingId);
    if (!listing) return;

    const { error } = await supabase
      .from('rent_to_own_listings')
      .update({
        total_price: listing.admin_counter_total_price,
        down_payment: listing.admin_counter_down_payment,
        monthly_payment: listing.admin_counter_monthly_payment,
        duration_months: listing.admin_counter_duration_months,
        status: 'pending', // Back to pending for final approval
      })
      .eq('id', listingId);

    if (error) {
      toast.error('Failed to accept counter offer');
      return;
    }

    toast.success('Counter offer accepted. Awaiting final admin approval.');
    await fetchListings('owner');
  };

  // Send counter offer (admin)
  const sendCounterOffer = async (
    listingId: string,
    counterOffer: {
      total_price: number;
      down_payment: number;
      monthly_payment: number;
      duration_months: number;
    },
    response: string
  ) => {
    const { error } = await supabase
      .from('rent_to_own_listings')
      .update({
        admin_counter_total_price: counterOffer.total_price,
        admin_counter_down_payment: counterOffer.down_payment,
        admin_counter_monthly_payment: counterOffer.monthly_payment,
        admin_counter_duration_months: counterOffer.duration_months,
        admin_response: response,
        status: 'counter_offer',
      })
      .eq('id', listingId);

    if (error) {
      toast.error('Failed to send counter offer');
      return;
    }

    toast.success('Counter offer sent to owner');
    await fetchListings('admin');
  };

  // Approve listing (admin)
  const approveListing = async (listingId: string, response?: string) => {
    if (!user) return;

    const listing = listings.find(l => l.id === listingId);
    if (!listing) return;

    const { error } = await supabase
      .from('rent_to_own_listings')
      .update({
        status: 'active',
        is_available: true,
        final_total_price: listing.total_price,
        final_down_payment: listing.down_payment,
        final_monthly_payment: listing.monthly_payment,
        final_duration_months: listing.duration_months,
        admin_response: response || 'Approved',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      })
      .eq('id', listingId);

    if (error) {
      toast.error('Failed to approve listing');
      return;
    }

    toast.success('Listing approved and now available to drivers');
    await fetchListings('admin');
  };

  // Reject listing (admin)
  const rejectListing = async (listingId: string, reason: string) => {
    const { error } = await supabase
      .from('rent_to_own_listings')
      .update({
        status: 'rejected',
        is_available: false,
        admin_response: reason,
      })
      .eq('id', listingId);

    if (error) {
      toast.error('Failed to reject listing');
      return;
    }

    toast.success('Listing rejected');
    await fetchListings('admin');
  };

  // Toggle listing availability (admin)
  const toggleListingAvailability = async (listingId: string, isAvailable: boolean) => {
    const { error } = await supabase
      .from('rent_to_own_listings')
      .update({ is_available: isAvailable })
      .eq('id', listingId);

    if (error) {
      toast.error('Failed to update listing');
      return;
    }

    toast.success(`Listing ${isAvailable ? 'activated' : 'deactivated'}`);
    await fetchListings('admin');
  };

  // Create agreement (admin)
  const createAgreement = async (
    listingId: string,
    driverId: string,
    adminSignature: string
  ) => {
    if (!user) return null;

    const listing = listings.find(l => l.id === listingId);
    if (!listing) return null;

    const agreementContent = generateRTOAgreementContent(listing, driverId);

    const { data: newAgreement, error } = await supabase
      .from('rent_to_own_agreements')
      .insert({
        listing_id: listingId,
        vehicle_id: listing.vehicle_id,
        driver_id: driverId,
        owner_id: listing.owner_id,
        total_price: listing.final_total_price || listing.total_price,
        down_payment: listing.final_down_payment || listing.down_payment,
        monthly_payment: listing.final_monthly_payment || listing.monthly_payment,
        duration_months: listing.final_duration_months || listing.duration_months,
        currency: listing.currency,
        allow_buyout: listing.allow_buyout,
        allow_conversion_to_rental: listing.allow_conversion_to_rental,
        agreement_content: agreementContent,
        admin_witness_signature: adminSignature,
        admin_witnessed_at: new Date().toISOString(),
        admin_witness_id: user.id,
        status: 'pending_signatures',
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create agreement');
      console.error(error);
      return null;
    }

    // Deactivate the listing
    await supabase
      .from('rent_to_own_listings')
      .update({ is_available: false, status: 'completed' })
      .eq('id', listingId);

    toast.success('Rent to Own agreement created. Awaiting signatures.');
    return newAgreement;
  };

  // Sign agreement
  const signAgreement = async (agreementId: string, signature: string, role: 'driver' | 'owner') => {
    if (!user) return;

    const { error } = await supabase.rpc('sign_rent_to_own_agreement', {
      _agreement_id: agreementId,
      _signature: signature,
    });

    if (error) {
      toast.error('Failed to sign agreement');
      return;
    }

    toast.success('Agreement signed successfully');
    await fetchAgreements(role);
  };

  // Initialize data
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchSettings();
      setLoading(false);
    };
    init();
  }, [fetchSettings]);

  return {
    settings,
    listings,
    agreements,
    loading,
    toggleFeature,
    fetchSettings,
    fetchListings,
    fetchAgreements,
    createListing,
    acceptCounterOffer,
    sendCounterOffer,
    approveListing,
    rejectListing,
    toggleListingAvailability,
    createAgreement,
    signAgreement,
  };
}

// Helper to generate agreement content
function generateRTOAgreementContent(listing: RTOListing, _driverId: string): string {
  const totalPrice = listing.final_total_price || listing.total_price;
  const downPayment = listing.final_down_payment || listing.down_payment;
  const monthlyPayment = listing.final_monthly_payment || listing.monthly_payment;
  const durationMonths = listing.final_duration_months || listing.duration_months;
  const vehicle = listing.vehicle;

  return `
RENT TO OWN VEHICLE AGREEMENT

Agreement Date: ${new Date().toISOString()}

VEHICLE INFORMATION:
${vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle details pending'}
${vehicle ? `License Plate: ${vehicle.license_plate}` : ''}

FINANCIAL TERMS:
Total Purchase Price: ${listing.currency} ${totalPrice.toLocaleString()}
Down Payment: ${listing.currency} ${downPayment.toLocaleString()}
Monthly Payment: ${listing.currency} ${monthlyPayment.toLocaleString()}
Duration: ${durationMonths} months

EARLY EXIT OPTIONS:
- Buyout Option: ${listing.allow_buyout ? 'Available - Driver may pay remaining balance anytime to complete purchase' : 'Not available'}
- Conversion to Rental: ${listing.allow_conversion_to_rental ? 'Available - Driver may convert to standard rental, forfeiting ownership progress' : 'Not available'}

DEFAULT TERMS:
In case of payment default, the vehicle will be recovered by the owner. All payments made prior to default will be forfeited as rental charges.

This agreement is governed by the RentMaiKar Terms of Use and Privacy Policy.
  `.trim();
}
