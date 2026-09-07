import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Assigned workload for the Admin and Admin Assistant dashboards.
 *
 * Assistants see only the drivers, owners and vehicles explicitly assigned to
 * them (admin_assistant_user_assignments / admin_assistant_vehicle_assignments)
 * plus the active agreements those people or vehicles are party to.
 * Full admins see the whole active book of work.
 */

export interface WorkloadPerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  role: 'driver' | 'owner' | 'user';
}

export interface WorkloadVehicle {
  id: string;
  label: string;
  licensePlate: string | null;
  status: string | null;
  pickupCity: string | null;
  ownerId: string | null;
}

export interface WorkloadAgreement {
  id: string;
  agreementType: string;
  status: string;
  driverId: string;
  ownerId: string;
  vehicleId: string | null;
  driverSignedAt: string | null;
  ownerSignedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface AssignedWorkload {
  scope: 'admin' | 'assistant';
  drivers: WorkloadPerson[];
  owners: WorkloadPerson[];
  vehicles: WorkloadVehicle[];
  agreements: WorkloadAgreement[];
  /** Display names keyed by user id, for agreement rows. */
  names: Record<string, string>;
  /** Vehicle labels keyed by vehicle id, for agreement rows. */
  vehicleLabels: Record<string, string>;
}

const ACTIVE_AGREEMENT_STATUSES = ['pending', 'pending_signature', 'partially_signed', 'signed', 'active'];

const emptyWorkload = (scope: 'admin' | 'assistant'): AssignedWorkload => ({
  scope,
  drivers: [],
  owners: [],
  vehicles: [],
  agreements: [],
  names: {},
  vehicleLabels: {},
});

const vehicleLabel = (v: { year?: number | null; make?: string | null; model?: string | null }) =>
  [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';

export function useAssignedWorkload(isFullAdmin: boolean) {
  const { user } = useAuth();

  return useQuery<AssignedWorkload>({
    queryKey: ['assigned-workload', user?.id ?? null, isFullAdmin],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const scope: 'admin' | 'assistant' = isFullAdmin ? 'admin' : 'assistant';
      if (!user?.id) return emptyWorkload(scope);

      let userIds: string[] = [];
      let vehicleIds: string[] = [];

      if (!isFullAdmin) {
        const [userAssign, vehicleAssign] = await Promise.all([
          supabase
            .from('admin_assistant_user_assignments')
            .select('target_user_id')
            .eq('assistant_id', user.id),
          supabase
            .from('admin_assistant_vehicle_assignments')
            .select('vehicle_id')
            .eq('assistant_id', user.id),
        ]);
        userIds = (userAssign.data ?? []).map((r) => r.target_user_id);
        vehicleIds = (vehicleAssign.data ?? []).map((r) => r.vehicle_id);
        if (!userIds.length && !vehicleIds.length) return emptyWorkload(scope);
      }

      // ── People ────────────────────────────────────────────────────────────
      let profileQuery = supabase
        .from('profiles')
        .select('id, full_name, email, phone, city')
        .order('full_name', { ascending: true });
      if (!isFullAdmin) profileQuery = profileQuery.in('id', userIds);
      else profileQuery = profileQuery.limit(200);

      const { data: profileRows } = await profileQuery;
      const profileIds = (profileRows ?? []).map((p) => p.id);

      const { data: roleRows } = profileIds.length
        ? await supabase.from('user_roles').select('user_id, role').in('user_id', profileIds)
        : { data: [] as { user_id: string; role: string }[] };

      const roleByUser = new Map<string, string>();
      (roleRows ?? []).forEach((r) => {
        const existing = roleByUser.get(r.user_id);
        if (!existing || r.role === 'driver' || r.role === 'owner') roleByUser.set(r.user_id, r.role);
      });

      const people: WorkloadPerson[] = (profileRows ?? []).map((p) => {
        const role = roleByUser.get(p.id);
        return {
          id: p.id,
          name: p.full_name || p.email || 'Unnamed user',
          email: p.email ?? null,
          phone: p.phone ?? null,
          city: p.city ?? null,
          role: role === 'driver' ? 'driver' : role === 'owner' ? 'owner' : 'user',
        };
      });

      const drivers = people.filter((p) => p.role === 'driver');
      const owners = people.filter((p) => p.role === 'owner');

      // ── Vehicles ──────────────────────────────────────────────────────────
      let vehicleQuery = supabase
        .from('vehicles')
        .select('id, make, model, year, license_plate, status, pickup_city, owner_id')
        .order('created_at', { ascending: false });
      if (!isFullAdmin) {
        const ownedByAssigned = owners.map((o) => o.id);
        const orFilters = [
          vehicleIds.length ? `id.in.(${vehicleIds.join(',')})` : null,
          ownedByAssigned.length ? `owner_id.in.(${ownedByAssigned.join(',')})` : null,
        ].filter(Boolean) as string[];
        if (!orFilters.length) {
          vehicleQuery = vehicleQuery.eq('id', '00000000-0000-0000-0000-000000000000');
        } else {
          vehicleQuery = vehicleQuery.or(orFilters.join(','));
        }
      } else {
        vehicleQuery = vehicleQuery.limit(200);
      }

      const { data: vehicleRows } = await vehicleQuery;
      const vehicles: WorkloadVehicle[] = (vehicleRows ?? []).map((v) => ({
        id: v.id,
        label: vehicleLabel(v),
        licensePlate: v.license_plate ?? null,
        status: v.status ?? null,
        pickupCity: v.pickup_city ?? null,
        ownerId: v.owner_id ?? null,
      }));

      // ── Active agreements ─────────────────────────────────────────────────
      let agreementQuery = supabase
        .from('legal_agreements')
        .select(
          'id, agreement_type, status, driver_id, owner_id, vehicle_id, driver_signed_at, owner_signed_at, created_at, expires_at',
        )
        .in('status', ACTIVE_AGREEMENT_STATUSES)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!isFullAdmin) {
        const partyIds = Array.from(new Set([...userIds, ...owners.map((o) => o.id)]));
        const allVehicleIds = Array.from(new Set([...vehicleIds, ...vehicles.map((v) => v.id)]));
        const orFilters = [
          partyIds.length ? `driver_id.in.(${partyIds.join(',')})` : null,
          partyIds.length ? `owner_id.in.(${partyIds.join(',')})` : null,
          allVehicleIds.length ? `vehicle_id.in.(${allVehicleIds.join(',')})` : null,
        ].filter(Boolean) as string[];
        if (!orFilters.length) return { ...emptyWorkload(scope), drivers, owners, vehicles };
        agreementQuery = agreementQuery.or(orFilters.join(','));
      }

      const { data: agreementRows } = await agreementQuery;
      const agreements: WorkloadAgreement[] = (agreementRows ?? []).map((a) => ({
        id: a.id,
        agreementType: a.agreement_type,
        status: a.status,
        driverId: a.driver_id,
        ownerId: a.owner_id,
        vehicleId: a.vehicle_id ?? null,
        driverSignedAt: a.driver_signed_at ?? null,
        ownerSignedAt: a.owner_signed_at ?? null,
        createdAt: a.created_at,
        expiresAt: a.expires_at ?? null,
      }));

      // Resolve any agreement party not already loaded above.
      const knownNames: Record<string, string> = {};
      people.forEach((p) => { knownNames[p.id] = p.name; });
      const missing = Array.from(
        new Set(
          agreements
            .flatMap((a) => [a.driverId, a.ownerId])
            .filter((id) => id && !knownNames[id]),
        ),
      );
      if (missing.length) {
        const { data: extra } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', missing);
        (extra ?? []).forEach((p) => {
          knownNames[p.id] = p.full_name || p.email || 'Unnamed user';
        });
      }

      const vehicleLabels: Record<string, string> = {};
      vehicles.forEach((v) => { vehicleLabels[v.id] = v.label; });
      const missingVehicles = Array.from(
        new Set(agreements.map((a) => a.vehicleId).filter((id): id is string => !!id && !vehicleLabels[id])),
      );
      if (missingVehicles.length) {
        const { data: extraVehicles } = await supabase
          .from('vehicles')
          .select('id, make, model, year')
          .in('id', missingVehicles);
        (extraVehicles ?? []).forEach((v) => { vehicleLabels[v.id] = vehicleLabel(v); });
      }

      return { scope, drivers, owners, vehicles, agreements, names: knownNames, vehicleLabels };
    },
  });
}
