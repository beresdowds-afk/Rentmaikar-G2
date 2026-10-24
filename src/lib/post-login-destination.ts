import { supabase } from '@/integrations/supabase/client';
import { homeForRole, isStaffRole, type AppRole } from '@/lib/role-home';

export async function resolvePostLoginDestination(
  userId: string,
  role?: AppRole | null,
  fallbackPath = '/'
): Promise<string> {
  if (!role) return fallbackPath || '/';
  if (isStaffRole(role)) {
    return homeForRole(role, fallbackPath);
  }

  try {
    if (role === 'driver' || role === 'owner') {
      // Pending compulsory agreement awaiting this user's signature
      const signerColumn = role === 'driver' ? 'driver_id' : 'owner_id';
      const signedColumn = role === 'driver' ? 'driver_signed_at' : 'owner_signed_at';
      const { data: pending } = await supabase
        .from('legal_agreements')
        .select('id')
        .eq(signerColumn, userId)
        .eq('status', 'pending')
        .eq('is_compulsory', true)
        .is(signedColumn, null)
        .limit(1);

      if (pending && pending.length > 0) {
        return role === 'driver' ? '/legal/driver-agreement' : '/onboarding/legal-agreement';
      }
    }
  } catch (err) {
    console.warn('Error resolving post-login destination:', err);
  }

  return homeForRole(role, fallbackPath);
}
