import { supabase } from '@/integrations/supabase/client';

export type AuthorizationStatus = 'ACTIVE' | 'CANCELLED' | 'PENDING';
export type MatchingStatus = 'matching_pool_active' | 'driver_matched' | 'unlisted_cancelled' | 'pending';

export interface AuthorizationAuditEvent {
  id: string;
  action:
    | 'PUBLISHED_AND_AUTHORIZED'
    | 'CANCELLATION_LINK_ACCESSED'
    | 'AUTHORIZATION_CANCELLED'
    | 'AUTHORIZATION_REINSTATED'
    | 'ADMIN_ACCESSED_LOG'
    | 'DRIVER_POOL_MATCHED';
  performed_by: string;
  performed_by_name?: string;
  performed_by_role?: string;
  timestamp: string;
  notes?: string;
}

export interface VehicleRentalAuthorization {
  id: string;
  vehicle_id: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  license_plate: string;
  vin?: string | null;
  color?: string | null;
  pickup_city?: string | null;
  pickup_location?: string | null;
  photo_urls: string[];
  owner_id: string;
  owner_name: string;
  owner_email: string;
  owner_phone?: string | null;
  status: AuthorizationStatus;
  matching_status: MatchingStatus;
  matched_driver_id?: string | null;
  matched_driver_name?: string | null;
  authorization_text: string;
  terms_version: string;
  authorized_at: string;
  ip_address?: string;
  user_agent?: string;
  cancellation_token: string;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  audit_trail: AuthorizationAuditEvent[];
}

export const LEGAL_AUTHORIZATION_TEXT = 
  "By clicking the publish button, you as the owner are granting Rentmaikar the permission to list the vehicle for rentals, match the vehicle to suitable drivers from our verified drivers pool, and you are committed to handing over the vehicle to the matched Driver. Rentmaikar is authorized to market the vehicle photos, specifications, and availability on the public Catalogue and execute reservation agreements with verified drivers in accordance with Rentmaikar platform terms.";

const TABLE = 'vehicle_rental_authorizations';
const BROADCAST_EVENT = 'rentmaikar:vehicle_authorization_updated';

// Untyped accessor: the generated Supabase types may lag behind new tables.
const db = () => (supabase as any).from(TABLE);

function broadcast(count: number) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BROADCAST_EVENT, { detail: { count } }));
  }
}

function generateAuthId(prefix = 'AUTH-VEH'): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${year}-${rand}`;
}

function generateToken(): string {
  return `${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
}

function mapRow(row: any): VehicleRentalAuthorization {
  return {
    ...row,
    photo_urls: Array.isArray(row?.photo_urls) ? row.photo_urls : [],
    audit_trail: Array.isArray(row?.audit_trail) ? row.audit_trail : [],
  } as VehicleRentalAuthorization;
}

/**
 * Get all authorizations the current user is allowed to see, with optional filtering.
 * Records live in the database, so they are shared across devices and browsers.
 */
export async function getVehicleAuthorizations(filters?: {
  search?: string;
  status?: AuthorizationStatus | 'ALL';
  vehicleId?: string;
  ownerId?: string;
}): Promise<VehicleRentalAuthorization[]> {
  let query = db().select('*').order('authorized_at', { ascending: false });

  if (filters?.vehicleId) query = query.eq('vehicle_id', filters.vehicleId);
  if (filters?.ownerId) query = query.eq('owner_id', filters.ownerId);
  if (filters?.status && filters.status !== 'ALL') query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to load vehicle authorizations:', error);
    return [];
  }

  const list = (data || []).map(mapRow);

  if (!filters?.search || !filters.search.trim()) return list;

  const q = filters.search.toLowerCase().trim();
  return list.filter((item) =>
    [
      item.id,
      item.vehicle_make,
      item.vehicle_model,
      item.license_plate,
      item.vin,
      item.owner_name,
      item.owner_email,
    ]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q))
  );
}

/**
 * Find single authorization by vehicle ID.
 */
export async function getAuthorizationByVehicleId(vehicleId: string): Promise<VehicleRentalAuthorization | null> {
  const { data, error } = await db().select('*').eq('vehicle_id', vehicleId).maybeSingle();
  if (error) {
    console.error('Failed to load authorization for vehicle:', error);
    return null;
  }
  return data ? mapRow(data) : null;
}

/**
 * Find single authorization by cancellation token.
 * Uses a token-gated RPC so the link works on any device, signed in or not.
 */
export async function getAuthorizationByToken(token: string): Promise<VehicleRentalAuthorization | null> {
  const { data, error } = await (supabase as any).rpc('get_authorization_by_token', { p_token: token });
  if (error) {
    console.error('Failed to resolve authorization token:', error);
    return null;
  }
  return data ? mapRow(data) : null;
}


export interface PublishAndAuthorizeParams {
  vehicleId: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  licensePlate: string;
  vin?: string | null;
  color?: string | null;
  pickupCity?: string | null;
  pickupLocation?: string | null;
  pickupAddress?: string | null;
  pickupInstructions?: string | null;
  photoUrls: string[];
  ownerId: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  customNotes?: string;
}

/**
 * Executes the full publish and authorization workflow:
 * 1. Updates vehicle record in database (is_public: true, status: 'available', pickup details)
 * 2. Creates/updates authorization record in authorization log database
 * 3. Sends in-app authorization notification message with the cancellation link
 * 4. Logs initial audit event
 */
export async function publishAndAuthorizeVehicle(
  params: PublishAndAuthorizeParams
): Promise<{ success: boolean; authorization: VehicleRentalAuthorization; cancellationUrl: string }> {
  const now = new Date().toISOString();
  const cancellationToken = generateToken();
  const authId = generateAuthId();

  const effectivePickupLocation = params.pickupLocation || params.pickupAddress || null;
  const effectivePickupAddress = params.pickupAddress || params.pickupLocation || null;

  // 1. Update vehicle row in database to make it public on Catalogue with pickup location
  try {
    await supabase
      .from('vehicles')
      .update({
        is_public: true,
        status: 'available',
        photo_urls: params.photoUrls,
        pickup_city: params.pickupCity || null,
        pickup_location: effectivePickupLocation,
        pickup_address: effectivePickupAddress,
        pickup_instructions: params.pickupInstructions || null,
        updated_at: now,
      } as never)
      .eq('id', params.vehicleId);
  } catch (err) {
    console.warn('Could not update vehicle table via supabase, proceeding with authorization record:', err);
  }

  // 2. Build or update authorization record in the shared database
  const existing = await getAuthorizationByVehicleId(params.vehicleId);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const cancellationUrl = `${origin}/cancel-authorization/${cancellationToken}`;

  const newAuthRecord: VehicleRentalAuthorization = {
    id: existing?.id || authId,
    vehicle_id: params.vehicleId,
    vehicle_make: params.vehicleMake,
    vehicle_model: params.vehicleModel,
    vehicle_year: params.vehicleYear,
    license_plate: params.licensePlate,
    vin: params.vin || null,
    color: params.color || null,
    pickup_city: params.pickupCity || null,
    pickup_location: effectivePickupLocation,
    photo_urls: params.photoUrls,
    owner_id: params.ownerId,
    owner_name: params.ownerName || 'Vehicle Owner',
    owner_email: params.ownerEmail || '',
    owner_phone: params.ownerPhone || null,
    status: 'ACTIVE',
    matching_status: 'matching_pool_active',
    authorization_text: LEGAL_AUTHORIZATION_TEXT,
    terms_version: 'v2026.1',
    authorized_at: now,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Browser Client',
    cancellation_token: cancellationToken,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    audit_trail: [
      ...(existing?.audit_trail || []),
      {
        id: `AUD-${Date.now()}`,
        action: 'PUBLISHED_AND_AUTHORIZED',
        performed_by: params.ownerId,
        performed_by_name: params.ownerName || 'Vehicle Owner',
        performed_by_role: 'owner',
        timestamp: now,
        notes: `Published vehicle pictures to Catalogue with pickup location in ${params.pickupCity || 'specified area'} (${effectivePickupAddress || ''}). Granted rental listing permission, verified driver pool matching authorization, and handover commitment. ${params.customNotes || ''}`.trim(),
      },
    ],
  };

  const { error: upsertError } = await db().upsert(newAuthRecord, { onConflict: 'vehicle_id' });
  if (upsertError) {
    console.error('Failed to persist vehicle authorization:', upsertError);
    throw new Error(upsertError.message || 'Could not save the vehicle rental authorization record.');
  }

  broadcast(1);

  // 3. Send authorization notification message with cancellation link to Owner's inbox
  await sendAuthorizationNotificationMessage({
    ownerId: params.ownerId,
    authorization: newAuthRecord,
    cancellationUrl,
  });

  return {
    success: true,
    authorization: newAuthRecord,
    cancellationUrl,
  };
}


export interface CancelAuthorizationParams {
  cancellationToken?: string;
  authorizationId?: string;
  vehicleId?: string;
  cancelledByUserId: string;
  cancelledByName?: string;
  cancelledByRole?: string;
  reason?: string;
}

/**
 * Handles authorization revocation / cancellation:
 * 1. Unpublishes vehicle from Catalogue (is_public: false)
 * 2. Updates authorization status to CANCELLED in database
 * 3. Records detailed cancellation audit event (timestamp, user, reason)
 * 4. Sends cancellation confirmation notification
 */
export async function cancelVehicleAuthorization(
  params: CancelAuthorizationParams
): Promise<{ success: boolean; authorization: VehicleRentalAuthorization | null; message: string }> {
  const reasonText = params.reason || 'Published by mistake / Owner requested cancellation';

  // Resolve the target record (token first — it works for link holders on any device)
  let token = params.cancellationToken || null;
  if (!token) {
    let lookup = db().select('cancellation_token').limit(1);
    if (params.authorizationId) lookup = lookup.eq('id', params.authorizationId);
    else if (params.vehicleId) lookup = lookup.eq('vehicle_id', params.vehicleId);
    const { data } = await lookup.maybeSingle();
    token = data?.cancellation_token || null;
  }

  if (!token) {
    return {
      success: false,
      authorization: null,
      message: 'Vehicle rental authorization record not found.',
    };
  }

  // The RPC cancels the authorization, appends the audit event and unpublishes the vehicle atomically.
  const { data: result, error } = await (supabase as any).rpc('cancel_authorization_by_token', {
    p_token: token,
    p_reason: reasonText,
    p_by_name: params.cancelledByName || 'Vehicle Owner / Admin',
  });

  if (error || !result?.success) {
    return {
      success: false,
      authorization: null,
      message: error?.message || result?.message || 'Vehicle rental authorization record not found.',
    };
  }

  const updatedRecord = mapRow(result.authorization);
  broadcast(1);

  await sendCancellationAcknowledgmentMessage({
    ownerId: updatedRecord.owner_id,
    authorization: updatedRecord,
    reason: reasonText,
  });

  return {
    success: true,
    authorization: updatedRecord,
    message: result.message || 'Vehicle rental authorization has been successfully cancelled and removed from the active catalogue.',
  };
}


/**
 * Sends in-app authorization message to the Owner's inbox containing the confirmation and cancellation link.
 */
async function sendAuthorizationNotificationMessage({
  ownerId,
  authorization,
  cancellationUrl,
}: {
  ownerId: string;
  authorization: VehicleRentalAuthorization;
  cancellationUrl: string;
}) {
  const subject = `Vehicle Rental Authorization Confirmation – ${authorization.vehicle_year} ${authorization.vehicle_make} ${authorization.vehicle_model} (${authorization.license_plate})`;
  const content = `🚗 RENTMAIKAR VEHICLE RENTAL AUTHORIZATION CONFIRMATION

Vehicle: ${authorization.vehicle_year} ${authorization.vehicle_make} ${authorization.vehicle_model}
License Plate: ${authorization.license_plate}
Authorization Ref: ${authorization.id}
Date Authorized: ${new Date(authorization.authorized_at).toLocaleString()}
Status: ACTIVE (Listed in Public Catalogue & Matching Pool)

GRANT OF PERMISSION & COMMITMENT:
By publishing this vehicle, you have granted Rentmaikar the permission to list the vehicle for rentals on our public Catalogue, match the vehicle to suitable drivers from our verified driver pool, and you are committed to handing over the vehicle to the matched Driver upon agreement.

MISTAKE CANCELLATION:
If you published this vehicle in error or wish to cancel this rental authorization immediately, please use the secure cancellation link below:

🔗 Cancellation Link: ${cancellationUrl}

All cancellations are logged instantly in our admin compliance registry.`;

  try {
    // Try creating or finding an inbox conversation
    let convId: string | null = null;
    const { data: convs } = await supabase
      .from('inbox_conversations')
      .select('id')
      .eq('user_id', ownerId)
      .eq('channel', 'system_authorization')
      .limit(1);

    if (convs && convs.length > 0) {
      convId = convs[0].id;
    } else {
      const { data: newConv } = await supabase
        .from('inbox_conversations')
        .insert({
          user_id: ownerId,
          subject: 'Vehicle Rental Authorizations & Listings',
          channel: 'system_authorization',
          status: 'active',
          last_message_at: new Date().toISOString(),
        } as never)
        .select('id')
        .single();
      if (newConv) convId = (newConv as any).id;
    }

    if (convId) {
      await supabase.from('inbox_messages').insert({
        conversation_id: convId,
        content,
        sender_type: 'admin',
        sender_name: 'Rentmaikar Authorization Desk',
        metadata: {
          authorization_id: authorization.id,
          vehicle_id: authorization.vehicle_id,
          cancellation_url: cancellationUrl,
          type: 'vehicle_rental_authorization',
        },
      } as never);
    }
  } catch (err) {
    console.warn('Could not post inbox message to database:', err);
  }
}

/**
 * Sends acknowledgment in-app message when an authorization is cancelled.
 */
async function sendCancellationAcknowledgmentMessage({
  ownerId,
  authorization,
  reason,
}: {
  ownerId: string;
  authorization: VehicleRentalAuthorization;
  reason: string;
}) {
  const content = `🛑 VEHICLE RENTAL AUTHORIZATION CANCELLED

Vehicle: ${authorization.vehicle_year} ${authorization.vehicle_make} ${authorization.vehicle_model} (${authorization.license_plate})
Authorization Ref: ${authorization.id}
Cancelled At: ${new Date().toLocaleString()}
Reason: ${reason}

Your vehicle has been unpublished from the Rentmaikar public Catalogue and withdrawn from the verified driver matching pool. This cancellation has been recorded in the Admin Vehicle Authorization Log.`;

  try {
    const { data: convs } = await supabase
      .from('inbox_conversations')
      .select('id')
      .eq('user_id', ownerId)
      .limit(1);

    if (convs && convs.length > 0) {
      await supabase.from('inbox_messages').insert({
        conversation_id: convs[0].id,
        content,
        sender_type: 'admin',
        sender_name: 'Rentmaikar Compliance Log',
        metadata: {
          authorization_id: authorization.id,
          vehicle_id: authorization.vehicle_id,
          type: 'authorization_cancellation_receipt',
        },
      } as never);
    }
  } catch (err) {
    console.warn('Could not post cancellation acknowledgment:', err);
  }
}
