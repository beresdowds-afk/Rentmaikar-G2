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
    if (role === 'driver') {
      // Check if agreement is pending
      const { data: driver } = await supabase
        .from('legal_agreements')
        .select('driver_signed_at')
        .eq('driver_id', userId)
        .is('driver_signed_at', null)
        .limit(1);

      if (driver?.length) {
        return '/driver-agreement';
      }
    } else if (role === 'owner') {
      const { data: owner } = await supabase
        .from('legal_agreements')
        .select('owner_signed_at')
        .eq('owner_id', userId)
        .is('owner_signed_at', null)
        .limit(1);

      if (owner?.length) {
        return '/owner-agreement';
      }
    }
  } catch (err) {
    console.warn('Error resolving post-login destination:', err);
  }

  return homeForRole(role, fallbackPath);
}
