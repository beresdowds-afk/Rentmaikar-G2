import { supabase } from '@/integrations/supabase/client';
import { ROLE_HOME, isStaffRole, type AppRole } from '@/lib/role-home';

export const AGREEMENT_SIGNING_PATH = '/onboarding/legal-agreement';

/**
 * Returns true when the signed-in driver/owner has an agreement that is still
 * waiting on *their* signature. Those users are routed to the agreement page
 * instead of their dashboard so the blocking step is the first thing they see.
 */
export async function hasPendingAgreementSignature(
  userId: string,
  role: 'driver' | 'owner',
): Promise<boolean> {
  const partyColumn = role === 'driver' ? 'driver_id' : 'owner_id';
  const signatureColumn = role === 'driver' ? 'driver_signature' : 'owner_signature';

  const { data, error } = await supabase
    .from('legal_agreements')
    .select('id')
    .eq(partyColumn, userId)
    .in('status', ['pending', 'pending_signature', 'awaiting_signature', 'active'])
    .is(signatureColumn, null)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Role-based landing route after login.
 * - Staff roles land on their operations dashboard.
 * - Drivers/owners land on the agreement page when a signature is outstanding,
 *   otherwise on their own dashboard.
 */
export async function resolvePostLoginDestination(
  userId: string,
  role: AppRole | null,
  fallback = '/',
): Promise<string> {
  if (!role) return fallback;
  const home = ROLE_HOME[role] ?? fallback;
  if (isStaffRole(role)) return home;
  if (role !== 'driver' && role !== 'owner') return home;

  try {
    const pending = await hasPendingAgreementSignature(userId, role);
    return pending ? AGREEMENT_SIGNING_PATH : home;
  } catch {
    return home;
  }
}
